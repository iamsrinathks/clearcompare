use rayon::prelude::*;
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Serialize, Clone)]
pub struct SideMeta {
    pub size: u64,
    /// modification time in ms since epoch
    pub mtime: i64,
}

/// One row in a folder comparison, forming a tree via `children`.
#[derive(Serialize)]
pub struct Node {
    pub name: String,
    pub rel_path: String,
    pub is_dir: bool,
    pub left: Option<SideMeta>,
    pub right: Option<SideMeta>,
    /// same | different | left_newer | right_newer | left_only | right_only
    pub status: String,
    pub children: Vec<Node>,
    /// aggregate: how many differing files live under this node (dirs only)
    pub diff_count: u32,
}

#[derive(Serialize)]
pub struct FolderCompareResult {
    pub left_root: String,
    pub right_root: String,
    pub root: Vec<Node>,
    pub stats: Stats,
}

#[derive(Serialize, Default)]
pub struct Stats {
    pub same: u32,
    pub different: u32,
    pub left_only: u32,
    pub right_only: u32,
    pub newer: u32,
}

struct RawEntry {
    #[allow(dead_code)]
    name: String,
    is_dir: bool,
    size: u64,
    mtime: i64,
}

fn read_dir_entries(dir: &Path) -> BTreeMap<String, RawEntry> {
    let mut map = BTreeMap::new();
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            let meta = match e.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            map.insert(
                name.clone(),
                RawEntry {
                    name,
                    is_dir: meta.is_dir(),
                    size: if meta.is_dir() { 0 } else { meta.len() },
                    mtime,
                },
            );
        }
    }
    map
}

/// blake3 hash of a file, streaming so large files don't blow memory.
fn hash_file(path: &Path) -> Option<[u8; 32]> {
    let mut file = fs::File::open(path).ok()?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(*hasher.finalize().as_bytes())
}

fn files_equal(left: &Path, right: &Path, size_a: u64, size_b: u64) -> bool {
    if size_a != size_b {
        return false;
    }
    match (hash_file(left), hash_file(right)) {
        (Some(a), Some(b)) => a == b,
        _ => false,
    }
}

/// Recursively compare two directories. `rel` is the path relative to the roots.
fn compare_dirs(left: &Path, right: &Path, rel: &str, stats: &mut Stats) -> Vec<Node> {
    let le = read_dir_entries(left);
    let re = read_dir_entries(right);

    let mut names: Vec<String> = le.keys().chain(re.keys()).cloned().collect();
    names.sort();
    names.dedup();

    // Compare each name; parallelize file hashing across entries.
    let results: Vec<(Node, Stats)> = names
        .par_iter()
        .map(|name| {
            let mut local = Stats::default();
            let l = le.get(name);
            let r = re.get(name);
            let child_rel = if rel.is_empty() {
                name.clone()
            } else {
                format!("{}/{}", rel, name)
            };
            let node = build_node(left, right, name, &child_rel, l, r, &mut local);
            (node, local)
        })
        .collect();

    let mut nodes = Vec::with_capacity(results.len());
    for (n, s) in results {
        stats.same += s.same;
        stats.different += s.different;
        stats.left_only += s.left_only;
        stats.right_only += s.right_only;
        stats.newer += s.newer;
        nodes.push(n);
    }
    // dirs first, then files, both alphabetical
    nodes.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    nodes
}

