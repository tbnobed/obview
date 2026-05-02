import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { useAuth } from "@/hooks/use-auth";
import { useSidebar } from "@/hooks/use-sidebar";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
  hideHeader?: boolean;
}

const COLLAPSED_WIDTH = 0;

export default function AppLayout({ children, hideHeader = false }: AppLayoutProps) {
  const { isLoading } = useAuth();
  const { isCollapsed, width, setWidth, minWidth, maxWidth } = useSidebar();
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isCollapsed) return;
      e.preventDefault();
      startXRef.current = e.clientX;
      startWidthRef.current = width;
      setIsResizing(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [isCollapsed, width]
  );

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: PointerEvent) => {
      const delta = e.clientX - startXRef.current;
      setWidth(startWidthRef.current + delta);
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setWidth]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  const sidebarWidth = isCollapsed ? COLLAPSED_WIDTH : width;

  return (
    <div className="flex h-[100svh] bg-white dark:bg-[#0a0d14]">
      {/* Desktop Sidebar */}
      <div
        className={cn(
          "hidden md:block h-[100svh] shrink-0 relative",
          !isResizing && "transition-[width] duration-200 ease-in-out"
        )}
        style={{ width: sidebarWidth }}
      >
        <Sidebar />
        {!isCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuemin={minWidth}
            aria-valuemax={maxWidth}
            aria-valuenow={width}
            onPointerDown={onPointerDown}
            onDoubleClick={() => setWidth(280)}
            className={cn(
              "absolute top-0 right-0 h-full w-1.5 -mr-0.5 cursor-col-resize z-10 group",
              "hover:bg-primary-500/40 dark:hover:bg-primary-400/40 transition-colors",
              isResizing && "bg-primary-500/60 dark:bg-primary-400/60"
            )}
            data-testid="sidebar-resize-handle"
            title="Drag to resize sidebar (double-click to reset)"
          />
        )}
      </div>
      
      {/* Main Content */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header with mobile menu and desktop controls */}
        {!hideHeader && <Header />}
        
        {/* Page Content */}
        <main className="flex-1 min-h-0 overflow-auto dark:text-gray-300">
          {children}
        </main>
      </div>
    </div>
  );
}
