use serde::Serialize;
use similar::{ChangeTag, TextDiff};

/// A character span within a line that differs (for inline highlighting).
#[derive(Serialize, Clone)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

#[derive(Serialize, Clone)]
pub struct Cell {
    pub line_no: Option<usize>,
    pub text: String,
    /// inline highlight ranges (char offsets) for changed portions
    pub spans: Vec<Span>,
}

/// One aligned row across the two panes.
#[derive(Serialize)]
pub struct Row {
    /// equal | insert | delete | change
    pub kind: String,
    pub left: Option<Cell>,
    pub right: Option<Cell>,
}

#[derive(Serialize, Clone)]
pub struct FileMeta {
    pub size: u64,
    pub mtime: i64,
}

#[derive(Serialize)]
pub struct DiffResult {
    pub rows: Vec<Row>,
    pub added: u32,
    pub removed: u32,
    pub changed: u32,
    pub left_meta: Option<FileMeta>,
    pub right_meta: Option<FileMeta>,
}

/// Normalize a line for whitespace-insensitive comparison: trim ends and
/// collapse internal runs of whitespace to a single space.
fn normalize_ws(line: &str) -> String {
    line.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn plain(line_no: usize, text: &str) -> Cell {
    Cell {
        line_no: Some(line_no),
        text: text.to_string(),
        spans: vec![],
    }
}

/// Compute char-level spans for a changed pair of lines.
fn inline_spans(a: &str, b: &str) -> (Vec<Span>, Vec<Span>) {
    let diff = TextDiff::from_chars(a, b);
    let mut left_spans = vec![];
    let mut right_spans = vec![];
    let mut li = 0usize;
    let mut ri = 0usize;
    for change in diff.iter_all_changes() {
        let len = change.value().chars().count();
        match change.tag() {
            ChangeTag::Equal => {
                li += len;
                ri += len;
            }
            ChangeTag::Delete => {
                left_spans.push(Span {
                    start: li,
                    end: li + len,
                });
                li += len;
            }
            ChangeTag::Insert => {
                right_spans.push(Span {
                    start: ri,
                    end: ri + len,
                });
                ri += len;
            }
        }
    }
    (left_spans, right_spans)
}

pub fn diff_text(left: &str, right: &str, ignore_whitespace: bool) -> DiffResult {
    let left_lines: Vec<&str> = left.lines().collect();
    let right_lines: Vec<&str> = right.lines().collect();

    // Compute alignment on normalized text when ignoring whitespace, but always
    // display the original lines. Line counts are preserved so indices map 1:1.
    let (lsrc, rsrc): (String, String) = if ignore_whitespace {
        (
            left_lines
                .iter()
                .map(|l| normalize_ws(l))
                .collect::<Vec<_>>()
                .join("\n"),
            right_lines
                .iter()
                .map(|l| normalize_ws(l))
                .collect::<Vec<_>>()
                .join("\n"),
        )
    } else {
        (left.to_string(), right.to_string())
    };
    let diff = TextDiff::from_lines(&lsrc, &rsrc);

    let mut rows = Vec::new();
    let mut added = 0u32;
    let mut removed = 0u32;
    let mut changed = 0u32;

    for op in diff.ops() {
        use similar::DiffOp::*;
        match *op {
            Equal {
                old_index,
                new_index,
                len,
            } => {
                for i in 0..len {
                    let lno = old_index + i;
                    let rno = new_index + i;
                    rows.push(Row {
                        kind: "equal".into(),
                        left: Some(plain(lno + 1, left_lines.get(lno).copied().unwrap_or(""))),
                        right: Some(plain(rno + 1, right_lines.get(rno).copied().unwrap_or(""))),
                    });
                }
            }
            Delete {
                old_index,
                old_len,
                ..
            } => {
                for i in 0..old_len {
                    let lno = old_index + i;
                    removed += 1;
                    rows.push(Row {
                        kind: "delete".into(),
                        left: Some(plain(lno + 1, left_lines.get(lno).copied().unwrap_or(""))),
                        right: None,
                    });
                }
            }
            Insert {
                new_index,
                new_len,
                ..
            } => {
                for i in 0..new_len {
                    let rno = new_index + i;
                    added += 1;
                    rows.push(Row {
                        kind: "insert".into(),
                        left: None,
                        right: Some(plain(rno + 1, right_lines.get(rno).copied().unwrap_or(""))),
                    });
                }
            }
            Replace {
                old_index,
                old_len,
                new_index,
                new_len,
            } => {
                let pairs = old_len.max(new_len);
                for i in 0..pairs {
                    let l = if i < old_len {
                        Some(old_index + i)
                    } else {
                        None
                    };
                    let r = if i < new_len {
                        Some(new_index + i)
                    } else {
                        None
                    };
                    match (l, r) {
                        (Some(lno), Some(rno)) => {
                            changed += 1;
                            let lt = left_lines.get(lno).copied().unwrap_or("");
                            let rt = right_lines.get(rno).copied().unwrap_or("");
                            let (ls, rs) = inline_spans(lt, rt);
                            rows.push(Row {
                                kind: "change".into(),
                                left: Some(Cell {
                                    line_no: Some(lno + 1),
                                    text: lt.to_string(),
                                    spans: ls,
                                }),
                                right: Some(Cell {
                                    line_no: Some(rno + 1),
                                    text: rt.to_string(),
                                    spans: rs,
                                }),
                            });
                        }
                        (Some(lno), None) => {
                            removed += 1;
                            rows.push(Row {
                                kind: "delete".into(),
                                left: Some(plain(
                                    lno + 1,
                                    left_lines.get(lno).copied().unwrap_or(""),
                                )),
                                right: None,
                            });
                        }
                        (None, Some(rno)) => {
                            added += 1;
                            rows.push(Row {
                                kind: "insert".into(),
                                left: None,
                                right: Some(plain(
                                    rno + 1,
                                    right_lines.get(rno).copied().unwrap_or(""),
                                )),
                            });
                        }
                        (None, None) => {}
                    }
                }
            }
        }
    }

    DiffResult {
        rows,
        added,
        removed,
        changed,
        left_meta: None,
        right_meta: None,
    }
}
