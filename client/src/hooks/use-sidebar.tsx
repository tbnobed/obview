import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type SidebarContextProps = {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  expandSidebar: () => void;
  collapseSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined);

const SIDEBAR_STORAGE_KEY = "sidebar_collapsed";

export function SidebarProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage if available, otherwise default to not collapsed
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const savedState = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return savedState ? JSON.parse(savedState) : false;
  });

  // Save to localStorage when state changes
  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  const toggleSidebar = () => setIsCollapsed(prev => !prev);
  const expandSidebar = () => setIsCollapsed(false);
  const collapseSidebar = () => setIsCollapsed(true);

  return (
    <SidebarContext.Provider value={{ 
      isCollapsed, 
      toggleSidebar, 
      expandSidebar, 
      collapseSidebar 
    }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}