import { ReactNode } from "react";
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-[#0a0d14]">
      {/* Desktop Sidebar with animated transition */}
      <div 
        className={cn(
          "hidden fixed md:flex flex-col transition-[width,transform,opacity] duration-500 ease-in-out h-full z-10",
          isCollapsed 
            ? "w-0 opacity-0 -translate-x-5 animate-sidebarSlideOut" 
            : "w-64 opacity-100 translate-x-0"
        )}
      >
        <div className="min-w-64 overflow-hidden">
          <Sidebar />
        </div>
      </div>
      
      {/* Main Content */}
      <div className={cn(
        "flex flex-col flex-1 overflow-hidden transition-[margin] duration-500 ease-in-out",
        isCollapsed ? "ml-0" : "md:ml-64"
      )}>
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
