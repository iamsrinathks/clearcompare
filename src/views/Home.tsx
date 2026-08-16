import { Session, useApp, View } from "../store";
import { baseName } from "../lib/format";
import { MenuBar, useStandardMenus } from "../components/AppChrome";

interface Tile {
  view: View;
  title: string;
  desc: string;
  icon: string;
  pro?: boolean;
}

const tiles: Tile[] = [
  {
    view: "folder",
    title: "Folder Compare",
    desc: "Compare two folders side by side",
    icon: "▤",
  },
  {
    view: "file",
    title: "File Compare",
    desc: "Diff two text files line by line",
    icon: "≣",
  },
  {
    view: "sync",
    title: "Folder Sync",
    desc: "Mirror or update between locations",
    icon: "⇄",
  },
  {
    view: "merge",
    title: "3-way Merge",
    desc: "Merge changes against a common base",
    icon: "⑃",
    pro: true,
  },
];

const kindMeta: Record<Session["kind"], { icon: string; label: string }> = {
  folder: { icon: "▤", label: "Folder Compare" },
  file: { icon: "≣", label: "File Compare" },
  sync: { icon: "⇄", label: "Folder Sync" },
  merge: { icon: "⑃", label: "3-way Merge" },
};

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function sessionSummary(s: Session): string {
  if (s.kind === "merge")
    return `${baseName(s.left)} ⇋ ${baseName(s.right)} (base ${baseName(s.base)})`;
  return `${baseName(s.left)} ↔ ${baseName(s.right)}`;
}

export default function Home() {
  const setView = useApp((s) => s.setView);
  const theme = useApp((s) => s.theme);
  const toggleTheme = useApp((s) => s.toggleTheme);
  const toggleHelp = useApp((s) => s.toggleHelp);
  const recents = useApp((s) => s.recents);
  const openSession = useApp((s) => s.openSession);
  const clearRecents = useApp((s) => s.clearRecents);
  const menus = useStandardMenus();

  return (
    <div className="flex h-full flex-col">
      <MenuBar menus={menus} />
      <div className="flex flex-1 flex-col overflow-auto">
      <div className="flex items-center px-8 pt-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ClearCompare</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Clean file &amp; folder comparison for developers
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => toggleHelp(true)}
            className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
          <button
            onClick={toggleTheme}
            className="rounded-md px-2 py-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="Toggle theme"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-8 pb-4 sm:grid-cols-2">
        {tiles.map((t, i) => (
          <button
            key={t.view}
            onClick={() => setView(t.view)}
            className="group flex items-start gap-4 rounded-xl border border-neutral-200 bg-white p-5 text-left transition-all hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-xl text-neutral-600 group-hover:bg-neutral-900 group-hover:text-white dark:bg-neutral-800 dark:text-neutral-300 dark:group-hover:bg-white dark:group-hover:text-neutral-900">
              {t.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.title}</span>
                {t.pro && (
                  <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Pro
                  </span>
                )}
                <span className="ml-1 rounded bg-neutral-100 px-1.5 text-[10px] text-neutral-400 dark:bg-neutral-800">
                  ⌘{i + 1}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-neutral-500">{t.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {recents.length > 0 && (
        <div className="px-8 pb-8">
          <div className="mb-2 flex items-center">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Recent
            </h2>
            <button
              onClick={clearRecents}
              className="ml-auto text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              Clear
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
            {recents.map((s) => (
              <button
                key={s.id}
                onClick={() => openSession(s)}
                className="flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-left last:border-0 hover:bg-neutral-50 dark:border-neutral-800/60 dark:hover:bg-neutral-900"
              >
                <span className="w-5 shrink-0 text-center text-neutral-400">
                  {kindMeta[s.kind].icon}
                </span>
                <span className="w-28 shrink-0 text-xs text-neutral-400">
                  {kindMeta[s.kind].label}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-neutral-700 dark:text-neutral-300">
                  {sessionSummary(s)}
                </span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {relTime(s.ts)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
