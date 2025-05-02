import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

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
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const queryClient = useQueryClient();

  // Mutation to update user's theme preference in the database
  const updateThemeMutation = useMutation({
    mutationFn: async (themePreference: string) => {
      const res = await apiRequest("PATCH", "/api/user/theme", { themePreference });
      return await res.json();
    },
    onSuccess: (data) => {
      // Update the cached user data with the new theme preference
      queryClient.setQueryData(["/api/user"], (oldData: any) => {
        if (oldData) {
          return { ...oldData, themePreference: data.themePreference };
        }
        return oldData;
      });
    },
    onError: (error) => {
      console.error("Failed to save theme preference:", error);
      // Silently fail - local storage will still work
    }
  });

  // Get the current system preference
  const getSystemTheme = (): 'light' | 'dark' => {
    if (!mounted || typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  // Apply the theme to the DOM
  const applyTheme = (newTheme: Theme) => {
    if (!mounted) return;
    
    const root = document.documentElement;
    const resolvedValue = newTheme === 'system' ? getSystemTheme() : newTheme;

    // Store in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, newTheme);
    }

    // Apply to DOM directly
    if (resolvedValue === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    setResolvedTheme(resolvedValue);
  };

  // Public theme setter
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    updateThemeMutation.mutate(newTheme);
  };

  // Listen for system preference changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, mounted]);

  // Initialize on mount
  useEffect(() => {
    setMounted(true);
    
    // Get theme from localStorage
    const savedTheme = typeof window !== 'undefined' 
      ? localStorage.getItem(storageKey) as Theme | null 
      : null;
    
    const initialTheme = savedTheme || defaultTheme;
    setThemeState(initialTheme);
    applyTheme(initialTheme);
  }, [defaultTheme, storageKey]);

  // Compute the current system theme
  const systemTheme = getSystemTheme();

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