import { useEffect, useState } from "react";
import { api, ApplyResult, pickFolder, SyncMode, SyncPlan } from "../lib/api";
import { PathPicker, StatusBar } from "../components/Shell";
import { useApp } from "../store";
import {
  ACCENT,
  Chrome,
  ToolButton,
  ToolDivider,
  useStandardMenus,
} from "../components/AppChrome";
import {
  IconHome,
  IconReload,
  IconSave,
  IconSessions,
  IconSwap,
} from "../components/Icons";

const MODES: { value: SyncMode; label: string; hint: string }[] = [
  { value: "update_lr", label: "Update →", hint: "copy newer left files to right" },
  { value: "update_rl", label: "← Update", hint: "copy newer right files to left" },
  { value: "left_to_right", label: "Copy →", hint: "copy all left changes to right" },
  { value: "right_to_left", label: "← Copy", hint: "copy all right changes to left" },
  { value: "mirror_lr", label: "Mirror →", hint: "make right identical to left (deletes)" },
  { value: "mirror_rl", label: "Mirror ←", hint: "make left identical to right (deletes)" },
];

const opLabel: Record<string, string> = {
  copy_lr: "Copy →",
  copy_rl: "← Copy",
  delete_left: "Delete left",
  delete_right: "Delete right",
};
const opColor: Record<string, string> = {
  copy_lr: "text-emerald-600 dark:text-emerald-400",
  copy_rl: "text-sky-600 dark:text-sky-400",
  delete_left: "text-red-600 dark:text-red-400",
  delete_right: "text-red-600 dark:text-red-400",
};

export default function FolderSync() {
  const consumePending = useApp((s) => s.consumePending);
  const addRecent = useApp((s) => s.addRecent);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [mode, setMode] = useState<SyncMode>("update_lr");
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);

  async function preview(l = left, r = right, m = mode) {
    if (!l || !r) return;
    setError(null);
    setResult(null);
    try {
      setPlan(await api.syncPlan(l, r, m));
      addRecent({ kind: "sync", left: l, right: r, mode: m });
    } catch (e) {
      setError(String(e));
      setPlan(null);
    }
  }

  useEffect(() => {
    const p = consumePending("sync");
    if (p) {
      setLeft(p.left);
      setRight(p.right);
      setMode(p.mode);
      preview(p.left, p.right, p.mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        preview();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hasDeletes = plan?.actions.some((a) => a.op.startsWith("delete"));

  async function apply() {
    if (!plan) return;
    const msg = hasDeletes
      ? `Apply ${plan.actions.length} actions, INCLUDING deletions? This cannot be undone.`
      : `Apply ${plan.actions.length} actions?`;
    if (!window.confirm(msg)) return;
    setApplying(true);
    setError(null);
    try {
      const res = await api.applySync(
        plan.left_root,
        plan.right_root,
        plan.actions,
      );
      setResult(res);
      await preview(); // refresh
    } catch (e) {
      setError(String(e));
    } finally {
      setApplying(false);
    }
  }

  function swap() {
    const nl = right;
    const nr = left;
    setLeft(nl);
    setRight(nr);
    if (nl && nr) preview(nl, nr);
  }

  const setView = useApp.getState().setView;
  const menus = useStandardMenus({
    File: [
      { label: "Preview", shortcut: "⌘↵", onClick: () => preview(), disabled: !left || !right },
      { label: "Apply", onClick: apply, disabled: !plan || !plan.actions.length },
      { label: "Swap sides", onClick: swap, disabled: !left || !right },
    ],
  });

  const toolbar = (
    <>
      <ToolButton icon={<IconHome />} label="Home" onClick={() => setView("home")} />
      <ToolButton icon={<IconSessions />} label="Sessions" onClick={() => setView("home")} />
      <ToolDivider />
      <ToolButton icon={<IconReload />} label="Preview" onClick={() => preview()} disabled={!left || !right} />
      <ToolButton icon={<IconSave />} label={applying ? "…" : "Apply"} onClick={apply} disabled={!plan || !plan.actions.length || applying} danger={hasDeletes} />
      <ToolDivider />
      <ToolButton icon={<IconSwap />} label="Swap" onClick={swap} disabled={!left || !right} />
    </>
  );

  return (
    <Chrome menus={menus} toolbar={toolbar} accent={ACCENT.sync}>
      <div className="flex items-center gap-3 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <PathPicker
          label="Left"
          value={left}
          placeholder="Type or paste a folder path…"
          onChange={setLeft}
          onPick={async () => {
            const p = await pickFolder("Left folder");
            if (p) setLeft(p);
          }}
        />
        <PathPicker
          label="Right"
          value={right}
          placeholder="Type or paste a folder path…"
          onChange={setRight}
          onPick={async () => {
            const p = await pickFolder("Right folder");
            if (p) setRight(p);
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        {MODES.map((m) => (
          <button
            key={m.value}
            title={m.hint}
            onClick={() => setMode(m.value)}
            className={
              "rounded-md px-2.5 py-1 text-xs font-medium " +
              (mode === m.value
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700")
            }
          >
            {m.label}
          </button>
        ))}
        <span className="ml-2 text-xs text-neutral-400">
          {MODES.find((m) => m.value === mode)?.hint}
        </span>
      </div>

      <div className="flex-1 overflow-auto font-mono text-[13px]">
        {error && <div className="p-4 text-sm text-red-500">{error}</div>}
        {!plan && !error && (
          <div className="p-8 text-center text-sm text-neutral-400">
            Pick two folders and a sync mode, then Preview.
          </div>
        )}
        {plan && plan.actions.length === 0 && (
          <div className="p-8 text-center text-sm text-neutral-400">
            Nothing to do — folders are already in sync for this mode.
          </div>
        )}
        {plan?.actions.map((a, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-1 hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
          >
            <span className={"w-24 shrink-0 " + opColor[a.op]}>
              {opLabel[a.op]}
            </span>
            <span className="truncate">{a.rel_path}</span>
            {a.is_dir && (
              <span className="shrink-0 text-[10px] text-neutral-400">dir</span>
            )}
            <span className="ml-auto shrink-0 text-xs text-neutral-400">
              {a.reason}
            </span>
          </div>
        ))}
      </div>

      <StatusBar>
        {plan && <span>{plan.actions.length} pending actions</span>}
        {hasDeletes && (
          <span className="text-red-500">contains deletions</span>
        )}
        {result && (
          <span className="text-emerald-600 dark:text-emerald-400">
            {result.succeeded} applied
            {result.failed ? `, ${result.failed} failed` : ""}
          </span>
        )}
        {result?.errors.map((e, i) => (
          <span key={i} className="text-red-500">
            {e}
          </span>
        ))}
      </StatusBar>
    </Chrome>
  );
}
