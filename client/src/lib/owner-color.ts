// Stable per-owner color + initials so the same teammate looks the same
// everywhere they appear (project cards, group headers, etc).
const PALETTE = [
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#84cc16",
  "#6366f1",
  "#06b6d4",
  "#a855f7",
];

export function getOwnerColor(id: number | null | undefined): string {
  if (id == null) return "#737373";
  const idx = Math.abs(id | 0) % PALETTE.length;
  return PALETTE[idx]!;
}

export function getOwnerInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
