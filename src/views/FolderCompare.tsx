import { useEffect, useMemo, useRef, useState } from "react";
import {
  FolderCompareResult,
  Node,
  pickFolder,
  SideMeta,
  startFolderCompare,
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
  IconHash,
  IconHome,
  IconReload,
  IconSessions,
  IconStop,
  IconSwap,
} from "../components/Icons";
import { PathPicker } from "../components/Shell";

// Fixed row height (px) so the tree can be virtualized. Must match the height
// applied in <Row>.
const ROW_H = 24;
const OVERSCAN = 8;

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
  const [exact, setExact] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  // cancel fn for the in-flight comparison, if any
  const cancelRef = useRef<(() => void) | null>(null);
  // virtual scrolling state for the (potentially huge) tree
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(0);

  async function run(l = left, r = right, ex = exact) {
    if (!l || !r) return;
    // Supersede any comparison already running.
    cancelRef.current?.();
    setLoading(true);
    setError(null);
    setProgress(0);
    const handle = startFolderCompare(l, r, ex, setProgress);
    cancelRef.current = handle.cancel;
    try {
      const res = await handle.result;
      setResult(res);
      addRecent({ kind: "folder", left: l, right: r });
      const next = new Set<string>();
      for (const n of res.root)
        if (n.is_dir && n.diff_count > 0) next.add(n.rel_path);
      setExpanded(next);
    } catch (e) {
      // A cancelled run rejects with "cancelled"; keep prior results silently.
      if (String(e).includes("cancelled")) return;
      setError(String(e));
      setResult(null);
    } finally {
      cancelRef.current = null;
      setLoading(false);
    }
  }

  function cancel() {
    cancelRef.current?.();
  }

  // Cancel any running comparison when leaving the view.
  useEffect(() => () => cancelRef.current?.(), []);

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

  // Track the scroll container's scroll position and height for virtualization.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    el.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  // Only render the rows currently in (or near) the viewport.
  const total = visible.length * ROW_H;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endIdx = Math.min(
    visible.length,
    Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN,
  );
  const windowed = visible.slice(startIdx, endIdx);
  const offsetY = startIdx * ROW_H;

  function toggleExact() {
    const v = !exact;
    setExact(v);
    if (left && right) run(left, right, v);
  }

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
      { separator: true },
      { label: "Quick compare (size + modified time)", checked: !exact, onClick: () => exact && toggleExact() },
      { label: "Exact compare (hash contents)", checked: exact, onClick: () => !exact && toggleExact() },
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
      <ToolButton
        icon={<IconHash />}
        label="Exact"
        active={exact}
        onClick={toggleExact}
        title={
          exact
            ? "Exact: comparing file contents by hash"
            : "Quick: comparing by size + modified time (click for exact hash compare)"
        }
      />
      <ToolDivider />
      <ToolButton icon={<IconSwap />} label="Swap" onClick={swap} disabled={!left || !right} />
      {loading ? (
        <ToolButton icon={<IconStop />} label="Cancel" onClick={cancel} />
      ) : (
        <ToolButton icon={<IconReload />} label="Compare" onClick={() => run()} disabled={!left || !right} />
      )}
      {loading && (
        <div className="ml-auto pr-1 text-xs text-neutral-400">
          Comparing… {progress.toLocaleString()} files
        </div>
      )}
    </>
  );

  return (
    <Chrome menus={menus} toolbar={toolbar} accent={ACCENT.folder}>
      <div className="flex items-center gap-3 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <PathPicker
          label="Left"
          value={left}
          placeholder="Type or paste a folder path…"
          onChange={setLeft}
          onCommit={(v) => v && right && run(v, right)}
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
          placeholder="Type or paste a folder path…"
          onChange={setRight}
          onCommit={(v) => v && left && run(left, v)}
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

      <div ref={scrollRef} className="flex-1 overflow-auto font-mono text-[13px]">
        {error && <div className="p-4 text-sm text-red-500">{error}</div>}
        {loading && !result && (
          <div className="p-8 text-center text-sm text-neutral-400">
            Comparing… {progress.toLocaleString()} files examined
          </div>
        )}
        {!result && !error && !loading && (
          <div className="p-8 text-center text-sm text-neutral-400">
            Pick a left and right folder to compare.
          </div>
        )}
        {visible.length > 0 && (
          // Spacer sized to the full list; only the windowed rows are mounted,
          // shifted into place so scrolling stays correct.
          <div style={{ height: total }} className="relative">
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {windowed.map(({ node, depth }) => (
                <Row
                  key={node.rel_path}
                  node={node}
                  depth={depth}
                  expanded={expanded.has(node.rel_path)}
                  onActivate={() => onRowActivate(node)}
                />
              ))}
            </div>
          </div>
        )}
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
      style={{ height: ROW_H }}
      className={
        "flex items-center px-3 " +
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
