import { ReactNode } from "react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] overflow-x-hidden bg-white dark:bg-[#0a0d14]">
      {/* Desktop Sidebar */}
      <div 
        className={cn(
          "hidden md:block transition-all duration-500 ease-in-out",
          isCollapsed ? "w-0 opacity-0" : "w-64 opacity-100"
        )}
        style={{ 
          overflow: isCollapsed ? 'hidden' : 'visible' 
        }}
      >
        <Sidebar />
      </div>
      
      {/* Main Content */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header with mobile menu and desktop controls */}
        <Header />
        
        {/* Page Content */}
        <main className="flex-1 min-h-0 flex flex-col dark:text-gray-300">
          {children}
        </main>
      </div>
    </div>
  );
}
