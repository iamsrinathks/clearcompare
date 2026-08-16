import { useEffect, useMemo, useState } from "react";
import {
  api,
  FolderCompareResult,
  Node,
  pickFolder,
  SideMeta,
} from "../lib/api";
import { formatDate, formatSize } from "../lib/format";
import { statusColor, statusRowBg } from "../lib/status";
import { useApp } from "../store";
import {
  ACCENT,
  Chrome,
  ToolButton,
  ToolDivider,
  useStandardMenus,
} from "../components/AppChrome";
import {
  IconAll,
  IconDiffs,
  IconHome,
  IconReload,
  IconSessions,
  IconSwap,
} from "../components/Icons";
import { PathPicker } from "../components/Shell";

export default function FolderCompare() {
  const openFilePair = useApp((s) => s.openFilePair);
  const consumePending = useApp((s) => s.consumePending);
  const addRecent = useApp((s) => s.addRecent);
  const setView = useApp((s) => s.setView);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [result, setResult] = useState<FolderCompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function run(l = left, r = right) {
    if (!l || !r) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.compareFolders(l, r);
      setResult(res);
      addRecent({ kind: "folder", left: l, right: r });
      const next = new Set<string>();
      for (const n of res.root)
        if (n.is_dir && n.diff_count > 0) next.add(n.rel_path);
      setExpanded(next);
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const p = consumePending("folder");
    if (p) {
      setLeft(p.left);
      setRight(p.right);
      run(p.left, p.right);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        run();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function swap() {
    const nl = right;
    const nr = left;
    setLeft(nl);
    setRight(nr);
    if (nl && nr) run(nl, nr);
  }

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  function onRowActivate(n: Node) {
    if (n.is_dir) {
      toggle(n.rel_path);
    } else if (n.left && n.right && n.status !== "same") {
      openFilePair(
        `${result!.left_root}/${n.rel_path}`,
        `${result!.right_root}/${n.rel_path}`,
      );
    }
  }

  const visible = useMemo(() => {
    if (!result) return [];
    const out: { node: Node; depth: number }[] = [];
    const walk = (nodes: Node[], depth: number) => {
      for (const n of nodes) {
        const isDiff = n.is_dir ? n.diff_count > 0 : n.status !== "same";
        if (onlyDiffs && !isDiff) continue;
        out.push({ node: n, depth });
        if (n.is_dir && expanded.has(n.rel_path)) walk(n.children, depth + 1);
      }
    };
    walk(result.root, 0);
    return out;
  }, [result, expanded, onlyDiffs]);

  const menus = useStandardMenus({
    File: [
      { label: "Compare", shortcut: "⌘↵", onClick: () => run(), disabled: !left || !right },
      { label: "Swap sides", onClick: swap, disabled: !left || !right },
    ],
    View: [
      { label: "Show all", checked: !onlyDiffs, onClick: () => setOnlyDiffs(false) },
      { label: "Differences only", checked: onlyDiffs, onClick: () => setOnlyDiffs(true) },
      { separator: true },
      { label: "Expand all", onClick: () => expandAll(result, setExpanded), disabled: !result },
      { label: "Collapse all", onClick: () => setExpanded(new Set()), disabled: !result },
    ],
  });

  const toolbar = (
    <>
      <ToolButton icon={<IconHome />} label="Home" onClick={() => setView("home")} />
      <ToolButton icon={<IconSessions />} label="Sessions" onClick={() => setView("home")} />
      <ToolDivider />
      <ToolButton icon={<IconAll />} label="All" active={!onlyDiffs} onClick={() => setOnlyDiffs(false)} />
      <ToolButton icon={<IconDiffs />} label="Diffs" active={onlyDiffs} onClick={() => setOnlyDiffs(true)} />
      <ToolDivider />
      <ToolButton icon={<IconSwap />} label="Swap" onClick={swap} disabled={!left || !right} />
      <ToolButton icon={<IconReload />} label={loading ? "…" : "Compare"} onClick={() => run()} disabled={!left || !right} />
    </>
  );

  return (
    <Chrome menus={menus} toolbar={toolbar} accent={ACCENT.folder}>
      <div className="flex items-center gap-3 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <PathPicker
          label="Left"
          value={left}
          placeholder="Choose left folder…"
          onPick={async () => {
            const p = await pickFolder("Left folder");
            if (p) {
              setLeft(p);
              if (right) run(p, right);
            }
          }}
        />
        <PathPicker
          label="Right"
          value={right}
          placeholder="Choose right folder…"
          onPick={async () => {
            const p = await pickFolder("Right folder");
            if (p) {
              setRight(p);
              if (left) run(left, p);
            }
          }}
        />
      </div>

      <div className="flex items-center border-b border-neutral-200 bg-neutral-50 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex-1">Name</div>
        <div className="w-24 text-right">Size</div>
        <div className="w-40 text-right">Left modified</div>
        <div className="w-40 text-right">Right modified</div>
      </div>

      <div className="flex-1 overflow-auto font-mono text-[13px]">
        {error && <div className="p-4 text-sm text-red-500">{error}</div>}
        {!result && !error && (
          <div className="p-8 text-center text-sm text-neutral-400">
            Pick a left and right folder to compare.
          </div>
        )}
        {visible.map(({ node, depth }) => (
          <Row
            key={node.rel_path}
            node={node}
            depth={depth}
            expanded={expanded.has(node.rel_path)}
            onActivate={() => onRowActivate(node)}
          />
        ))}
      </div>

      <div className="flex h-7 shrink-0 items-center gap-4 border-t border-neutral-200 px-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        {result && (
          <>
            <span className="text-amber-600 dark:text-amber-400">{result.stats.different} different</span>
            <span className="text-emerald-600 dark:text-emerald-400">{result.stats.left_only} left only</span>
            <span className="text-sky-600 dark:text-sky-400">{result.stats.right_only} right only</span>
            <span>{result.stats.same} same</span>
          </>
        )}
      </div>
    </Chrome>
  );
}

