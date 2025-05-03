import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/use-projects";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  Home, 
  FolderKanban, 
  Users, 
  Settings,
  LogOut 
} from "lucide-react";
import Logo from "@/components/ui/logo";

export default function Sidebar() {
  const { user } = useAuth();
  const [location] = useLocation();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  
  // Get top 10 most recent projects, already sorted by last edited from the useProjects hook
  const recentProjects = projects ? projects.slice(0, 10) : [];

  return (
    <div className="flex flex-col w-72 border-r border-neutral-200 dark:border-gray-900 bg-white dark:bg-[#0a0d14] shadow-sm">
      <div className="flex items-center justify-center h-60 pt-10 flex-shrink-0 bg-gradient-to-r from-primary-600 to-primary-400 dark:from-primary-900 dark:to-primary-700">
        <Logo size="lg" className="text-white scale-[3]" />
      </div>
      
      {/* Main Navigation */}
      <ScrollArea className="flex-1 overflow-y-auto">
        <nav className="flex-1 px-2 py-4 space-y-1">
          <Link href="/">
            <div className={cn(
              "flex items-center px-4 py-3 text-sm font-medium rounded-md cursor-pointer transition-colors",
              location === "/" 
                ? "bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400" 
                : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-gray-800"
            )}>
              <Home className={cn(
                "mr-3 h-5 w-5",
                location === "/" ? "text-primary-500 dark:text-primary-400" : "text-neutral-500 dark:text-neutral-400"
              )} />
              Dashboard
            </div>
          </Link>
          
          <Link href="/projects">
            <div className={cn(
              "flex items-center px-4 py-3 text-sm font-medium rounded-md cursor-pointer transition-colors",
              location === "/projects" || location.startsWith("/project/") 
                ? "bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400" 
                : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-gray-800"
            )}>
              <FolderKanban className={cn(
                "mr-3 h-5 w-5",
                location === "/projects" || location.startsWith("/project/") 
                  ? "text-primary-500 dark:text-primary-400" 
                  : "text-neutral-500 dark:text-neutral-400"
              )} />
              Projects
            </div>
          </Link>

          {user?.role === "admin" && (
            <Link href="/admin">
              <div className={cn(
                "flex items-center px-4 py-3 text-sm font-medium rounded-md cursor-pointer transition-colors",
                location === "/admin" 
                  ? "bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400" 
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-gray-800"
              )}>
                <Users className={cn(
                  "mr-3 h-5 w-5",
                  location === "/admin" ? "text-primary-500 dark:text-primary-400" : "text-neutral-500 dark:text-neutral-400"
                )} />
                Admin
              </div>
            </Link>
          )}
          
          <Link href="/settings">
            <div className={cn(
              "flex items-center px-4 py-3 text-sm font-medium rounded-md cursor-pointer transition-colors",
              location === "/settings" 
                ? "bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400" 
                : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-gray-800"
            )}>
              <Settings className={cn(
                "mr-3 h-5 w-5",
                location === "/settings" ? "text-primary-500 dark:text-primary-400" : "text-neutral-500 dark:text-neutral-400"
              )} />
              Settings
            </div>
          </Link>
        </nav>
        
        {/* Project List */}
        <div className="px-4 py-4 border-t border-neutral-200 dark:border-gray-900">
          <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-300 uppercase tracking-wider">Your Projects</h2>
          {projectsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-neutral-400 dark:text-neutral-500" />
            </div>
          ) : recentProjects.length > 0 ? (
            <div className="mt-3 space-y-2 overflow-y-auto pr-1">
              {recentProjects.map(project => (
                <Link key={project.id} href={`/project/${project.id}`}>
                  <div className={cn(
                    "group flex items-center px-2 py-2 text-sm rounded-md cursor-pointer",
                    location === `/project/${project.id}` 
                      ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400" 
                      : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-gray-900/70"
                  )}>
                    <span className="truncate" title={project.name}>
                      {project.name.length > 20 ? `${project.name.substring(0, 20)}...` : project.name}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-3 px-2 py-3 text-sm text-neutral-500 dark:text-neutral-400">
              <p>No projects yet</p>
              <Button 
                variant="link" 
                className="px-0 py-0 h-auto text-primary-500 dark:text-primary-400"
                onClick={() => window.location.href="/projects"}
              >
                Create your first project
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
      
      {/* User profile */}
      {user && (
        <div className="mt-auto">
          <div className="flex flex-col px-4 py-4 border-t border-neutral-200 dark:border-gray-900">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 rounded-full bg-gradient-to-r from-primary-600 to-primary-800 dark:from-primary-700 dark:to-primary-900 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{user.name}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{user.role.charAt(0).toUpperCase() + user.role.slice(1)}</p>
              </div>
            </div>
            
            <div className="flex mt-3 pt-3 border-t border-neutral-100 dark:border-gray-900">
              <Link href="/settings" className="flex items-center text-sm text-neutral-600 dark:text-neutral-300 mr-4 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                <Settings className="h-4 w-4 mr-1.5" />
                Account
              </Link>
              <Link href="/logout" className="flex items-center text-sm text-neutral-600 dark:text-neutral-300 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                <LogOut className="h-4 w-4 mr-1.5" />
                Sign out
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
