import { useCallback, useEffect, useState } from "react";

export type ViewMode = "grid" | "list";

const STORAGE_PREFIX = "obviu:view:";

function readStored(key: string, fallback: ViewMode): ViewMode {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === "grid" || raw === "list") return raw;
  } catch {}
  return fallback;
}

// Per-scope grid/list preference, persisted to localStorage so it
// survives reloads and follows the user across pages that share a
// scope key (e.g. all project lists use "projects").
export function useViewMode(scope: string, fallback: ViewMode = "grid") {
  const [view, setViewState] = useState<ViewMode>(() => readStored(scope, fallback));

  // Cross-tab / cross-page sync: if another component on the page
  // (or another tab) flips the same scope, mirror it here.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_PREFIX + scope) return;
      if (e.newValue === "grid" || e.newValue === "list") {
        setViewState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [scope]);

  const setView = useCallback(
    (next: ViewMode) => {
      setViewState(next);
      try {
        localStorage.setItem(STORAGE_PREFIX + scope, next);
      } catch {}
    },
    [scope],
  );

  return [view, setView] as const;
}
