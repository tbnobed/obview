import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/use-projects";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";

export default function Sidebar() {
  const { user } = useAuth();
  const [location] = useLocation();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  
  // Filter to show maximum 5 projects in sidebar
  const recentProjects = projects?.slice(0, 5) || [];

  return (
    <div className="flex flex-col w-64 border-r border-neutral-200 bg-white">
      <div className="flex items-center justify-center h-16 flex-shrink-0 px-4 bg-primary-400">
        <Link href="/">
          <h1 className="text-white font-bold text-xl cursor-pointer">MediaReview.io</h1>
        </Link>
      </div>
      
      {/* Main Navigation */}
      <ScrollArea className="flex-1 overflow-y-auto">
        <nav className="flex-1 px-2 py-4 space-y-1">
          <Link href="/">
            <a className={cn(
              "flex items-center px-2 py-2 text-sm font-medium rounded-md",
              location === "/" 
                ? "bg-primary-50 text-primary-600" 
                : "text-neutral-600 hover:bg-neutral-100"
            )}>
              <svg className={cn(
                "mr-3 h-5 w-5",
                location === "/" ? "text-primary-500" : "text-neutral-500"
              )} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
              Dashboard
            </a>
          </Link>
          
          <Link href="/projects">
            <a className={cn(
              "flex items-center px-2 py-2 text-sm font-medium rounded-md",
              location === "/projects" || location.startsWith("/project/") 
                ? "bg-primary-50 text-primary-600" 
                : "text-neutral-600 hover:bg-neutral-100"
            )}>
              <svg className={cn(
                "mr-3 h-5 w-5",
                location === "/projects" || location.startsWith("/project/") 
                  ? "text-primary-500" 
                  : "text-neutral-500"
              )} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
              </svg>
              Projects
            </a>
          </Link>

          {user?.role === "admin" && (
            <Link href="/admin">
              <a className={cn(
                "flex items-center px-2 py-2 text-sm font-medium rounded-md",
                location === "/admin" 
                  ? "bg-primary-50 text-primary-600" 
                  : "text-neutral-600 hover:bg-neutral-100"
              )}>
                <svg className={cn(
                  "mr-3 h-5 w-5",
                  location === "/admin" ? "text-primary-500" : "text-neutral-500"
                )} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                </svg>
                Admin
              </a>
            </Link>
          )}
          
          <Link href="/settings">
            <a className={cn(
              "flex items-center px-2 py-2 text-sm font-medium rounded-md",
              location === "/settings" 
                ? "bg-primary-50 text-primary-600" 
                : "text-neutral-600 hover:bg-neutral-100"
            )}>
              <svg className={cn(
                "mr-3 h-5 w-5",
                location === "/settings" ? "text-primary-500" : "text-neutral-500"
              )} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              Settings
            </a>
          </Link>
        </nav>
        
        {/* Project List */}
        <div className="px-4 py-4 border-t border-neutral-200">
          <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Your Projects</h2>
          {projectsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
            </div>
          ) : recentProjects.length > 0 ? (
            <div className="mt-3 space-y-2">
              {recentProjects.map(project => (
                <Link key={project.id} href={`/project/${project.id}`}>
                  <a className={cn(
                    "group flex items-center px-2 py-2 text-sm rounded-md",
                    location === `/project/${project.id}` 
                      ? "bg-primary-50 text-primary-700" 
                      : "text-neutral-700 hover:bg-neutral-100"
                  )}>
                    <span className="truncate">{project.name}</span>
                  </a>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-3 px-2 py-3 text-sm text-neutral-500">
              <p>No projects yet</p>
              <Button 
                variant="link" 
                className="px-0 py-0 h-auto text-primary-500"
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
        <div className="flex items-center px-4 py-3 border-t border-neutral-200 mt-auto">
          <div className="flex-shrink-0">
            <div className="h-9 w-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-neutral-800">{user.name}</p>
            <p className="text-xs text-neutral-500">{user.role.charAt(0).toUpperCase() + user.role.slice(1)}</p>
          </div>
          <Link href="/settings">
            <a className="ml-auto bg-white rounded-full p-1 text-neutral-400 hover:text-neutral-600">
              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </a>
          </Link>
        </div>
      )}
    </div>
  );
}
