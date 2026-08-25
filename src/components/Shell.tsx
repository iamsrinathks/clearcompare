import { ReactNode } from "react";
import { useApp } from "../store";

export function TopBar({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  const setView = useApp((s) => s.setView);
  const theme = useApp((s) => s.theme);
  const toggleTheme = useApp((s) => s.toggleTheme);
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-neutral-200 px-3 dark:border-neutral-800">
      <button
        onClick={() => setView("home")}
        className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        title="Home"
      >
        ← Home
      </button>
      <div className="h-5 w-px bg-neutral-200 dark:bg-neutral-800" />
      <span className="text-sm font-medium">{title}</span>
      <div className="ml-auto flex items-center gap-2">
        {children}
        <button
          onClick={toggleTheme}
          className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          title="Toggle theme"
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </div>
  );
}

export function ToolButton({
  onClick,
  disabled,
  children,
  title,
  primary,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  title?: string;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
        (primary
          ? "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700")
      }
    >
      {children}
    </button>
  );
}

export function StatusBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-4 border-t border-neutral-200 px-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
      {children}
    </div>
  );
}

export function PathPicker({
  label,
  value,
  onPick,
  onChange,
  onCommit,
  placeholder,
}: {
  label: string;
  value: string;
  onPick: () => void;
  // When provided, the field becomes an editable input you can type or paste
  // a path into. onCommit fires on Enter (i.e. "I know the path, use it").
  onChange?: (value: string) => void;
  onCommit?: (value: string) => void;
  placeholder: string;
}) {
  // Fallback: non-editable button that only opens the browse dialog.
  if (!onChange) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-neutral-400">
          {label}
        </span>
        <button
          onClick={onPick}
          className="min-w-0 flex-1 truncate rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-left font-mono text-xs text-neutral-700 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700"
          title={value || placeholder}
        >
          {value || <span className="text-neutral-400">{placeholder}</span>}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="shrink-0 text-xs font-medium text-neutral-400">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center rounded-md border border-neutral-200 bg-neutral-50 focus-within:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:focus-within:border-neutral-700">
        <input
          value={value}
          spellCheck={false}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommit?.(value);
              (e.target as HTMLInputElement).blur();
            }
          }}
          title={value || placeholder}
          className="min-w-0 flex-1 bg-transparent px-2 py-1 font-mono text-xs text-neutral-700 outline-none placeholder:text-neutral-400 dark:text-neutral-300"
        />
        <button
          onClick={onPick}
          title="Browse…"
          className="shrink-0 border-l border-neutral-200 px-2 py-1 text-neutral-400 hover:text-neutral-700 dark:border-neutral-800 dark:hover:text-neutral-200"
        >
          📁
        </button>
      </div>
    </div>
  );
}
