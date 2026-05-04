import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
}

export function UploadVersionIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("h-4 w-4", className)}>
      <path d="M12 6h14l10 10v24a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" fill="#5ba3a3" opacity="0.3" stroke="#5ba3a3" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M26 6v10h10" stroke="#5ba3a3" strokeWidth="2" strokeLinejoin="round"/>
      <rect x="6" y="12" width="16" height="20" rx="1" fill="#5ba3a3" opacity="0.6" stroke="#5ba3a3" strokeWidth="1.5"/>
      <path d="M38 44V28m0 0l-6 6m6-6l6 6" stroke="#5ba3a3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function ShareFileIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("h-4 w-4", className)}>
      <path d="M4 18c0-2 1-3 3-3h34c2 0 3 1 3 3v22c0 2-1 3-3 3H7c-2 0-3-1-3-3V18z" stroke="#c9a34e" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
      <path d="M4 18l16-6h8l16 6" stroke="#c9a34e" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
      <path d="M28 22l6-6m0 0h-6m6 0v6" stroke="#c9a34e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function RequestChangesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("h-4 w-4", className)}>
      <path d="M8 4h20l8 8v28a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="#c9a34e" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
      <path d="M28 4v8h8" stroke="#c9a34e" strokeWidth="2.5" strokeLinejoin="round"/>
      <path d="M18 16v10" stroke="#c9a34e" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="18" cy="30" r="1.5" fill="#c9a34e"/>
      <path d="M32 30l8 8m0 0l-4 4-8-8 4-4 8 8z" stroke="#c9a34e" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

export function ApproveIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("h-4 w-4", className)}>
      <path d="M8 26l10 10L40 12" stroke="#5ba3a3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function MarkReviewIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("h-4 w-4", className)}>
      <rect x="6" y="6" width="28" height="36" rx="2" stroke="#5ba3a3" strokeWidth="2.5" fill="none"/>
      <path d="M12 4h16v6H12z" stroke="#5ba3a3" strokeWidth="2.5" fill="none" rx="1"/>
      <path d="M13 18l3 3 6-6" stroke="#5ba3a3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 28l3 3 6-6" stroke="#5ba3a3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="26" y1="20" x2="32" y2="20" stroke="#5ba3a3" strokeWidth="2" strokeLinecap="round"/>
      <line x1="26" y1="30" x2="32" y2="30" stroke="#5ba3a3" strokeWidth="2" strokeLinecap="round"/>
      <path d="M36 28l8 8m0 0l-3.5 3.5-8-8 3.5-3.5 8 8z" stroke="#5ba3a3" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}
