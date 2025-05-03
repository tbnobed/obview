import { ReactNode, useEffect, useState } from "react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { useAuth } from "@/hooks/use-auth";
import { useSidebar } from "@/hooks/use-sidebar";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { isLoading } = useAuth();
  const { isCollapsed } = useSidebar();
  // Added state for animation
  const [isSidebarVisible, setIsSidebarVisible] = useState(!isCollapsed);

  // Handle sidebar visibility with animation timing
  useEffect(() => {
    if (isCollapsed) {
      // When collapsing, delay hiding to allow animation to complete
      const timer = setTimeout(() => {
        setIsSidebarVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      // When expanding, show immediately
      setIsSidebarVisible(true);
    }
  }, [isCollapsed]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-[#0a0d14]">
      {/* Desktop Sidebar */}
      <div 
        className={cn(
          "hidden md:block h-full",
          isCollapsed 
            ? "w-0" 
            : "w-64",
          isSidebarVisible ? "opacity-100 transition-opacity duration-300" : "opacity-0"
        )}
        style={{ 
          overflow: 'hidden',
          visibility: isSidebarVisible ? 'visible' : 'hidden'
        }}
      >
        <Sidebar />
      </div>
      
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
