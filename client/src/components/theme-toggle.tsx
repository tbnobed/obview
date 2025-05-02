import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Moon, Sun, Monitor } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Mutation to update user's theme preference
  const updateThemeMutation = useMutation({
    mutationFn: async (themePreference: string) => {
      const res = await apiRequest("PATCH", "/api/user/theme", { themePreference });
      return await res.json();
    },
    onError: (error: Error) => {
      console.error("Failed to save theme preference:", error);
      // Silently fail - local storage will still work
    }
  });

  // Set theme based on user preference when they log in
  useEffect(() => {
    if (user?.themePreference && mounted) {
      setTheme(user.themePreference);
    }
  }, [user, mounted, setTheme]);

  // useEffect only runs on the client, so we can safely access window here
  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render anything until mounted to avoid hydration mismatch
  if (!mounted) {
    return null;
  }

  const handleThemeChange = (newTheme: string) => {
    // Update theme locally
    setTheme(newTheme);
    
    // If user is logged in, save preference to their profile
    if (user) {
      updateThemeMutation.mutate(newTheme);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="focus-visible:ring-0 focus-visible:ring-offset-0">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
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