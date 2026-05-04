import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
}

export function UploadVersionIcon({ className }: IconProps) {
  return (
    <img
      src="/icons/upload-version.png"
      alt=""
      className={cn("h-4 w-4 object-contain", className)}
      draggable={false}
    />
  );
}

export function ShareFileIcon({ className }: IconProps) {
  return (
    <img
      src="/icons/share-file.png"
      alt=""
      className={cn("h-4 w-4 object-contain", className)}
      draggable={false}
    />
  );
}

export function RequestChangesIcon({ className }: IconProps) {
  return (
    <img
      src="/icons/request-changes.png"
      alt=""
      className={cn("h-4 w-4 object-contain", className)}
      draggable={false}
    />
  );
}

export function ApproveIcon({ className }: IconProps) {
  return (
    <img
      src="/icons/approve.png"
      alt=""
      className={cn("h-4 w-4 object-contain", className)}
      draggable={false}
    />
  );
}

export function MarkReviewIcon({ className }: IconProps) {
  return (
    <img
      src="/icons/mark-review.png"
      alt=""
      className={cn("h-4 w-4 object-contain", className)}
      draggable={false}
    />
  );
}
