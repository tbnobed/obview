import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/hooks/use-view-mode";

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
  className?: string;
  size?: "sm" | "md";
  testIdPrefix?: string;
}

// Compact two-button segmented control. Lives outside Button on
// purpose so we don't pick up ghost/outline focus rings that fight
// the existing toolbar styling.
export function ViewModeToggle({
  value,
  onChange,
  className,
  size = "sm",
  testIdPrefix = "view-mode",
}: ViewModeToggleProps) {
  const btn =
    size === "md"
      ? "h-9 w-9"
      : "h-8 w-8";
  const icon = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  const base =
    "inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const active =
    "bg-primary text-primary-foreground dark:bg-[#026d55] dark:text-white";
  const inactive =
    "bg-transparent text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-gray-800";

  return (
    <div
      role="group"
      aria-label="View mode"
      className={cn(
        "inline-flex rounded-md border border-neutral-200 dark:border-gray-700 overflow-hidden",
        className,
      )}
      data-testid={`${testIdPrefix}-toggle`}
    >
      <button
        type="button"
        aria-pressed={value === "grid"}
        aria-label="Grid view"
        title="Grid view"
        onClick={() => onChange("grid")}
        className={cn(base, btn, "rounded-none", value === "grid" ? active : inactive)}
        data-testid={`${testIdPrefix}-grid`}
      >
        <LayoutGrid className={icon} />
      </button>
      <button
        type="button"
        aria-pressed={value === "list"}
        aria-label="List view"
        title="List view"
        onClick={() => onChange("list")}
        className={cn(
          base,
          btn,
          "rounded-none border-l border-neutral-200 dark:border-gray-700",
          value === "list" ? active : inactive,
        )}
        data-testid={`${testIdPrefix}-list`}
      >
        <List className={icon} />
      </button>
    </div>
  );
}

export default ViewModeToggle;
