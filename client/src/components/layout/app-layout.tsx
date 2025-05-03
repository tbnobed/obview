import { ReactNode, useState, useEffect, useRef, useCallback } from "react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { useAuth } from "@/hooks/use-auth";
import { useSidebar } from "@/hooks/use-sidebar";
import { Loader2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { isLoading } = useAuth();
  const { isCollapsed, toggleSidebar, expandSidebar } = useSidebar();
  const [isHovering, setIsHovering] = useState(false);
  const [showSidebar, setShowSidebar] = useState(!isCollapsed);
  const [isSidebarVisible, setIsSidebarVisible] = useState(!isCollapsed);
  const hoverTimerRef = useRef<number | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Handle mouse enter on the hover detection zone
  const handleMouseEnter = useCallback(() => {
    if (isCollapsed && !isHovering) {
      // Clear any existing timers
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
      
      // Set a small delay before showing the sidebar to prevent accidental triggers
      hoverTimerRef.current = window.setTimeout(() => {
        setIsHovering(true);
      }, 100);
    }
  }, [isCollapsed, isHovering]);

  // Handle mouse leave on the sidebar or hover zone
  const handleMouseLeave = useCallback(() => {
    // Clear any pending timers
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    
    // Set a small delay before hiding the sidebar to improve user experience
    hoverTimerRef.current = window.setTimeout(() => {
      setIsHovering(false);
    }, 200);
  }, []);

  // Handle the collapsible state changes with proper transitions
  useEffect(() => {
    if (isCollapsed) {
      // When sidebar is collapsed, start the transition to hide it
      const timer = setTimeout(() => {
        setIsSidebarVisible(false);
      }, 500); // Match the transition duration
      return () => clearTimeout(timer);
    } else {
      // When sidebar is expanded, immediately make it visible for the transition
      setIsSidebarVisible(true);
      setShowSidebar(true);
    }
  }, [isCollapsed]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  // Add a click outside handler to close hover state
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isHovering && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setIsHovering(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isHovering]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-[#0a0d14]">
      {/* Hover detection zone - always present when sidebar is collapsed */}
      {isCollapsed && (
        <div 
          className="hidden md:block absolute left-0 top-0 w-4 h-full z-30"
          onMouseEnter={handleMouseEnter}
        />
      )}
      
      {/* Permanent Sidebar with animation - properly animates when being hidden */}
      <div 
        ref={sidebarRef}
        className={cn(
          "hidden md:flex md:flex-shrink-0 transition-all duration-500 ease-in-out transform-gpu will-change-transform overflow-hidden",
          isCollapsed && !isHovering 
            ? "md:w-0 opacity-0 translate-x-[-20px] animate-sidebarSlideOut" 
            : "md:w-auto opacity-100 translate-x-0"
        )}
        onMouseLeave={handleMouseLeave}
        style={{ 
          maxWidth: isCollapsed && !isHovering ? '0' : '18rem',
          transitionProperty: 'transform, opacity, max-width, width'
        }}
      >
        <div className={cn(
          "transition-opacity duration-500 ease-in-out",
          isCollapsed && !isHovering ? "opacity-0" : "opacity-100"
        )}>
          <Sidebar />
        </div>
      </div>
      
      {/* Hover sidebar - shown when hover is active */}
      {isCollapsed && isHovering && (
        <div 
          className="hidden md:block absolute left-0 top-0 h-full z-40 shadow-xl animate-sidebarSlideIn"
          onMouseLeave={handleMouseLeave}
        >
          <Sidebar />
        </div>
      )}
      
      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header with mobile menu and desktop controls */}
        <Header />
        
        {/* Page Content */}
        <main className="flex-1 overflow-y-auto dark:text-gray-300">
          {children}
        </main>
        
        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
}
