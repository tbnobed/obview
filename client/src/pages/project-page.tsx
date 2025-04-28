import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import AppLayout from "@/components/layout/app-layout";
import { useProject } from "@/hooks/use-projects";
import { useMediaFiles } from "@/hooks/use-media";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, FileVideo, Edit, Users, Plus, MessageSquare, Clock, Settings as SettingsIcon } from "lucide-react";
import MediaPlayer from "@/components/media/media-player";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ProjectForm from "@/components/projects/project-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectCommentsTab } from "@/components/project/project-comments-tab";
import { ProjectActivityTab } from "@/components/project/project-activity-tab";



export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id);
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [initialTime, setInitialTime] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("media");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  const { 
    data: project, 
    isLoading: projectLoading,
    error: projectError 
  } = useProject(projectId);
  
  const {
    data: files,
    isLoading: filesLoading,
    error: filesError
  } = useMediaFiles(projectId);

  useEffect(() => {
    if (project) {
      document.title = `${project.name} | MediaReview.io`;
    }
  }, [project]);

  useEffect(() => {
    // Set the first file as selected when files load
    if (files && files.length > 0 && !selectedFileId) {
      setSelectedFileId(files[0].id);
    }
  }, [files, selectedFileId]);

  const selectedFile = files?.find(file => file.id === selectedFileId);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-600">Approved</Badge>;
      case 'in_review':
        return <Badge className="bg-blue-600">In Review</Badge>;
      case 'in_progress':
      default:
        return <Badge className="bg-yellow-600">In Progress</Badge>;
    }
  };

  if (projectLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (projectError || !project) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="text-xl font-semibold mb-2">Project not found</div>
          <p className="text-neutral-500 mb-6">The project you're looking for doesn't exist or you don't have access.</p>
          <Button onClick={() => navigate("/projects")}>
            Go to Projects
          </Button>
        </div>
      </AppLayout>
    );
  }

  const isEditor = user?.role === "admin" || user?.role === "editor";

  return (
    <AppLayout>
      {/* Project Header */}
      <header className="bg-white shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8 py-4 md:flex md:items-center md:justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-neutral-900">{project.name}</h1>
            <div className="flex items-center mt-1">
              <span className="text-sm text-neutral-500">
                Updated {formatTimeAgo(new Date(project.updatedAt))}
              </span>
              <span className="mx-2 text-neutral-300">•</span>
              {getStatusBadge(project.status)}
            </div>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4 space-x-2">
            {isEditor && (
              <>
                <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="flex items-center">
                      <Edit className="h-4 w-4 mr-1.5" />
                      Edit Project
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit Project</DialogTitle>
                    </DialogHeader>
                    <ProjectForm 
                      projectId={projectId} 
                      onSuccess={() => setEditDialogOpen(false)} 
                    />
                  </DialogContent>
                </Dialog>
                <Button className="flex items-center" onClick={() => navigate(`/projects/${projectId}/upload`)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Upload Media
                </Button>
              </>
            )}
          </div>
        </div>
        
        {/* Tabs */}
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="border-b border-neutral-200">
            <nav className="-mb-px flex space-x-8">
              <a 
                href="#" 
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "media" 
                    ? "border-primary-400 text-primary-500" 
                    : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
                }`}
                onClick={(e) => { e.preventDefault(); setActiveTab("media"); }}
              >
                Media
              </a>
              <a 
                href="#" 
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "comments" 
                    ? "border-primary-400 text-primary-500" 
                    : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
                }`}
                onClick={(e) => { e.preventDefault(); setActiveTab("comments"); }}
              >
                Comments
              </a>
              <a 
                href="#" 
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "activity" 
                    ? "border-primary-400 text-primary-500" 
                    : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
                }`}
                onClick={(e) => { e.preventDefault(); setActiveTab("activity"); }}
              >
                Activity
              </a>
              <a 
                href="#" 
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "settings" 
                    ? "border-primary-400 text-primary-500" 
                    : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
                }`}
                onClick={(e) => { e.preventDefault(); setActiveTab("settings"); }}
              >
                Settings
              </a>
            </nav>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-neutral-100 p-4 sm:p-6 lg:p-8">
        {activeTab === "media" && (
          <div className="bg-white rounded-lg shadow">
            {filesLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : files && files.length > 0 ? (
              <MediaPlayer
                file={selectedFile}
                projectId={projectId}
                onSelectFile={setSelectedFileId}
                files={files}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="h-16 w-16 rounded-full bg-primary-50 flex items-center justify-center mb-4">
                  <FileVideo className="h-8 w-8 text-primary-400" />
                </div>
                <h3 className="text-lg font-medium text-neutral-900 mb-2">No media files yet</h3>
                <p className="text-neutral-500 text-center mb-6 max-w-md">
                  Upload your first media file to start the review process
                </p>
                {isEditor && (
                  <Button onClick={() => navigate(`/projects/${projectId}/upload`)}>
                    Upload Media
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "comments" && (
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h2 className="text-lg font-medium mb-4 flex items-center">
              <MessageSquare className="h-5 w-5 mr-2 text-primary" />
              All Comments
            </h2>
            
            <ProjectCommentsTab projectId={projectId} />
          </div>
        )}

        {activeTab === "activity" && (
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h2 className="text-lg font-medium mb-4 flex items-center">
              <Clock className="h-5 w-5 mr-2 text-primary" />
              Activity Log
            </h2>
            
            <ProjectActivityTab projectId={projectId} />
          </div>
        )}

        {activeTab === "settings" && (
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h2 className="text-lg font-medium mb-4">Project Settings</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-medium mb-2">Project Details</h3>
                <ProjectForm 
                  projectId={projectId} 
                  className="max-w-lg"
                />
              </div>
              
              <div>
                <h3 className="text-base font-medium mb-2">Team Members</h3>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-neutral-500">
                    Manage who has access to this project
                  </p>
                  <Button size="sm" className="flex items-center">
                    <Users className="h-4 w-4 mr-1.5" />
                    Invite Members
                  </Button>
                </div>
                {/* Team members list would go here */}
              </div>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
