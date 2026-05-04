import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
}

export function UploadVersionIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("h-4 w-4", className)}>
      {/* Back page (offset behind) */}
      <path d="M20 8v10a2 2 0 0 1-2 2h-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
      {/* Front page */}
      <rect x="3" y="2" width="13" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      {/* Upload arrow */}
      <path d="M9.5 15V9m0 0L7 11.5m2.5-2.5L12 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShareFileIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("h-4 w-4", className)}>
      {/* Folder body */}
      <path d="M2 8a2 2 0 0 1 2-2h4.5l2 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* External link arrow (top right) */}
      <path d="M13 11l5-5m0 0h-3.5m3.5 0v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RequestChangesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("h-4 w-4", className)}>
      {/* Document */}
      <path d="M4 4a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 2v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Exclamation mark on document */}
      <path d="M10 10v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="15" r="0.7" fill="currentColor" />
      {/* Pencil (bottom right, overlapping) */}
      <path d="M15.5 14l-5 5L9 20.5l1.5-1.5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 14l2-2a0.7 0.7 0 0 1 1 0l1 1a0.7 0.7 0 0 1 0 1l-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ApproveIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("h-4 w-4", className)}>
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MarkReviewIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("h-4 w-4", className)}>
      {/* Clipboard body */}
      <rect x="3" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
      {/* Clipboard clip */}
      <path d="M8 2h6v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Checkmark row 1 */}
      <path d="M7 9.5l1.5 1.5L12 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Line row 1 */}
      <path d="M14 10h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Checkmark row 2 */}
      <path d="M7 15.5l1.5 1.5L12 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Line row 2 */}
      <path d="M14 16h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