#[allow(clippy::too_many_arguments)]
fn build_node(
    left_dir: &Path,
    right_dir: &Path,
    name: &str,
    rel: &str,
    l: Option<&RawEntry>,
    r: Option<&RawEntry>,
    stats: &mut Stats,
) -> Node {
    let is_dir = l.map(|e| e.is_dir).or(r.map(|e| e.is_dir)).unwrap_or(false);
    let left_meta = l.map(|e| SideMeta {
        size: e.size,
        mtime: e.mtime,
    });
    let right_meta = r.map(|e| SideMeta {
        size: e.size,
        mtime: e.mtime,
    });

    if is_dir {
        // Recurse into whichever sides exist.
        let lpath = left_dir.join(name);
        let rpath = right_dir.join(name);
        let children = match (l, r) {
            (Some(_), Some(_)) => compare_dirs(&lpath, &rpath, rel, stats),
            (Some(_), None) => list_only(&lpath, rel, Side::Left, stats),
            (None, Some(_)) => list_only(&rpath, rel, Side::Right, stats),
            (None, None) => vec![],
        };
        let diff_count: u32 = children
            .iter()
            .map(|c| {
                if c.is_dir {
                    c.diff_count
                } else if c.status == "same" {
                    0
                } else {
                    1
                }
            })
            .sum();
        let status = if l.is_none() {
            "right_only"
        } else if r.is_none() {
            "left_only"
        } else if diff_count == 0 {
            "same"
        } else {
            "different"
        };
        Node {
            name: name.to_string(),
            rel_path: rel.to_string(),
            is_dir: true,
            left: left_meta,
            right: right_meta,
            status: status.to_string(),
            children,
            diff_count,
        }
    } else {
        let status = match (l, r) {
            (Some(le), Some(re)) => {
                let eq = files_equal(
                    &left_dir.join(name),
                    &right_dir.join(name),
                    le.size,
                    re.size,
                );
                if eq {
                    stats.same += 1;
                    "same".to_string()
                } else {
                    stats.different += 1;
                    if le.mtime > re.mtime {
                        stats.newer += 1;
                        "left_newer".to_string()
                    } else if re.mtime > le.mtime {
                        stats.newer += 1;
                        "right_newer".to_string()
                    } else {
                        "different".to_string()
                    }
                }
            }
            (Some(_), None) => {
                stats.left_only += 1;
                "left_only".to_string()
            }
            (None, Some(_)) => {
                stats.right_only += 1;
                "right_only".to_string()
            }
            (None, None) => "same".to_string(),
        };
        Node {
            name: name.to_string(),
            rel_path: rel.to_string(),
            is_dir: false,
            left: left_meta,
            right: right_meta,
            status,
            children: vec![],
            diff_count: 0,
        }
    }
}

#[derive(Clone, Copy)]
enum Side {
    Left,
    Right,
}

/// Build a tree for a directory that only exists on one side.
fn list_only(dir: &Path, rel: &str, side: Side, stats: &mut Stats) -> Vec<Node> {
    let entries = read_dir_entries(dir);
    let mut nodes = vec![];
    for (name, e) in entries {
        let child_rel = format!("{}/{}", rel, name);
        let meta = SideMeta {
            size: e.size,
            mtime: e.mtime,
        };
        let (left, right, status) = match side {
            Side::Left => (Some(meta), None, "left_only"),
            Side::Right => (None, Some(meta), "right_only"),
        };
        let (children, diff_count) = if e.is_dir {
            let ch = list_only(&dir.join(&name), &child_rel, side, stats);
            let dc = ch.iter().map(|c| if c.is_dir { c.diff_count } else { 1 }).sum();
            (ch, dc)
        } else {
            match side {
                Side::Left => stats.left_only += 1,
                Side::Right => stats.right_only += 1,
            }
            (vec![], 0)
        };
        nodes.push(Node {
            name,
            rel_path: child_rel,
            is_dir: e.is_dir,
            left,
            right,
            status: status.to_string(),
            children,
            diff_count,
        });
    }
    nodes.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    nodes
}

pub fn compare_folders(left: &str, right: &str) -> Result<FolderCompareResult, String> {
    let lp = Path::new(left);
    let rp = Path::new(right);
    if !lp.is_dir() {
        return Err(format!("Not a folder: {}", left));
    }
    if !rp.is_dir() {
        return Err(format!("Not a folder: {}", right));
    }
    let mut stats = Stats::default();
    let root = compare_dirs(lp, rp, "", &mut stats);
    Ok(FolderCompareResult {
        left_root: left.to_string(),
        right_root: right.to_string(),
        root,
        stats,
    })
}
