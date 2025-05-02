import { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
  systemTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ 
  children, 
  storageKey = 'obviu-theme',
  defaultTheme = 'system',
}: { 
  children: ReactNode,
  storageKey?: string,
  defaultTheme?: Theme
}) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Get the current system preference
  const getSystemTheme = (): 'light' | 'dark' => {
    if (!mounted || typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  // Calculate the resolved theme (what will actually be applied)
  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
  const systemTheme = getSystemTheme();

  // Mutation to update user's theme preference in the database
  const updateThemeMutation = useMutation({
    mutationFn: async (themePreference: string) => {
      const res = await apiRequest("PATCH", "/api/user/theme", { themePreference });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user"], (oldData: any) => {
        if (oldData) {
          return { ...oldData, themePreference: data.themePreference };
        }
        return oldData;
      });
    },
    onError: (error) => {
      console.error("Failed to save theme preference:", error);
    }
  });

  // Public theme setter
  const setTheme = (newTheme: Theme) => {
    // Skip if no change
    if (newTheme === theme) return;
    
    // Update state
    setThemeState(newTheme);
    
    // Save to localStorage
    localStorage.setItem(storageKey, newTheme);
    
    // Save to database if logged in
    if (user) {
      updateThemeMutation.mutate(newTheme);
    }
  };

  // Apply the current theme to the DOM
  useEffect(() => {
    if (!mounted) return;
    
    const currentTheme = theme === 'system' ? getSystemTheme() : theme;
    
    if (currentTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme, systemTheme, mounted]);

  // Handle system preference changes
  useEffect(() => {
    if (!mounted) return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      // Force re-render when system preference changes
      if (theme === 'system') {
        // We don't need to call setThemeState here, just trigger a re-render
        // by updating a state that depends on the system theme
        setThemeState('system');
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, mounted]);

  // Initialize theme on mount
  useEffect(() => {
    setMounted(true);
    
    // Get theme from localStorage or use user preference from profile
    const savedTheme = localStorage.getItem(storageKey) as Theme | null;
    
    if (user?.themePreference) {
      // If user has a preference in their profile, use that
      setThemeState(user.themePreference as Theme);
    } else if (savedTheme) {
      // Otherwise use localStorage if available
      setThemeState(savedTheme);
    }
    // defaultTheme is used as fallback via the initial state
  }, [storageKey, user, defaultTheme]);

  return (
    <ThemeContext.Provider value={{ 
      theme, 
      setTheme, 
      resolvedTheme,
      systemTheme
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}