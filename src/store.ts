import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SyncMode } from "./lib/api";

export type View = "home" | "folder" | "file" | "sync" | "merge";

export type Session =
  | { id: string; kind: "folder"; ts: number; left: string; right: string }
  | { id: string; kind: "file"; ts: number; left: string; right: string }
  | {
      id: string;
      kind: "sync";
      ts: number;
      left: string;
      right: string;
      mode: SyncMode;
    }
  | {
      id: string;
      kind: "merge";
      ts: number;
      base: string;
      left: string;
      right: string;
    };

// A new session before it gets an id/timestamp (kept as a discriminated union
// so Omit doesn't collapse the variants).
export type SessionInput =
  | { kind: "folder"; left: string; right: string }
  | { kind: "file"; left: string; right: string }
  | { kind: "sync"; left: string; right: string; mode: SyncMode }
  | { kind: "merge"; base: string; left: string; right: string };

// Pending handoffs — set when reopening a recent session or jumping between views.
interface Pending {
  file?: { left: string; right: string };
  folder?: { left: string; right: string };
  sync?: { left: string; right: string; mode: SyncMode };
  merge?: { base: string; left: string; right: string };
}

interface AppState {
  view: View;
  theme: "light" | "dark";
  recents: Session[];
  pending: Pending;
  showHelp: boolean;

  setView: (v: View) => void;
  toggleTheme: () => void;
  toggleHelp: (v?: boolean) => void;
  openFilePair: (left: string, right: string) => void;
  openSession: (s: Session) => void;
  addRecent: (s: SessionInput) => void;
  clearRecents: () => void;
  consumePending: <K extends keyof Pending>(key: K) => Pending[K];
}

const initialTheme: "light" | "dark" =
  window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

function signature(s: SessionInput | Session): string {
  switch (s.kind) {
    case "merge":
      return `merge|${s.base}|${s.left}|${s.right}`;
    case "sync":
      return `sync|${s.left}|${s.right}|${s.mode}`;
    default:
      return `${s.kind}|${s.left}|${s.right}`;
  }
}

const MAX_RECENTS = 12;

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      view: "home",
      theme: initialTheme,
      recents: [],
      pending: {},
      showHelp: false,

      setView: (view) => set({ view }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      toggleHelp: (v) => set((s) => ({ showHelp: v ?? !s.showHelp })),

      openFilePair: (left, right) =>
        set({ view: "file", pending: { file: { left, right } } }),

      openSession: (s) => {
        switch (s.kind) {
          case "folder":
            set({ view: "folder", pending: { folder: { left: s.left, right: s.right } } });
            break;
          case "file":
            set({ view: "file", pending: { file: { left: s.left, right: s.right } } });
            break;
          case "sync":
            set({
              view: "sync",
              pending: { sync: { left: s.left, right: s.right, mode: s.mode } },
            });
            break;
          case "merge":
            set({
              view: "merge",
              pending: { merge: { base: s.base, left: s.left, right: s.right } },
            });
            break;
        }
      },

      addRecent: (s) => {
        const sig = signature(s);
        const entry = {
          ...s,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ts: Date.now(),
        } as Session;
        const filtered = get().recents.filter((r) => signature(r) !== sig);
        set({ recents: [entry, ...filtered].slice(0, MAX_RECENTS) });
      },

      clearRecents: () => set({ recents: [] }),

      consumePending: (key) => {
        const val = get().pending[key];
        if (val) set((s) => ({ pending: { ...s.pending, [key]: undefined } }));
        return val;
      },
    }),
    {
      name: "clearcompare",
      partialize: (s) => ({ theme: s.theme, recents: s.recents }),
    },
  ),
);
