import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type SidebarContextProps = {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  expandSidebar: () => void;
  collapseSidebar: () => void;
  width: number;
  setWidth: (w: number) => void;
  minWidth: number;
  maxWidth: number;
};

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined);

const SIDEBAR_STORAGE_KEY = "sidebar_collapsed";
const SIDEBAR_WIDTH_KEY = "sidebar_width";
const MIN_WIDTH = 220;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 280;

export function SidebarProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage if available, otherwise default to not collapsed
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const savedState = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return savedState ? JSON.parse(savedState) : false;
  });

  const [width, setWidthState] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const n = saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
    if (Number.isNaN(n)) return DEFAULT_WIDTH;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
  });

  // Save to localStorage when state changes
  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  }, [width]);

  const setWidth = (w: number) => {
    setWidthState(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w))));
  };

  const toggleSidebar = () => setIsCollapsed(prev => !prev);
  const expandSidebar = () => setIsCollapsed(false);
  const collapseSidebar = () => setIsCollapsed(true);

  return (
    <SidebarContext.Provider value={{
      isCollapsed,
      toggleSidebar,
      expandSidebar,
      collapseSidebar,
      width,
      setWidth,
      minWidth: MIN_WIDTH,
      maxWidth: MAX_WIDTH,
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