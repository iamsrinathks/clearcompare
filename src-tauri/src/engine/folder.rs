use super::cache::HashCache;
use rayon::prelude::*;
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::UNIX_EPOCH;

/// Emit a progress event roughly every this many files processed, to avoid
/// flooding the IPC channel while still feeling live.
const PROGRESS_EVERY: u64 = 512;

/// Shared, thread-safe context threaded through the (parallel) comparison.
pub struct Ctx<'a> {
    pub exact: bool,
    /// Set to true from another thread to request cancellation.
    pub cancel: &'a AtomicBool,
    /// Running count of files examined so far.
    pub done: &'a AtomicU64,
    /// Called (throttled) with the running count so the UI can show progress.
    pub on_progress: &'a (dyn Fn(u64) + Send + Sync),
    /// Optional persistent hash cache (used for exact content comparisons).
    pub cache: Option<&'a HashCache>,
}

impl Ctx<'_> {
    fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed)
    }

    /// Record one processed file and emit a throttled progress update.
    fn tick(&self) {
        let n = self.done.fetch_add(1, Ordering::Relaxed) + 1;
        if n % PROGRESS_EVERY == 0 {
            (self.on_progress)(n);
        }
    }
}

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

/// Hash a file, consulting the persistent cache first when one is present.
fn hash_cached(ctx: &Ctx, path: &Path, size: u64, mtime: i64) -> Option<[u8; 32]> {
    match ctx.cache {
        Some(c) => c.get_or_compute(path, size, mtime, || hash_file(path)),
        None => hash_file(path),
    }
}

/// True when both files have identical BLAKE3 content hashes.
#[allow(clippy::too_many_arguments)]
fn contents_equal(
    ctx: &Ctx,
    left: &Path,
    ls: u64,
    lm: i64,
    right: &Path,
    rs: u64,
    rm: i64,
) -> bool {
    if ls != rs {
        return false;
    }
    match (
        hash_cached(ctx, left, ls, lm),
        hash_cached(ctx, right, rs, rm),
    ) {
        (Some(a), Some(b)) => a == b,
        _ => false,
    }
}

/// Fast path: files with identical size *and* modification time are treated as
/// equal without reading their contents. This avoids hashing the (common) case
/// of millions of unchanged files. Only when the mtimes differ do we fall back
/// to a full BLAKE3 content comparison.
#[allow(clippy::too_many_arguments)]
fn quick_equal(
    ctx: &Ctx,
    left: &Path,
    ls: u64,
    lm: i64,
    right: &Path,
    rs: u64,
    rm: i64,
) -> bool {
    if ls != rs {
        return false;
    }
    if lm == rm {
        return true;
    }
    contents_equal(ctx, left, ls, lm, right, rs, rm)
}

/// Recursively compare two directories. `rel` is the path relative to the roots.
/// When `ctx.exact` is true, files are always compared by BLAKE3 content; otherwise
/// a size+mtime quick path is used to skip hashing unchanged files.
fn compare_dirs(left: &Path, right: &Path, rel: &str, ctx: &Ctx, stats: &mut Stats) -> Vec<Node> {
    if ctx.cancelled() {
        return vec![];
    }
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
            let node = build_node(left, right, name, &child_rel, l, r, ctx, &mut local);
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
    ctx: &Ctx,
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
            (Some(_), Some(_)) => compare_dirs(&lpath, &rpath, rel, ctx, stats),
            (Some(_), None) => list_only(&lpath, rel, Side::Left, ctx, stats),
            (None, Some(_)) => list_only(&rpath, rel, Side::Right, ctx, stats),
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
                ctx.tick();
                let lpath = left_dir.join(name);
                let rpath = right_dir.join(name);
                // Skip the (potentially expensive) content read if we're aborting.
                let eq = if ctx.cancelled() {
                    true
                } else if ctx.exact {
                    contents_equal(ctx, &lpath, le.size, le.mtime, &rpath, re.size, re.mtime)
                } else {
                    quick_equal(ctx, &lpath, le.size, le.mtime, &rpath, re.size, re.mtime)
                };
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
fn list_only(dir: &Path, rel: &str, side: Side, ctx: &Ctx, stats: &mut Stats) -> Vec<Node> {
    if ctx.cancelled() {
        return vec![];
    }
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
            let ch = list_only(&dir.join(&name), &child_rel, side, ctx, stats);
            let dc = ch.iter().map(|c| if c.is_dir { c.diff_count } else { 1 }).sum();
            (ch, dc)
        } else {
            ctx.tick();
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

/// Sentinel error returned when a comparison is cancelled mid-flight.
pub const CANCELLED: &str = "cancelled";

/// Convenience wrapper for callers (e.g. sync planning) that don't need
/// progress reporting, cancellation, or a persistent hash cache.
pub fn compare_folders_simple(
    left: &str,
    right: &str,
    exact: bool,
) -> Result<FolderCompareResult, String> {
    let cancel = AtomicBool::new(false);
    compare_folders(left, right, exact, None, &cancel, &|_| {})
}

pub fn compare_folders(
    left: &str,
    right: &str,
    exact: bool,
    cache_path: Option<&Path>,
    cancel: &AtomicBool,
    on_progress: &(dyn Fn(u64) + Send + Sync),
) -> Result<FolderCompareResult, String> {
    let lp = Path::new(left);
    let rp = Path::new(right);
    if !lp.is_dir() {
        return Err(format!("Not a folder: {}", left));
    }
    if !rp.is_dir() {
        return Err(format!("Not a folder: {}", right));
    }
    // Only bother with the on-disk hash cache for exact comparisons, since the
    // quick path rarely hashes anything.
    let cache = if exact {
        cache_path.map(HashCache::load)
    } else {
        None
    };
    let done = AtomicU64::new(0);
    let ctx = Ctx {
        exact,
        cancel,
        done: &done,
        on_progress,
        cache: cache.as_ref(),
    };
    let mut stats = Stats::default();
    let root = compare_dirs(lp, rp, "", &ctx, &mut stats);

    // Persist any newly computed hashes even if we were cancelled mid-run.
    if let Some(c) = &cache {
        c.save();
    }

    if ctx.cancelled() {
        return Err(CANCELLED.to_string());
    }
    // Final progress tick so the UI lands on the true total.
    (on_progress)(done.load(Ordering::Relaxed));

    Ok(FolderCompareResult {
        left_root: left.to_string(),
        right_root: right.to_string(),
        root,
        stats,
    })
}
