import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "recent_project_ids";
const MAX_RECENT = 10;

function readStored(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n) => typeof n === "number" && Number.isFinite(n));
  } catch {
    return [];
  }
}

export function useRecentProjects() {
  const [recentIds, setRecentIds] = useState<number[]>(() => readStored());

  // Cross-tab sync — pick up changes made in other tabs of the same app.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setRecentIds(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addRecentProject = useCallback((id: number) => {
    if (!Number.isFinite(id)) return;
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((p) => p !== id)].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const removeRecentProject = useCallback((id: number) => {
    setRecentIds((prev) => {
      const next = prev.filter((p) => p !== id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return { recentIds, addRecentProject, removeRecentProject };
}