function expandAll(
  result: FolderCompareResult | null,
  setExpanded: (s: Set<string>) => void,
) {
  if (!result) return;
  const all = new Set<string>();
  const walk = (nodes: Node[]) => {
    for (const n of nodes)
      if (n.is_dir) {
        all.add(n.rel_path);
        walk(n.children);
      }
  };
  walk(result.root);
  setExpanded(all);
}

function meta(side: SideMeta | null, field: "size" | "mtime") {
  if (!side) return "";
  return field === "size" ? formatSize(side.size) : formatDate(side.mtime);
}

function Row({
  node,
  depth,
  expanded,
  onActivate,
}: {
  node: Node;
  depth: number;
  expanded: boolean;
  onActivate: () => void;
}) {
  const clickable =
    node.is_dir || (node.status !== "same" && !!node.left && !!node.right);
  return (
    <div
      onClick={onActivate}
      className={
        "flex items-center px-3 py-[3px] " +
        statusRowBg(node.status) +
        (clickable
          ? " cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
          : "")
      }
    >
      <div className="flex min-w-0 flex-1 items-center" style={{ paddingLeft: depth * 16 }}>
        <span className="mr-1 w-4 shrink-0 text-neutral-400">
          {node.is_dir ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span className="mr-1.5 shrink-0 text-neutral-400">{node.is_dir ? "🗀" : "🗎"}</span>
        <span className={"truncate " + statusColor(node.status)}>{node.name}</span>
        {node.is_dir && node.diff_count > 0 && (
          <span className="ml-2 shrink-0 rounded bg-amber-500/15 px-1.5 text-[10px] text-amber-600 dark:text-amber-400">
            {node.diff_count}
          </span>
        )}
      </div>
      <div className="w-24 text-right text-neutral-400">{meta(node.left ?? node.right, "size")}</div>
      <div className="w-40 text-right text-neutral-400">{meta(node.left, "mtime")}</div>
      <div className="w-40 text-right text-neutral-400">{meta(node.right, "mtime")}</div>
    </div>
  );
}
