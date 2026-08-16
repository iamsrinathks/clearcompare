import { useEffect } from "react";
import { useApp, View } from "./store";
import Home from "./views/Home";
import FolderCompare from "./views/FolderCompare";
import FileCompare from "./views/FileCompare";
import FolderSync from "./views/FolderSync";
import Merge from "./views/Merge";
import HelpOverlay from "./components/HelpOverlay";

const numToView: Record<string, View> = {
  "1": "folder",
  "2": "file",
  "3": "sync",
  "4": "merge",
};

export default function App() {
  const view = useApp((s) => s.view);
  const theme = useApp((s) => s.theme);
  const setView = useApp((s) => s.setView);
  const toggleTheme = useApp((s) => s.toggleTheme);
  const toggleHelp = useApp((s) => s.toggleHelp);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;

      // Esc: close help, else go home
      if (e.key === "Escape") {
        if (useApp.getState().showHelp) toggleHelp(false);
        else setView("home");
        return;
      }
      // ? help (ignore while typing)
      if (!typing && e.key === "?") {
        e.preventDefault();
        toggleHelp();
        return;
      }
      if (mod && numToView[e.key]) {
        e.preventDefault();
        setView(numToView[e.key]);
        return;
      }
      if (mod && (e.key === "0" || e.key.toLowerCase() === "h")) {
        e.preventDefault();
        setView("home");
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        toggleTheme();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView, toggleTheme, toggleHelp]);

  return (
    <div className="h-full w-full bg-white text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
      {view === "home" && <Home />}
      {view === "folder" && <FolderCompare />}
      {view === "file" && <FileCompare />}
      {view === "sync" && <FolderSync />}
      {view === "merge" && <Merge />}
      <HelpOverlay />
    </div>
  );
}
