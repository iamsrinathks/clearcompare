import { FolderStatus } from "./api";

export function statusColor(s: FolderStatus): string {
  switch (s) {
    case "same":
      return "text-neutral-400 dark:text-neutral-500";
    case "different":
    case "left_newer":
    case "right_newer":
      return "text-amber-600 dark:text-amber-400";
    case "left_only":
      return "text-emerald-600 dark:text-emerald-400";
    case "right_only":
      return "text-sky-600 dark:text-sky-400";
  }
}

export function statusRowBg(s: FolderStatus): string {
  switch (s) {
    case "same":
      return "";
    case "different":
    case "left_newer":
    case "right_newer":
      return "bg-amber-50 dark:bg-amber-500/10";
    case "left_only":
      return "bg-emerald-50 dark:bg-emerald-500/10";
    case "right_only":
      return "bg-sky-50 dark:bg-sky-500/10";
  }
}

export function statusLabel(s: FolderStatus): string {
  switch (s) {
    case "same":
      return "Same";
    case "different":
      return "Different";
    case "left_newer":
      return "Left newer";
    case "right_newer":
      return "Right newer";
    case "left_only":
      return "Left only";
    case "right_only":
      return "Right only";
  }
}
