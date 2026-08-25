use super::folder::{compare_folders_simple, Node};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Serialize, Clone, Deserialize)]
pub struct SyncAction {
    pub rel_path: String,
    pub is_dir: bool,
    /// copy_lr | copy_rl | delete_left | delete_right
    pub op: String,
    /// human label of why
    pub reason: String,
}

#[derive(Serialize)]
pub struct SyncPlan {
    pub actions: Vec<SyncAction>,
    pub left_root: String,
    pub right_root: String,
}

/// mode: left_to_right | right_to_left | mirror_lr | mirror_rl | update_lr | update_rl
pub fn build_plan(left: &str, right: &str, mode: &str) -> Result<SyncPlan, String> {
    let cmp = compare_folders_simple(left, right, false)?;
    let mut actions = Vec::new();
    for n in &cmp.root {
        walk(n, mode, &mut actions);
    }
    Ok(SyncPlan {
        actions,
        left_root: left.to_string(),
        right_root: right.to_string(),
    })
}

fn walk(node: &Node, mode: &str, out: &mut Vec<SyncAction>) {
    let (to_right, to_left, mirror, update) = match mode {
        "left_to_right" => (true, false, false, false),
        "right_to_left" => (false, true, false, false),
        "mirror_lr" => (true, false, true, false),
        "mirror_rl" => (false, true, true, false),
        "update_lr" => (true, false, false, true),
        "update_rl" => (false, true, false, true),
        _ => (true, false, false, false),
    };

    match node.status.as_str() {
        "left_only" => {
            if to_right {
                out.push(SyncAction {
                    rel_path: node.rel_path.clone(),
                    is_dir: node.is_dir,
                    op: "copy_lr".into(),
                    reason: "new on left".into(),
                });
                return; // copying dir copies its contents
            } else if to_left && mirror {
                out.push(SyncAction {
                    rel_path: node.rel_path.clone(),
                    is_dir: node.is_dir,
                    op: "delete_left".into(),
                    reason: "orphan (mirror)".into(),
                });
                return;
            }
        }
        "right_only" => {
            if to_left {
                out.push(SyncAction {
                    rel_path: node.rel_path.clone(),
                    is_dir: node.is_dir,
                    op: "copy_rl".into(),
                    reason: "new on right".into(),
                });
                return;
            } else if to_right && mirror {
                out.push(SyncAction {
                    rel_path: node.rel_path.clone(),
                    is_dir: node.is_dir,
                    op: "delete_right".into(),
                    reason: "orphan (mirror)".into(),
                });
                return;
            }
        }
        "different" | "left_newer" | "right_newer" => {
            if !node.is_dir {
                let newer_left = node.status == "left_newer" || node.status == "different";
                let newer_right = node.status == "right_newer";
                if to_right && (!update || newer_left) {
                    out.push(SyncAction {
                        rel_path: node.rel_path.clone(),
                        is_dir: false,
                        op: "copy_lr".into(),
                        reason: node.status.clone(),
                    });
                } else if to_left && (!update || newer_right) {
                    out.push(SyncAction {
                        rel_path: node.rel_path.clone(),
                        is_dir: false,
                        op: "copy_rl".into(),
                        reason: node.status.clone(),
                    });
                }
            }
        }
        _ => {}
    }

    for c in &node.children {
        walk(c, mode, out);
    }
}

fn copy_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if src.is_dir() {
        fs::create_dir_all(dst).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name();
            copy_recursive(&src.join(&name), &dst.join(&name))?;
        }
        Ok(())
    } else {
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::copy(src, dst).map(|_| ()).map_err(|e| e.to_string())
    }
}

fn remove_path(p: &Path) -> Result<(), String> {
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[derive(Serialize)]
pub struct ApplyResult {
    pub succeeded: u32,
    pub failed: u32,
    pub errors: Vec<String>,
}

pub fn apply_plan(
    left_root: &str,
    right_root: &str,
    actions: &[SyncAction],
) -> Result<ApplyResult, String> {
    let lroot = Path::new(left_root);
    let rroot = Path::new(right_root);
    let mut res = ApplyResult {
        succeeded: 0,
        failed: 0,
        errors: vec![],
    };
    for a in actions {
        let lpath = lroot.join(&a.rel_path);
        let rpath = rroot.join(&a.rel_path);
        let outcome = match a.op.as_str() {
            "copy_lr" => copy_recursive(&lpath, &rpath),
            "copy_rl" => copy_recursive(&rpath, &lpath),
            "delete_left" => remove_path(&lpath),
            "delete_right" => remove_path(&rpath),
            other => Err(format!("unknown op {other}")),
        };
        match outcome {
            Ok(_) => res.succeeded += 1,
            Err(e) => {
                res.failed += 1;
                res.errors.push(format!("{}: {}", a.rel_path, e));
            }
        }
    }
    Ok(res)
}
