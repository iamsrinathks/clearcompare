mod engine;

use engine::diff::{DiffResult, FileMeta};
use engine::folder::FolderCompareResult;
use engine::merge::MergeResult;
use engine::sync::{ApplyResult, SyncAction, SyncPlan};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;
use tauri::{Emitter, Manager};

/// Cancellation flags for in-flight folder comparisons, keyed by a job id
/// generated on the frontend. Held in Tauri managed state.
#[derive(Default)]
struct CompareJobs(Mutex<HashMap<u64, Arc<AtomicBool>>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompareProgress {
    job_id: u64,
    done: u64,
}

fn file_meta(path: &str) -> Option<FileMeta> {
    let m = fs::metadata(path).ok()?;
    let mtime = m
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    Some(FileMeta {
        size: m.len(),
        mtime,
    })
}

#[tauri::command]
async fn compare_folders(
    window: tauri::Window,
    jobs: tauri::State<'_, CompareJobs>,
    left: String,
    right: String,
    exact: bool,
    job_id: u64,
) -> Result<FolderCompareResult, String> {
    // Register a cancellation flag for this job.
    let cancel = Arc::new(AtomicBool::new(false));
    jobs.0.lock().unwrap().insert(job_id, cancel.clone());

    // Persistent hash cache lives in the app cache dir; a failure to resolve it
    // just means comparisons run without caching.
    let cache_path = window
        .app_handle()
        .path()
        .app_cache_dir()
        .ok()
        .map(|d| d.join("hashcache.bin"));

    // Run the (CPU/IO-heavy) comparison on a blocking thread so the async
    // runtime stays free to deliver the cancel command and progress events.
    let result = tauri::async_runtime::spawn_blocking(move || {
        let on_progress = move |done: u64| {
            let _ = window.emit("folder-compare-progress", CompareProgress { job_id, done });
        };
        engine::folder::compare_folders(
            &left,
            &right,
            exact,
            cache_path.as_deref(),
            &cancel,
            &on_progress,
        )
    })
    .await
    .map_err(|e| e.to_string())?;

    // Always clean up the registry entry, whether we finished or were cancelled.
    jobs.0.lock().unwrap().remove(&job_id);
    result
}

#[tauri::command]
fn cancel_compare(jobs: tauri::State<'_, CompareJobs>, job_id: u64) {
    if let Some(flag) = jobs.0.lock().unwrap().get(&job_id) {
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
    }
}

#[tauri::command]
fn diff_text(left: String, right: String, ignore_whitespace: bool) -> DiffResult {
    engine::diff::diff_text(&left, &right, ignore_whitespace)
}

#[tauri::command]
fn diff_files(
    left_path: String,
    right_path: String,
    ignore_whitespace: bool,
) -> Result<DiffResult, String> {
    let left = fs::read_to_string(&left_path).map_err(|e| format!("{left_path}: {e}"))?;
    let right = fs::read_to_string(&right_path).map_err(|e| format!("{right_path}: {e}"))?;
    let mut res = engine::diff::diff_text(&left, &right, ignore_whitespace);
    res.left_meta = file_meta(&left_path);
    res.right_meta = file_meta(&right_path);
    Ok(res)
}

#[tauri::command]
fn merge3(base: String, left: String, right: String) -> MergeResult {
    engine::merge::merge3(&base, &left, &right)
}

#[tauri::command]
fn merge3_files(
    base_path: String,
    left_path: String,
    right_path: String,
) -> Result<MergeResult, String> {
    let base = fs::read_to_string(&base_path).map_err(|e| format!("{base_path}: {e}"))?;
    let left = fs::read_to_string(&left_path).map_err(|e| format!("{left_path}: {e}"))?;
    let right = fs::read_to_string(&right_path).map_err(|e| format!("{right_path}: {e}"))?;
    Ok(engine::merge::merge3(&base, &left, &right))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
fn sync_plan(left: String, right: String, mode: String) -> Result<SyncPlan, String> {
    engine::sync::build_plan(&left, &right, &mode)
}

#[tauri::command]
fn apply_sync(
    left_root: String,
    right_root: String,
    actions: Vec<SyncAction>,
) -> Result<ApplyResult, String> {
    engine::sync::apply_plan(&left_root, &right_root, &actions)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(CompareJobs::default())
        .invoke_handler(tauri::generate_handler![
            compare_folders,
            cancel_compare,
            diff_text,
            diff_files,
            merge3,
            merge3_files,
            read_text_file,
            write_text_file,
            sync_plan,
            apply_sync,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
