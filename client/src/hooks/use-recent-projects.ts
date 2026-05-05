import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

const QUERY_KEY = ["/api/recent-projects"] as const;

// Module-level helper so callers get a referentially-stable function — this
// keeps `useEffect` triggers based on it from re-firing and spamming the API.
async function touchRecentProject(projectId: number): Promise<void> {
  if (!Number.isFinite(projectId)) return;
  try {
    await apiRequest("POST", `/api/recent-projects/${projectId}`);
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  } catch {
    // Best-effort: failing to record the visit shouldn't break navigation.
  }
}

export function useRecentProjects() {
  const { data: recentIds = [], isLoading } = useQuery<number[]>({
    queryKey: QUERY_KEY,
  });

  return { recentIds, isLoading, addRecentProject: touchRecentProject };
}
