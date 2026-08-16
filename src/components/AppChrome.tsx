import { ReactNode, useEffect, useRef, useState } from "react";
import { useApp, View } from "../store";

export interface MenuItem {
  label?: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
}
export interface MenuDef {
  name: string;
  items: MenuItem[];
}

/** Standard 7-menu bar. Views pass in the item sets that make sense for them;
 *  universal actions (Home, theme, help) are always present. */
export function useStandardMenus(extra?: Partial<Record<string, MenuItem[]>>): MenuDef[] {
  const setView = useApp((s) => s.setView);
  const toggleTheme = useApp((s) => s.toggleTheme);
  const toggleHelp = useApp((s) => s.toggleHelp);
  const theme = useApp((s) => s.theme);
  const recents = useApp((s) => s.recents);
  const openSession = useApp((s) => s.openSession);
  const clearRecents = useApp((s) => s.clearRecents);

  const nav = (v: View, label: string, shortcut: string): MenuItem => ({
    label,
    shortcut,
    onClick: () => setView(v),
  });

  const recentItems: MenuItem[] =
    recents.length === 0
      ? [{ label: "No recent sessions", disabled: true }]
      : [
          ...recents.slice(0, 6).map((s) => ({
            label:
              s.kind === "merge"
                ? `Merge · ${short(s.left)} ⇋ ${short(s.right)}`
                : `${cap(s.kind)} · ${short(s.left)} ↔ ${short(s.right)}`,
            onClick: () => openSession(s),
          })),
          { separator: true },
          { label: "Clear recent", onClick: clearRecents },
        ];

  const newItems: MenuItem[] = [
    nav("folder", "New Folder Compare", "⌘1"),
    nav("file", "New File Compare", "⌘2"),
    nav("sync", "New Folder Sync", "⌘3"),
    nav("merge", "New 3-way Merge", "⌘4"),
  ];

  return [
    {
      name: "Session",
      items: [
        { label: "Home", shortcut: "Esc", onClick: () => setView("home") },
        { separator: true },
        ...newItems,
        { separator: true },
        ...recentItems,
      ],
    },
    {
      name: "File",
      items: [
        ...newItems,
        ...(extra?.File ? [{ separator: true }, ...extra.File] : []),
      ],
    },
    {
      name: "Edit",
      items:
        extra?.Edit ??
        [
          { label: "Copy left → right", disabled: true },
          { label: "Copy right → left", disabled: true },
        ],
    },
    {
      name: "Search",
      items:
        extra?.Search ??
        [
          { label: "Next difference", shortcut: "F3", disabled: true },
          { label: "Previous difference", shortcut: "p", disabled: true },
        ],
    },
    {
      name: "View",
      items: [
        {
          label: theme === "dark" ? "Light theme" : "Dark theme",
          shortcut: "⌘D",
          onClick: toggleTheme,
        },
        ...(extra?.View ? [{ separator: true }, ...extra.View] : []),
        { separator: true },
        { label: "Keyboard shortcuts", shortcut: "?", onClick: () => toggleHelp(true) },
      ],
    },
    {
      name: "Tools",
      items: [
        ...(extra?.Tools ?? []),
        { label: theme === "dark" ? "Light theme" : "Dark theme", onClick: toggleTheme },
        { label: "Keyboard shortcuts", shortcut: "?", onClick: () => toggleHelp(true) },
      ],
    },
    {
      name: "Help",
      items: [
        { label: "Keyboard shortcuts", shortcut: "?", onClick: () => toggleHelp(true) },
        { separator: true },
        { label: "ClearCompare — clean file & folder comparison", disabled: true },
        { label: "Version 0.1.0", disabled: true },
      ],
    },
  ];
}

function short(p: string): string {
  return p.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || p;
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function MenuBar({ menus }: { menus: MenuDef[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div
      ref={ref}
      className="flex h-7 shrink-0 select-none items-stretch border-b border-neutral-200 bg-neutral-50 px-1 text-[13px] dark:border-neutral-800 dark:bg-neutral-900"
    >
      {menus.map((m) => (
        <div key={m.name} className="relative flex items-stretch">
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen((o) => (o === m.name ? null : m.name));
            }}
            onMouseEnter={() => open && setOpen(m.name)}
            className={
              "px-2.5 text-neutral-600 hover:bg-neutral-200/70 dark:text-neutral-300 dark:hover:bg-neutral-800 " +
              (open === m.name ? "bg-neutral-200/70 dark:bg-neutral-800" : "")
            }
          >
            {m.name}
          </button>
          {open === m.name && (
            <div className="absolute left-0 top-full z-40 mt-px min-w-[240px] overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-800">
              {(() => {
                const hasChecks = m.items.some((it) => it.checked !== undefined);
                return m.items.map((it, i) =>
                  it.separator ? (
                    <div
                      key={i}
                      className="my-1 border-t border-neutral-100 dark:border-neutral-700/70"
                    />
                  ) : (
                    <button
                      key={i}
                      disabled={it.disabled}
                      onClick={() => {
                        it.onClick?.();
                        setOpen(null);
                      }}
                      className="flex w-full items-center gap-6 py-1.5 pl-3 pr-3 text-left text-[13px] text-neutral-700 hover:bg-blue-500 hover:text-white disabled:text-neutral-400 disabled:hover:bg-transparent dark:text-neutral-200 dark:disabled:text-neutral-500"
                    >
                      {hasChecks && (
                        <span className="-ml-1 w-3 text-emerald-500">
                          {it.checked ? "✓" : ""}
                        </span>
                      )}
                      <span className="flex-1 whitespace-nowrap">{it.label}</span>
                      {it.shortcut && (
                        <span className="text-xs opacity-60">{it.shortcut}</span>
                      )}
                    </button>
                  ),
                );
              })()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ToolButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  danger,
  title,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={
        "flex w-[58px] shrink-0 flex-col items-center gap-0.5 rounded-md px-1 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-30 " +
        (active
          ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-white"
          : danger
            ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
            : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800")
      }
    >
      <span className="flex h-[18px] items-center">{icon}</span>
      <span className="leading-none">{label}</span>
    </button>
  );
}

export function ToolDivider() {
  return <div className="mx-1 my-1 w-px self-stretch bg-neutral-200 dark:bg-neutral-800" />;
}

/** Full window chrome: menu bar + toolbar row. `accent` is a hex/CSS color for
 *  a thin per-mode accent line under the toolbar. */
export function Chrome({
  menus,
  toolbar,
  accent,
  children,
}: {
  menus: MenuDef[];
  toolbar: ReactNode;
  accent?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <MenuBar menus={menus} />
      <div className="flex h-[52px] shrink-0 items-center gap-0.5 border-b border-neutral-200 bg-white px-2 dark:border-neutral-800 dark:bg-neutral-950">
        {toolbar}
      </div>
      {accent && <div style={{ height: 2, background: accent }} />}
      {children}
    </div>
  );
}

/** Accent color per comparison mode. */
export const ACCENT: Record<string, string> = {
  folder: "#f59e0b", // amber
  file: "#3b82f6", // blue
  sync: "#10b981", // emerald
  merge: "#a855f7", // purple
};
