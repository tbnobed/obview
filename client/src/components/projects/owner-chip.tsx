import { cn } from "@/lib/utils";
import { getOwnerColor, getOwnerInitials } from "@/lib/owner-color";

interface OwnerChipProps {
  ownerId: number | null | undefined;
  ownerName: string | null | undefined;
  isYou?: boolean;
  size?: "sm" | "md";
  showName?: boolean;
  className?: string;
  "data-testid"?: string;
}

// Small colored avatar + (optional) name. Used on project cards and on
// the grouped "by owner" headers so the same person always looks the
// same across the dashboard.
export default function OwnerChip({
  ownerId,
  ownerName,
  isYou = false,
  size = "sm",
  showName = true,
  className,
  ...rest
}: OwnerChipProps) {
  const color = getOwnerColor(ownerId);
  const initials = getOwnerInitials(ownerName);
  const dim = size === "sm" ? "h-4 w-4 text-[9px]" : "h-6 w-6 text-[11px]";
  const label = isYou ? "You" : ownerName || `user #${ownerId ?? "?"}`;

  return (
    <div
      className={cn("inline-flex items-center gap-1.5 min-w-0", className)}
      data-testid={rest["data-testid"]}
    >
      <span
        className={cn(
          "shrink-0 rounded-full flex items-center justify-center font-semibold text-white leading-none",
          dim
        )}
        style={{ backgroundColor: color }}
        aria-hidden
      >
        {isYou ? "Y" : initials}
      </span>
      {showName && (
        <span
          className={cn(
            "truncate",
            size === "sm" ? "text-[11px]" : "text-sm",
            isYou
              ? "font-medium text-neutral-700 dark:text-neutral-200"
              : "text-neutral-500 dark:text-neutral-400"
          )}
          title={label}
        >
          {label}
        </span>
      )}
    </div>
  );
}
