export type CommentSortOrder = "timecode" | "created";

type SortableComment = {
  timestamp?: number | null;
  createdAt?: string | Date | null;
};

function createdAtMs(comment: SortableComment): number {
  const value = comment.createdAt ? new Date(comment.createdAt).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

export function sortComments<T extends SortableComment>(
  comments: T[],
  order: CommentSortOrder,
): T[] {
  return [...comments].sort((a, b) => {
    if (order === "created") {
      return createdAtMs(a) - createdAtMs(b);
    }

    const aTime = typeof a.timestamp === "number" && Number.isFinite(a.timestamp)
      ? a.timestamp
      : null;
    const bTime = typeof b.timestamp === "number" && Number.isFinite(b.timestamp)
      ? b.timestamp
      : null;

    if (aTime !== null && bTime !== null) {
      return aTime - bTime || createdAtMs(a) - createdAtMs(b);
    }
    if (aTime !== null) return -1;
    if (bTime !== null) return 1;
    return createdAtMs(a) - createdAtMs(b);
  });
}