import { useEffect, useMemo, useRef, useState } from "react";
import { api, Cell, DiffResult, FileMeta, pickFile, Row } from "../lib/api";
import { baseName, formatDate } from "../lib/format";
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
  IconContext,
  IconCopyLeft,
  IconCopyRight,
  IconDiffs,
  IconHome,
  IconMinor,
  IconNext,
  IconPrev,
  IconReload,
  IconSame,
  IconSessions,
  IconSplitH,
  IconSplitV,
  IconSwap,
} from "../components/Icons";

type Filter = "all" | "diffs" | "same";
type Layout = "split" | "unified";
const CTX = 2;
const ROW_H = 20; // px, matches leading-5

type DisplayItem =
  | { type: "row"; row: Row; index: number }
  | { type: "gap"; count: number };

export default function FileCompare() {
  const consumePending = useApp((s) => s.consumePending);
  const addRecent = useApp((s) => s.addRecent);
  const setView = useApp((s) => s.setView);

  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [collapse, setCollapse] = useState(false);
  const [ignoreWs, setIgnoreWs] = useState(false);
  const [leftPct, setLeftPct] = useState(50);
  const [layout, setLayout] = useState<Layout>("split");

  const vscroll = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  async function run(l: string, r: string, iw = ignoreWs) {
    setError(null);
    try {
      const res = await api.diffFiles(l, r, iw);
      setDiff(res);
      setCursor(0);
      addRecent({ kind: "file", left: l, right: r });
    } catch (e) {
      setError(String(e));
      setDiff(null);
    }
  }

  useEffect(() => {
    const p = consumePending("file");
    if (p) {
      setLeft(p.left);
      setRight(p.right);
      run(p.left, p.right);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function swap() {
    const nl = right;
    const nr = left;
    setLeft(nl);
    setRight(nr);
    if (nl && nr) run(nl, nr);
  }

  function toggleIgnoreWs() {
    const v = !ignoreWs;
    setIgnoreWs(v);
    if (left && right) run(left, right, v);
  }

  async function copyOver(dir: "lr" | "rl") {
    if (!left || !right) return;
    const [src, dst] = dir === "lr" ? [left, right] : [right, left];
    if (
      !window.confirm(
        `Overwrite ${baseName(dst)} with the contents of ${baseName(src)}? This cannot be undone.`,
      )
    )
      return;
    try {
      const content = await api.readTextFile(src);
      await api.writeTextFile(dst, content);
      run(left, right);
    } catch (e) {
      setError(String(e));
    }
  }

  // Row indices that begin a diff section (contiguous run of non-equal rows).
  const diffBlocks = useMemo(() => {
    if (!diff) return [];
    const idxs: number[] = [];
    let prevEqual = true;
    diff.rows.forEach((r, i) => {
      const isDiff = r.kind !== "equal";
      if (isDiff && prevEqual) idxs.push(i);
      prevEqual = !isDiff;
    });
    return idxs;
  }, [diff]);

  // Active section [start,end) for the current cursor.
  const activeRange = useMemo<[number, number] | null>(() => {
    if (!diff || !diffBlocks.length) return null;
    const start = diffBlocks[Math.min(cursor, diffBlocks.length - 1)];
    let end = start;
    while (end < diff.rows.length && diff.rows[end].kind !== "equal") end++;
    return [start, end];
  }, [diff, diffBlocks, cursor]);

  function goto(blockIdx: number) {
    if (diffBlocks.length === 0) return;
    const wrapped = (blockIdx + diffBlocks.length) % diffBlocks.length;
    setCursor(wrapped);
    rowRefs.current[diffBlocks[wrapped]]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F3" || (e.key === "n" && !e.metaKey && !e.ctrlKey))
        goto(cursor + 1);
      if (e.key === "p") goto(cursor - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Divider drag to resize the split.
  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    function move(ev: PointerEvent) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(80, Math.max(20, pct)));
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const items = useMemo<DisplayItem[]>(() => {
    if (!diff) return [];
    const rows = diff.rows;
    if (filter === "diffs")
      return rows
        .map((row, index) => ({ row, index }))
        .filter((x) => x.row.kind !== "equal")
        .map((x) => ({ type: "row", row: x.row, index: x.index }) as DisplayItem);
    if (filter === "same")
      return rows
        .map((row, index) => ({ row, index }))
        .filter((x) => x.row.kind === "equal")
        .map((x) => ({ type: "row", row: x.row, index: x.index }) as DisplayItem);

    if (!collapse) return rows.map((row, index) => ({ type: "row", row, index }));

    const out: DisplayItem[] = [];
    let i = 0;
    while (i < rows.length) {
      if (rows[i].kind !== "equal") {
        out.push({ type: "row", row: rows[i], index: i });
        i++;
        continue;
      }
      let j = i;
      while (j < rows.length && rows[j].kind === "equal") j++;
      const runLen = j - i;
      if (runLen <= 2 * CTX) {
        for (let k = i; k < j; k++) out.push({ type: "row", row: rows[k], index: k });
      } else {
        for (let k = i; k < i + CTX; k++) out.push({ type: "row", row: rows[k], index: k });
        out.push({ type: "gap", count: runLen - 2 * CTX });
        for (let k = j - CTX; k < j; k++) out.push({ type: "row", row: rows[k], index: k });
      }
      i = j;
    }
    return out;
  }, [diff, filter, collapse]);

  const menus = useStandardMenus({
    File: [
      { label: "Reload", shortcut: "⌘R", onClick: () => left && right && run(left, right), disabled: !diff },
      { label: "Swap sides", onClick: swap, disabled: !left || !right },
    ],
    Edit: [
      { label: "Copy left → right", onClick: () => copyOver("lr"), disabled: !diff },
      { label: "Copy right → left", onClick: () => copyOver("rl"), disabled: !diff },
    ],
    Search: [
      { label: "Next difference", shortcut: "F3", onClick: () => goto(cursor + 1), disabled: !diffBlocks.length },
      { label: "Previous difference", shortcut: "p", onClick: () => goto(cursor - 1), disabled: !diffBlocks.length },
    ],
    View: [
      { label: "Show all", checked: filter === "all", onClick: () => setFilter("all") },
      { label: "Differences only", checked: filter === "diffs", onClick: () => setFilter("diffs") },
      { label: "Same only", checked: filter === "same", onClick: () => setFilter("same") },
      { separator: true },
      { label: "Collapse unchanged", checked: collapse, onClick: () => setCollapse((v) => !v) },
      { label: "Ignore whitespace", checked: ignoreWs, onClick: toggleIgnoreWs },
      { separator: true },
      { label: "Side by side", checked: layout === "split", onClick: () => setLayout("split") },
      { label: "Stacked (unified)", checked: layout === "unified", onClick: () => setLayout("unified") },
      { separator: true },
      { label: "Center split", onClick: () => setLeftPct(50) },
    ],
  });

  const toolbar = (
    <>
      <ToolButton icon={<IconHome />} label="Home" onClick={() => setView("home")} />
      <ToolButton icon={<IconSessions />} label="Sessions" onClick={() => setView("home")} />
      <ToolDivider />
      <ToolButton icon={<IconAll />} label="All" active={filter === "all"} onClick={() => setFilter("all")} />
      <ToolButton icon={<IconDiffs />} label="Diffs" active={filter === "diffs"} onClick={() => setFilter("diffs")} />
      <ToolButton icon={<IconSame />} label="Same" active={filter === "same"} onClick={() => setFilter("same")} />
      <ToolDivider />
      <ToolButton icon={<IconContext />} label="Context" active={collapse} onClick={() => setCollapse((v) => !v)} title="Collapse unchanged lines" />
      <ToolButton icon={<IconMinor />} label="Minor" active={ignoreWs} onClick={toggleIgnoreWs} title="Ignore whitespace differences" />
      <ToolDivider />
      <ToolButton
        icon={layout === "split" ? <IconSplitV /> : <IconSplitH />}
        label={layout === "split" ? "Stacked" : "Side by side"}
        active={layout === "unified"}
        onClick={() => setLayout((v) => (v === "split" ? "unified" : "split"))}
        title={layout === "split" ? "Switch to stacked (unified) view" : "Switch to side-by-side view"}
      />
      <ToolDivider />
      <ToolButton icon={<IconCopyRight />} label="Copy →" onClick={() => copyOver("lr")} disabled={!diff} title="Overwrite right with left" />
      <ToolButton icon={<IconCopyLeft />} label="← Copy" onClick={() => copyOver("rl")} disabled={!diff} title="Overwrite left with right" />
      <ToolDivider />
      <ToolButton icon={<IconNext />} label="Next" onClick={() => goto(cursor + 1)} disabled={!diffBlocks.length} title="Next difference" />
      <ToolButton icon={<IconPrev />} label="Prev" onClick={() => goto(cursor - 1)} disabled={!diffBlocks.length} title="Previous difference" />
      <ToolDivider />
      <ToolButton icon={<IconSwap />} label="Swap" onClick={swap} disabled={!left || !right} />
      <ToolButton icon={<IconReload />} label="Reload" onClick={() => left && right && run(left, right)} disabled={!diff} />
      <div className="ml-auto pr-1 text-xs text-neutral-400">
        {diffBlocks.length > 0 ? `${cursor + 1}/${diffBlocks.length}` : "0 diffs"}
      </div>
    </>
  );

  const totalRows = diff?.rows.length ?? 0;

  return (
    <Chrome menus={menus} toolbar={toolbar} accent={ACCENT.file}>
      <PathInfoBar
        left={left}
        right={right}
        leftMeta={diff?.left_meta ?? null}
        rightMeta={diff?.right_meta ?? null}
        onChangeLeft={setLeft}
        onChangeRight={setRight}
        onCommitLeft={(v) => v && right && run(v, right)}
        onCommitRight={(v) => v && left && run(left, v)}
        onPickLeft={async () => {
          const p = await pickFile("Left file");
          if (p) {
            setLeft(p);
            if (right) run(p, right);
          }
        }}
        onPickRight={async () => {
          const p = await pickFile("Right file");
          if (p) {
            setRight(p);
            if (left) run(left, p);
          }
        }}
      />

      <div className="relative flex-1 overflow-hidden">
        {error && <div className="p-4 text-sm text-red-500">{error}</div>}
        {!diff && !error && (
          <div className="p-8 text-center text-sm text-neutral-400">
            Pick two files to compare, or reopen a recent session.
          </div>
        )}
        {diff && (
          <>
            <div ref={vscroll} className="h-full overflow-y-auto pr-2.5">
              {layout === "unified" ? (
                <div ref={containerRef} className="min-h-full overflow-x-auto">
                  {items.map((it, i) =>
                    it.type === "gap" ? (
                      <GapLine key={`ug${i}`} count={it.count} />
                    ) : it.row.kind === "equal" ? (
                      <Line
                        key={`ue${it.index}`}
                        cell={it.row.right ?? it.row.left}
                        kind="equal"
                        side="right"
                        active={false}
                        refCb={(el) => (rowRefs.current[it.index] = el)}
                      />
                    ) : (
                      <div
                        key={`u${it.index}`}
                        ref={(el) => (rowRefs.current[it.index] = el)}
                      >
                        {it.row.left && (
                          <Line
                            cell={it.row.left}
                            kind={it.row.kind === "insert" ? "insert" : "delete"}
                            side="left"
                            active={
                              !!activeRange &&
                              it.index >= activeRange[0] &&
                              it.index < activeRange[1]
                            }
                          />
                        )}
                        {it.row.right && (
                          <Line
                            cell={it.row.right}
                            kind={it.row.kind === "delete" ? "delete" : "insert"}
                            side="right"
                            active={
                              !!activeRange &&
                              it.index >= activeRange[0] &&
                              it.index < activeRange[1]
                            }
                          />
                        )}
                      </div>
                    ),
                  )}
                </div>
              ) : (
              <div ref={containerRef} className="flex min-h-full">
                {/* LEFT pane */}
                <div
                  className="overflow-x-auto"
                  style={{ width: `${leftPct}%` }}
                >
                  {items.map((it, i) =>
                    it.type === "gap" ? (
                      <GapLine key={`lg${i}`} count={it.count} />
                    ) : (
                      <Line
                        key={`l${it.index}`}
                        cell={it.row.left}
                        kind={it.row.kind}
                        side="left"
                        active={
                          !!activeRange &&
                          it.index >= activeRange[0] &&
                          it.index < activeRange[1]
                        }
                        refCb={(el) => (rowRefs.current[it.index] = el)}
                      />
                    ),
                  )}
                </div>

                {/* CENTER marker strip = draggable divider */}
                <div
                  onPointerDown={startDrag}
                  className="w-4 shrink-0 cursor-col-resize border-x border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
                  title="Drag to resize"
                >
                  {items.map((it, i) =>
                    it.type === "gap" ? (
                      <div key={`mg${i}`} style={{ height: ROW_H }} />
                    ) : (
                      <Marker key={`m${it.index}`} kind={it.row.kind} />
                    ),
                  )}
                </div>

                {/* RIGHT pane */}
                <div className="flex-1 overflow-x-auto">
                  {items.map((it, i) =>
                    it.type === "gap" ? (
                      <GapLine key={`rg${i}`} count={it.count} />
                    ) : (
                      <Line
                        key={`r${it.index}`}
                        cell={it.row.right}
                        kind={it.row.kind}
                        side="right"
                        active={
                          !!activeRange &&
                          it.index >= activeRange[0] &&
                          it.index < activeRange[1]
                        }
                      />
                    ),
                  )}
                </div>
              </div>
              )}
            </div>

            {/* Diff minimap */}
            <Minimap
              blocks={diffBlocks}
              rows={diff.rows}
              total={totalRows}
              cursor={cursor}
              onJump={(bi) => goto(bi)}
            />
          </>
        )}
      </div>

      <div className="flex h-7 shrink-0 items-center gap-4 border-t border-neutral-200 px-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        {diff && (
          <>
            <span className="text-emerald-600 dark:text-emerald-400">+{diff.added}</span>
            <span className="text-red-600 dark:text-red-400">-{diff.removed}</span>
            <span className="text-amber-600 dark:text-amber-400">~{diff.changed} changed</span>
            {ignoreWs && <span>ignoring whitespace</span>}
            <span className="ml-auto">
              {diff.added + diff.removed + diff.changed === 0
                ? "Files are identical"
                : `${diffBlocks.length} difference section${diffBlocks.length === 1 ? "" : "s"}`}
            </span>
          </>
        )}
      </div>
    </Chrome>
  );
}

// ---- Rendering pieces ----

function lineBg(kind: string, side: "left" | "right", empty: boolean, active: boolean) {
  if (empty) return "bg-neutral-100/70 dark:bg-neutral-900/70";
  let base = "";
  if (kind === "change") base = "bg-amber-50 dark:bg-amber-500/10";
  else if (kind === "delete" && side === "left") base = "bg-red-50 dark:bg-red-500/10";
  else if (kind === "insert" && side === "right") base = "bg-emerald-50 dark:bg-emerald-500/10";
  if (active && kind !== "equal")
    base += " ring-1 ring-inset ring-blue-400/50 dark:ring-blue-400/40";
  return base;
}

function renderText(cell: Cell | null) {
  if (!cell) return <span> </span>;
  if (!cell.spans.length) return <span>{cell.text || " "}</span>;
  const parts: React.ReactNode[] = [];
  let pos = 0;
  const chars = Array.from(cell.text);
  cell.spans.forEach((sp, k) => {
    if (sp.start > pos)
      parts.push(<span key={`p${k}`}>{chars.slice(pos, sp.start).join("")}</span>);
    parts.push(
      <span key={`h${k}`} className="rounded-sm bg-amber-300/60 dark:bg-amber-400/30">
        {chars.slice(sp.start, sp.end).join("")}
      </span>,
    );
    pos = sp.end;
  });
  if (pos < chars.length) parts.push(<span key="end">{chars.slice(pos).join("")}</span>);
  return <>{parts}</>;
}

function Line({
  cell,
  kind,
  side,
  active,
  refCb,
}: {
  cell: Cell | null;
  kind: string;
  side: "left" | "right";
  active: boolean;
  refCb?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={refCb}
      className={"flex font-mono text-[12.5px] " + lineBg(kind, side, !cell, active)}
      style={{ height: ROW_H, lineHeight: `${ROW_H}px` }}
    >
      <span className="sticky left-0 z-10 w-10 shrink-0 select-none border-r border-neutral-200 bg-inherit pr-1 text-right text-neutral-400 dark:border-neutral-800">
        {cell?.line_no ?? ""}
      </span>
      <span className="whitespace-pre px-2">{renderText(cell)}</span>
    </div>
  );
}

function GapLine({ count }: { count: number }) {
  return (
    <div
      className="select-none bg-neutral-50 text-center text-[11px] italic text-neutral-400 dark:bg-neutral-900/60"
      style={{ height: ROW_H, lineHeight: `${ROW_H}px` }}
    >
      ⋯ {count} unchanged ⋯
    </div>
  );
}

function Marker({ kind }: { kind: string }) {
  const map: Record<string, { c: string; s: string }> = {
    change: { c: "text-amber-500", s: "≠" },
    insert: { c: "text-emerald-500", s: "+" },
    delete: { c: "text-red-500", s: "−" },
    equal: { c: "text-transparent", s: "" },
  };
  const m = map[kind] ?? map.equal;
  return (
    <div
      className={"text-center text-[11px] font-bold " + m.c}
      style={{ height: ROW_H, lineHeight: `${ROW_H}px` }}
    >
      {m.s}
    </div>
  );
}

function Minimap({
  blocks,
  rows,
  total,
  cursor,
  onJump,
}: {
  blocks: number[];
  rows: Row[];
  total: number;
  cursor: number;
  onJump: (blockIdx: number) => void;
}) {
  if (!blocks.length || total === 0) return null;
  const color = (k: string) =>
    k === "change"
      ? "#f59e0b"
      : k === "insert"
        ? "#10b981"
        : k === "delete"
          ? "#ef4444"
          : "#9ca3af";
  return (
    <div className="absolute right-0 top-0 h-full w-2.5 bg-neutral-100/60 dark:bg-neutral-900/60">
      {blocks.map((b, i) => (
        <button
          key={b}
          onClick={() => onJump(i)}
          title={`Difference ${i + 1}`}
          className="absolute left-0 w-full"
          style={{
            top: `${(b / total) * 100}%`,
            height: Math.max(3, (1 / total) * 100 * 3) + "%",
            background: color(rows[b].kind),
            outline: i === cursor ? "1px solid #3b82f6" : "none",
            opacity: i === cursor ? 1 : 0.7,
          }}
        />
      ))}
    </div>
  );
}

function PathInfoBar({
  left,
  right,
  leftMeta,
  rightMeta,
  onPickLeft,
  onPickRight,
  onChangeLeft,
  onChangeRight,
  onCommitLeft,
  onCommitRight,
}: {
  left: string;
  right: string;
  leftMeta: FileMeta | null;
  rightMeta: FileMeta | null;
  onPickLeft: () => void;
  onPickRight: () => void;
  onChangeLeft: (value: string) => void;
  onChangeRight: (value: string) => void;
  onCommitLeft: (value: string) => void;
  onCommitRight: (value: string) => void;
}) {
  const side = (
    path: string,
    meta: FileMeta | null,
    onPick: () => void,
    onChange: (value: string) => void,
    onCommit: (value: string) => void,
  ) => (
    <div className="min-w-0 flex-1">
      <div className="flex w-full items-center gap-2 rounded border border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-xs text-neutral-700 focus-within:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
        <span className="shrink-0 text-neutral-400">🗎</span>
        <input
          value={path}
          spellCheck={false}
          placeholder="Type or paste a file path…"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommit(path);
              (e.target as HTMLInputElement).blur();
            }
          }}
          title={path}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-neutral-400"
        />
        <button
          onClick={onPick}
          title="Browse…"
          className="shrink-0 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          📁
        </button>
      </div>
      <div className="mt-0.5 flex items-center gap-3 px-1 text-[11px] text-neutral-400">
        {meta ? (
          <>
            <span>{formatDate(meta.mtime)}</span>
            <span>{meta.size.toLocaleString()} bytes</span>
            <span>Text</span>
            <span>UTF-8</span>
          </>
        ) : (
          <span>&nbsp;</span>
        )}
      </div>
    </div>
  );
  return (
    <div className="flex items-start gap-3 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
      {side(left, leftMeta, onPickLeft, onChangeLeft, onCommitLeft)}
      {side(right, rightMeta, onPickRight, onChangeRight, onCommitRight)}
    </div>
  );
}
