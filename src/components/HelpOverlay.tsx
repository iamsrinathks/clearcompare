import { useApp } from "../store";

const groups: { title: string; items: [string, string][] }[] = [
  {
    title: "Navigation",
    items: [
      ["⌘/Ctrl + 1", "Folder Compare"],
      ["⌘/Ctrl + 2", "File Compare"],
      ["⌘/Ctrl + 3", "Folder Sync"],
      ["⌘/Ctrl + 4", "3-way Merge"],
      ["Esc", "Back to Home"],
      ["?", "Toggle this help"],
    ],
  },
  {
    title: "Comparing",
    items: [
      ["⌘/Ctrl + Enter", "Run compare / preview"],
      ["n  or  F3", "Next difference"],
      ["p", "Previous difference"],
      ["⌘/Ctrl + D", "Toggle theme"],
    ],
  },
];

export default function HelpOverlay() {
  const show = useApp((s) => s.showHelp);
  const toggleHelp = useApp((s) => s.toggleHelp);
  if (!show) return null;
  return (
    <div
      onClick={() => toggleHelp(false)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="mb-4 flex items-center">
          <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
          <button
            onClick={() => toggleHelp(false)}
            className="ml-auto rounded-md px-2 py-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            ✕
          </button>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {g.title}
              </h3>
              <ul className="space-y-1.5">
                {g.items.map(([key, desc]) => (
                  <li key={key} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-neutral-600 dark:text-neutral-300">
                      {desc}
                    </span>
                    <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[11px] text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                      {key}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
