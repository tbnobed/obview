import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, LogOut, ChevronRight, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSidebar } from "@/hooks/use-sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import Sidebar from "@/components/layout/sidebar";
import Logo from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { uploadService } from "@/lib/upload-service";

export default function Header() {
  const { user, logoutMutation } = useAuth();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const [_, navigate] = useLocation();
  const [showLogoutAlert, setShowLogoutAlert] = useState(false);
  
  // This function checks for active uploads and shows warning if needed
  const handleLogoutClick = () => {
    if (uploadService.hasActiveUploads()) {
      setShowLogoutAlert(true);
    } else {
      // No active uploads, proceed with logout
      logoutMutation.mutate();
    }
  };
  
  // Actually perform the logout
  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // User profile dropdown component for reuse
  const UserProfileDropdown = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <div className="h-8 w-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-primary-400 font-semibold">
            {user?.name.charAt(0).toUpperCase()}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span>{user?.name}</span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{user?.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/settings")}>
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogoutClick} className="text-red-600 dark:text-red-400">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      {/* Active Upload Warning Dialog */}
      <AlertDialog open={showLogoutAlert} onOpenChange={setShowLogoutAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center text-amber-600 dark:text-amber-500">
              <AlertTriangle className="mr-2 h-5 w-5" />
              Active Uploads in Progress
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have uploads in progress. Logging out now will cancel all uploads and your files will not be saved.
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-md text-amber-800 dark:text-amber-300">
                <strong>Recommendation:</strong> Please wait for all uploads to complete before logging out.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay Logged In</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white dark:bg-red-700 dark:hover:bg-red-800"
            >
              Log Out Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mobile header - hidden on desktop */}
      <div className="bg-white dark:bg-gray-900 border-b border-neutral-200 dark:border-gray-800 flex items-center justify-between px-4 py-2 sm:px-6 md:hidden">
        <Logo size="sm" />
        
        <div className="flex items-center space-x-3">
          <ThemeToggle />
          {user && <UserProfileDropdown />}
          
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6 text-neutral-500 dark:text-neutral-400" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <Sidebar />
            </SheetContent>
          </Sheet>
        </div>
      </div>
      
      {/* Desktop header - visible only on desktop */}
      <div className="hidden md:flex bg-white dark:bg-gray-900 border-b border-neutral-200 dark:border-gray-800 items-center justify-between px-4 py-2 h-16">
        {/* Left side - Toggle sidebar button */}
        <Button
          variant="ghost"
          size="icon"
          className="text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-gray-800"
          onClick={toggleSidebar}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronRight className={cn(
            "h-5 w-5 transition-transform duration-200",
            isCollapsed ? "" : "rotate-180"
          )} />
        </Button>
        
        {/* Right side - User controls */}
        <div className="flex items-center space-x-3">
          <ThemeToggle />
          {user && <UserProfileDropdown />}
        </div>
      </div>
    </>
  );
}
