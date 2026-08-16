use diffy::{merge, ConflictStyle, MergeOptions};
use serde::Serialize;

/// A region of the merged output.
#[derive(Serialize)]
pub struct Region {
    /// clean | conflict
    pub kind: String,
    /// resolved/clean text (for clean regions), or the auto-merged suggestion
    pub text: String,
    /// for conflict regions: the three candidate texts
    pub left: Option<String>,
    pub base: Option<String>,
    pub right: Option<String>,
}

#[derive(Serialize)]
pub struct MergeResult {
    pub regions: Vec<Region>,
    pub conflicts: u32,
    /// convenience: full text with git-style conflict markers
    pub merged_text: String,
    pub clean: bool,
}

/// Perform a 3-way merge of `left` (ours) and `right` (theirs) against `base`.
pub fn merge3(base: &str, left: &str, right: &str) -> MergeResult {
    let mut opts = MergeOptions::new();
    opts.set_conflict_style(ConflictStyle::Diff3);
    let (merged_text, clean) = match opts.merge(base, left, right) {
        Ok(m) => (m, true),
        Err(m) => (m, false),
    };
    // also compute a marker-only merge for parsing regions
    let marker_text = match merge(base, left, right) {
        Ok(m) => m,
        Err(m) => m,
    };
    let regions = parse_regions(&marker_text);
    let conflicts = regions.iter().filter(|r| r.kind == "conflict").count() as u32;
    MergeResult {
        regions,
        conflicts,
        merged_text,
        clean,
    }
}

/// Parse git-style conflict markers into structured regions.
fn parse_regions(text: &str) -> Vec<Region> {
    let mut regions = Vec::new();
    let mut clean_buf: Vec<&str> = Vec::new();

    let flush_clean = |buf: &mut Vec<&str>, out: &mut Vec<Region>| {
        if !buf.is_empty() {
            out.push(Region {
                kind: "clean".into(),
                text: buf.join("\n"),
                left: None,
                base: None,
                right: None,
            });
            buf.clear();
        }
    };

    let mut lines = text.lines().peekable();
    while let Some(line) = lines.next() {
        if line.starts_with("<<<<<<<") {
            flush_clean(&mut clean_buf, &mut regions);
            let mut left = Vec::new();
            let mut base = Vec::new();
            let mut right = Vec::new();
            let mut phase = 0; // 0=left, 1=base, 2=right
            for l in lines.by_ref() {
                if l.starts_with("|||||||") {
                    phase = 1;
                } else if l.starts_with("=======") {
                    phase = 2;
                } else if l.starts_with(">>>>>>>") {
                    break;
                } else {
                    match phase {
                        0 => left.push(l),
                        1 => base.push(l),
                        _ => right.push(l),
                    }
                }
            }
            regions.push(Region {
                kind: "conflict".into(),
                text: left.join("\n"),
                left: Some(left.join("\n")),
                base: Some(base.join("\n")),
                right: Some(right.join("\n")),
            });
        } else {
            clean_buf.push(line);
        }
    }
    flush_clean(&mut clean_buf, &mut regions);
    regions
}
