import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

// ---- Types mirroring the Rust engine ----

export interface SideMeta {
  size: number;
  mtime: number;
}

export type FolderStatus =
  | "same"
  | "different"
  | "left_newer"
  | "right_newer"
  | "left_only"
  | "right_only";

export interface Node {
  name: string;
  rel_path: string;
  is_dir: boolean;
  left: SideMeta | null;
  right: SideMeta | null;
  status: FolderStatus;
  children: Node[];
  diff_count: number;
}

export interface Stats {
  same: number;
  different: number;
  left_only: number;
  right_only: number;
  newer: number;
}

export interface FolderCompareResult {
  left_root: string;
  right_root: string;
  root: Node[];
  stats: Stats;
}

export interface Span {
  start: number;
  end: number;
}
export interface Cell {
  line_no: number | null;
  text: string;
  spans: Span[];
}
export type RowKind = "equal" | "insert" | "delete" | "change";
export interface Row {
  kind: RowKind;
  left: Cell | null;
  right: Cell | null;
}
export interface FileMeta {
  size: number;
  mtime: number;
}
export interface DiffResult {
  rows: Row[];
  added: number;
  removed: number;
  changed: number;
  left_meta: FileMeta | null;
  right_meta: FileMeta | null;
}

export interface Region {
  kind: "clean" | "conflict";
  text: string;
  left: string | null;
  base: string | null;
  right: string | null;
}
export interface MergeResult {
  regions: Region[];
  conflicts: number;
  merged_text: string;
  clean: boolean;
}

export interface SyncAction {
  rel_path: string;
  is_dir: boolean;
  op: "copy_lr" | "copy_rl" | "delete_left" | "delete_right";
  reason: string;
}
export interface SyncPlan {
  actions: SyncAction[];
  left_root: string;
  right_root: string;
}
export interface ApplyResult {
  succeeded: number;
  failed: number;
  errors: string[];
}

export type SyncMode =
  | "left_to_right"
  | "right_to_left"
  | "mirror_lr"
  | "mirror_rl"
  | "update_lr"
  | "update_rl";

// ---- Command wrappers ----

export const api = {
  compareFolders: (left: string, right: string) =>
    invoke<FolderCompareResult>("compare_folders", { left, right }),
  diffText: (left: string, right: string, ignoreWhitespace = false) =>
    invoke<DiffResult>("diff_text", { left, right, ignoreWhitespace }),
  diffFiles: (leftPath: string, rightPath: string, ignoreWhitespace = false) =>
    invoke<DiffResult>("diff_files", { leftPath, rightPath, ignoreWhitespace }),
  merge3: (base: string, left: string, right: string) =>
    invoke<MergeResult>("merge3", { base, left, right }),
  merge3Files: (basePath: string, leftPath: string, rightPath: string) =>
    invoke<MergeResult>("merge3_files", { basePath, leftPath, rightPath }),
  readTextFile: (path: string) => invoke<string>("read_text_file", { path }),
  writeTextFile: (path: string, content: string) =>
    invoke<void>("write_text_file", { path, content }),
  syncPlan: (left: string, right: string, mode: SyncMode) =>
    invoke<SyncPlan>("sync_plan", { left, right, mode }),
  applySync: (leftRoot: string, rightRoot: string, actions: SyncAction[]) =>
    invoke<ApplyResult>("apply_sync", { leftRoot, rightRoot, actions }),
};

// ---- Native pickers ----

export async function pickFolder(title?: string): Promise<string | null> {
  const res = await open({ directory: true, multiple: false, title });
  return typeof res === "string" ? res : null;
}

export async function pickFile(title?: string): Promise<string | null> {
  const res = await open({ directory: false, multiple: false, title });
  return typeof res === "string" ? res : null;
}
