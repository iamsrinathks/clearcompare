//! Persistent BLAKE3 hash cache keyed on (path, size, mtime).
//!
//! Exact folder comparisons hash every file's contents. Across repeated runs
//! most files are unchanged, so we remember their hashes on disk: a cache hit
//! (same path, size and mtime) skips the read entirely. The on-disk format is a
//! compact custom binary blob to stay fast at millions of entries.

use std::collections::HashMap;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

const MAGIC: &[u8; 4] = b"CCH1";

#[derive(Clone, Copy)]
struct Entry {
    size: u64,
    mtime: i64,
    hash: [u8; 32],
}

pub struct HashCache {
    path: PathBuf,
    map: Mutex<HashMap<String, Entry>>,
    dirty: AtomicBool,
}

impl HashCache {
    /// Load a cache from `path`. A missing or corrupt file yields an empty cache.
    pub fn load(path: &Path) -> HashCache {
        let map = read_file(path).unwrap_or_default();
        HashCache {
            path: path.to_path_buf(),
            map: Mutex::new(map),
            dirty: AtomicBool::new(false),
        }
    }

    /// Return the cached hash if size+mtime still match, otherwise run `compute`,
    /// store the result, and return it. The lock is released during `compute` so
    /// hashing stays parallel.
    pub fn get_or_compute(
        &self,
        file: &Path,
        size: u64,
        mtime: i64,
        compute: impl FnOnce() -> Option<[u8; 32]>,
    ) -> Option<[u8; 32]> {
        let key = file.to_string_lossy();
        {
            let map = self.map.lock().unwrap();
            if let Some(e) = map.get(key.as_ref()) {
                if e.size == size && e.mtime == mtime {
                    return Some(e.hash);
                }
            }
        }
        let hash = compute()?;
        self.map
            .lock()
            .unwrap()
            .insert(key.into_owned(), Entry { size, mtime, hash });
        self.dirty.store(true, Ordering::Relaxed);
        Some(hash)
    }

    /// Persist the cache to disk if anything changed. Best-effort: errors are
    /// swallowed since the cache is purely an optimization.
    pub fn save(&self) {
        if !self.dirty.load(Ordering::Relaxed) {
            return;
        }
        let map = self.map.lock().unwrap();
        let _ = write_file(&self.path, &map);
    }
}

fn read_file(path: &Path) -> Option<HashMap<String, Entry>> {
    let f = std::fs::File::open(path).ok()?;
    let mut r = BufReader::new(f);

    let mut magic = [0u8; 4];
    r.read_exact(&mut magic).ok()?;
    if &magic != MAGIC {
        return None;
    }

    let mut map = HashMap::new();
    loop {
        let mut len_buf = [0u8; 4];
        match r.read_exact(&mut len_buf) {
            Ok(()) => {}
            Err(_) => break, // clean EOF (or truncated tail) — stop here
        }
        let len = u32::from_le_bytes(len_buf) as usize;
        let mut path_bytes = vec![0u8; len];
        if r.read_exact(&mut path_bytes).is_err() {
            break;
        }
        let mut num = [0u8; 8];
        if r.read_exact(&mut num).is_err() {
            break;
        }
        let size = u64::from_le_bytes(num);
        if r.read_exact(&mut num).is_err() {
            break;
        }
        let mtime = i64::from_le_bytes(num);
        let mut hash = [0u8; 32];
        if r.read_exact(&mut hash).is_err() {
            break;
        }
        let key = String::from_utf8_lossy(&path_bytes).into_owned();
        map.insert(key, Entry { size, mtime, hash });
    }
    Some(map)
}

fn write_file(path: &Path, map: &HashMap<String, Entry>) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // Write to a temp file then rename so a crash can't corrupt the cache.
    let tmp = path.with_extension("tmp");
    {
        let f = std::fs::File::create(&tmp)?;
        let mut w = BufWriter::new(f);
        w.write_all(MAGIC)?;
        for (k, e) in map.iter() {
            let kb = k.as_bytes();
            w.write_all(&(kb.len() as u32).to_le_bytes())?;
            w.write_all(kb)?;
            w.write_all(&e.size.to_le_bytes())?;
            w.write_all(&e.mtime.to_le_bytes())?;
            w.write_all(&e.hash)?;
        }
        w.flush()?;
    }
    std::fs::rename(&tmp, path)
}
