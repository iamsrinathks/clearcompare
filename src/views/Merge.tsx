import { useEffect, useMemo, useState } from "react";
import { api, MergeResult, pickFile, Region } from "../lib/api";
import { save } from "@tauri-apps/plugin-dialog";
import { baseName } from "../lib/format";
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
} from "../components/Icons";

export default function Merge() {
  const consumePending = useApp((s) => s.consumePending);
  const addRecent = useApp((s) => s.addRecent);
  const [base, setBase] = useState("");
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [merge, setMerge] = useState<MergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // resolved text per region index
  const [resolved, setResolved] = useState<string[]>([]);
  // conflict region indices the user has explicitly resolved
  const [touched, setTouched] = useState<Set<number>>(new Set());

  async function run(b = base, l = left, r = right) {
    if (!b || !l || !r) return;
    setError(null);
    try {
      const res = await api.merge3Files(b, l, r);
      setMerge(res);
      setResolved(res.regions.map((rg) => rg.text));
      setTouched(new Set());
      addRecent({ kind: "merge", base: b, left: l, right: r });
    } catch (e) {
      setError(String(e));
      setMerge(null);
    }
  }

  useEffect(() => {
    const p = consumePending("merge");
    if (p) {
      setBase(p.base);
      setLeft(p.left);
      setRight(p.right);
      run(p.base, p.left, p.right);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const output = useMemo(() => resolved.join("\n"), [resolved]);
  const unresolved = useMemo(() => {
    if (!merge) return 0;
    return merge.regions.filter(
      (rg, i) => rg.kind === "conflict" && !touched.has(i),
    ).length;
  }, [merge, touched]);

  function setRegion(i: number, text: string) {
    setResolved((prev) => {
      const next = [...prev];
      next[i] = text;
      return next;
    });
    setTouched((prev) => new Set(prev).add(i));
  }

  async function saveOutput() {
    const path = await save({ title: "Save merged file", defaultPath: left });
    if (!path) return;
    try {
      await api.writeTextFile(path, output);
    } catch (e) {
      setError(String(e));
    }
  }

  const setView = useApp((s) => s.setView);
  const menus = useStandardMenus({
    File: [
      { label: "Save output…", onClick: saveOutput, disabled: !merge },
      { label: "Reload", onClick: () => run(), disabled: !base || !left || !right },
    ],
  });
  const toolbar = (
    <>
      <ToolButton icon={<IconHome />} label="Home" onClick={() => setView("home")} />
      <ToolButton icon={<IconSessions />} label="Sessions" onClick={() => setView("home")} />
      <ToolDivider />
      <ToolButton icon={<IconReload />} label="Reload" onClick={() => run()} disabled={!base || !left || !right} />
      <ToolButton icon={<IconSave />} label="Save" onClick={saveOutput} disabled={!merge} />
      <div className="ml-auto pr-1 text-xs text-neutral-400">
        {merge ? (unresolved > 0 ? `${unresolved} unresolved` : "all resolved") : ""}
      </div>
    </>
  );

  return (
    <Chrome menus={menus} toolbar={toolbar} accent={ACCENT.merge}>
      <div className="grid grid-cols-3 gap-3 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <PathPicker
          label="Base"
          value={base}
          placeholder="Common ancestor…"
          onPick={async () => {
            const p = await pickFile("Base (common ancestor)");
            if (p) {
              setBase(p);
              run(p, left, right);
            }
          }}
        />
        <PathPicker
          label="Left"
          value={left}
          placeholder="Your version…"
          onPick={async () => {
            const p = await pickFile("Left version");
            if (p) {
              setLeft(p);
              run(base, p, right);
            }
          }}
        />
        <PathPicker
          label="Right"
          value={right}
          placeholder="Their version…"
          onPick={async () => {
            const p = await pickFile("Right version");
            if (p) {
              setRight(p);
              run(base, left, p);
            }
          }}
        />
      </div>

      <div className="flex-1 overflow-auto">
        {error && <div className="p-4 text-sm text-red-500">{error}</div>}
        {!merge && !error && (
          <div className="p-8 text-center text-sm text-neutral-400">
            Pick base, left, and right files to merge.
          </div>
        )}
        {merge && (
          <div className="font-mono text-[12.5px] leading-5">
            {merge.regions.map((rg, i) =>
              rg.kind === "clean" ? (
                <pre
                  key={i}
                  className="whitespace-pre-wrap break-all px-3 py-0.5 text-neutral-700 dark:text-neutral-300"
                >
                  {rg.text || " "}
                </pre>
              ) : (
                <ConflictBlock
                  key={i}
                  region={rg}
                  value={resolved[i] ?? ""}
                  onChoose={(t) => setRegion(i, t)}
                />
              ),
            )}
          </div>
        )}
      </div>

      <StatusBar>
        {merge && (
          <>
            <span>
              {baseName(left)} ⇋ {baseName(right)}
            </span>
            <span
              className={
                merge.conflicts > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }
            >
              {merge.conflicts} conflict{merge.conflicts === 1 ? "" : "s"}
            </span>
          </>
        )}
      </StatusBar>
    </Chrome>
  );
}

function ConflictBlock({
  region,
  value,
  onChoose,
}: {
  region: Region;
  value: string;
  onChoose: (text: string) => void;
}) {
  return (
    <div className="my-1 border-y border-amber-300/60 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5">
      <div className="flex items-center gap-2 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
        Conflict
        <div className="ml-auto flex gap-1">
          <ChooseBtn label="Left" onClick={() => onChoose(region.left ?? "")} />
          <ChooseBtn label="Base" onClick={() => onChoose(region.base ?? "")} />
          <ChooseBtn label="Right" onClick={() => onChoose(region.right ?? "")} />
          <ChooseBtn
            label="Both"
            onClick={() =>
              onChoose(`${region.left ?? ""}\n${region.right ?? ""}`)
            }
          />
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChoose(e.target.value)}
        spellCheck={false}
        rows={Math.max(2, value.split("\n").length)}
        className="w-full resize-y bg-transparent px-3 py-1 font-mono text-[12.5px] leading-5 outline-none"
      />
    </div>
  );
}

function ChooseBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded bg-white/70 px-2 py-0.5 text-[11px] text-amber-800 hover:bg-white dark:bg-neutral-800 dark:text-amber-300 dark:hover:bg-neutral-700"
    >
      {label}
    </button>
  );
}
