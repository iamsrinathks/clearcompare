mod engine;

use engine::diff::{DiffResult, FileMeta};
use engine::folder::FolderCompareResult;
use engine::merge::MergeResult;
use engine::sync::{ApplyResult, SyncAction, SyncPlan};
use std::fs;
use std::time::UNIX_EPOCH;

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
fn compare_folders(left: String, right: String) -> Result<FolderCompareResult, String> {
    engine::folder::compare_folders(&left, &right)
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
        .invoke_handler(tauri::generate_handler![
            compare_folders,
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
