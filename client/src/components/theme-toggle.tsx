import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme-provider";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Moon, Sun, Monitor } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Import the Theme type from our theme provider
type Theme = 'light' | 'dark' | 'system';

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mutation to update user's theme preference
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
    onError: (error: Error) => {
      console.error("Failed to save theme preference:", error);
      // Silently fail - local storage will still work
    }
  });

  // Set theme based on user preference when they log in
  useEffect(() => {
    if (user?.themePreference && mounted) {
      setTheme(user.themePreference as Theme);
    }
  }, [user, mounted, setTheme]);

  // useEffect only runs on the client, so we can safely access window here
  useEffect(() => {
    setMounted(true);
  }, []);

  // Force theme application via DOM to avoid requiring page refresh
  useEffect(() => {
    if (!mounted) return;
    
    // Get current effective theme (accounting for system preference)
    const currentTheme = theme === 'system' ? systemTheme : theme;
    
    // Apply theme directly to the document element
    if (currentTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme, systemTheme, mounted]);

  // Don't render anything until mounted to avoid hydration mismatch
  if (!mounted) {
    return null;
  }

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    // Update theme locally only
    // The ThemeProvider will handle saving to the database if needed
    setTheme(newTheme);
  };

  // Determine the active theme for display
  const activeTheme = theme === 'system' ? systemTheme : theme;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="focus-visible:ring-0 focus-visible:ring-offset-0">
          <Sun className={`h-[1.2rem] w-[1.2rem] transition-all ${activeTheme === 'dark' ? 'rotate-90 scale-0' : 'rotate-0 scale-100'}`} />
          <Moon className={`absolute h-[1.2rem] w-[1.2rem] transition-all ${activeTheme === 'dark' ? 'rotate-0 scale-100' : 'rotate-90 scale-0'}`} />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleThemeChange("light")}>
          <Sun className="mr-2 h-4 w-4" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}