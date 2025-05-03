import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import AppLayout from "@/components/layout/app-layout";
import { useProject } from "@/hooks/use-projects";
import { useMediaFiles } from "@/hooks/use-media";
import { useQuery } from "@tanstack/react-query";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, FileVideo, Edit, Users, Plus, MessageSquare, Clock, Settings as SettingsIcon, Download, Share2, UserPlus, Mail, ClipboardCheck } from "lucide-react";
import MediaPlayer from "@/components/media/media-player";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import ProjectForm from "@/components/projects/project-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectCommentsTab } from "@/components/project/project-comments-tab";
import { ProjectActivityTab } from "@/components/project/project-activity-tab";
import InviteForm from "@/components/project/invite-form";
import { ProjectInvitations } from "@/components/project/project-invitations";
import { ProjectTeamMembers } from "@/components/project/project-team-members";
import { ProjectMediaManager } from "@/components/project/project-media-manager";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";



export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id);
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Fetch all users for the invite dropdown
  const { data: allUsers } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });
  
  // Fetch project members to filter out from invite dropdown
  const { data: projectMembers } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "members"],
    enabled: !!projectId,
  });
  
  // Fetch pending invitations for this project
  const projectInvitationsQuery = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "invitations"],
    enabled: !!projectId,
  });
  const { data: pendingInvitations } = projectInvitationsQuery;
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [initialTime, setInitialTime] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("media");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [showUsersDropdown, setShowUsersDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  
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
      document.title = `${project.name} | Obviu.io`;
    }
  }, [project]);

  useEffect(() => {
    // Set the first file as selected when files load
    if (files && files.length > 0 && !selectedFileId) {
      setSelectedFileId(files[0].id);
    }
  }, [files, selectedFileId]);
  
  // Listen for custom event for timestamp navigation
  useEffect(() => {
    // Handler for the custom event
    const handleJumpEvent = (event: any) => {
      console.log("⚡ Received custom jump event:", event.detail);
      const { fileId, timestamp } = event.detail;
      
      if (fileId && timestamp !== undefined) {
        setSelectedFileId(fileId);
        setInitialTime(timestamp);
        setActiveTab("media");
      }
    };
    
    // Handler for the backup event
    const handleBackupEvent = (event: any) => {
      console.log("⚡ Received backup jump event:", event.detail);
      const { fileId, timestamp } = event.detail;
      
      if (fileId && timestamp !== undefined) {
        setSelectedFileId(fileId);
        setInitialTime(timestamp);
        setActiveTab("media");
      }
    };
    
    // Add event listeners
    window.addEventListener('obviu_jump_to_timestamp', handleJumpEvent);
    document.addEventListener('obviu_jump_to_timestamp_backup', handleBackupEvent);
    
    // Also check for our global window variable
    const checkWindowVar = () => {
      try {
        const jumpData = (window as any).Obviu_jumpToMedia;
        if (jumpData && jumpData.projectId === projectId) {
          console.log("⚡ Found global jump data:", jumpData);
          setSelectedFileId(jumpData.fileId);
          setInitialTime(jumpData.timestamp);
          setActiveTab("media");
          // Clear it so it's only used once
          try {
            delete (window as any).Obviu_jumpToMedia;
          } catch (e) {
            console.error("Failed to delete global variable:", e);
            // Alternative approach to clear it
            (window as any).Obviu_jumpToMedia = null;
          }
        }
      } catch (e) {
        console.error("Error checking window variable:", e);
      }
    };
    
    // Check when component mounts
    checkWindowVar();
    
    // Check periodically in case it's set after we've mounted
    const intervalId = setInterval(checkWindowVar, 300);
    
    // Clean up
    return () => {
      window.removeEventListener('obviu_jump_to_timestamp', handleJumpEvent);
      document.removeEventListener('obviu_jump_to_timestamp_backup', handleBackupEvent);
      clearInterval(intervalId);
    };
  }, [projectId]);
  
  // Parse URL parameters for file ID and timestamp
  useEffect(() => {
    // Check for hash in URL to set active tab
    if (location.includes('#')) {
      const hash = location.split('#')[1];
      if (hash) {
        setActiveTab(hash);
      }
    }
    
    // Parse URL query parameters (always do this regardless of hash)
    if (location) {
      console.log("Parsing URL params from location:", location);
      const url = new URL(window.location.href);
      const searchParams = new URLSearchParams(url.search);
      console.log("Search params:", Object.fromEntries(searchParams.entries()));
      
      // Always prioritize query parameters if they exist
      let hasTimeParam = false;
      let hasMediaParam = false;
      
      // Check for time parameter
      const timeParam = searchParams.get('time');
      if (timeParam) {
        const time = parseFloat(timeParam);
        console.log("Found time parameter:", time);
        if (!isNaN(time)) {
          setInitialTime(time);
          hasTimeParam = true;
        }
      }
      
      // Check for media ID parameter
      const mediaParam = searchParams.get('media');
      if (mediaParam) {
        const mediaId = parseInt(mediaParam);
        console.log("Found media parameter:", mediaId);
        console.log("Available files:", files);
        
        if (!isNaN(mediaId)) {
          // Always set the file ID even if it's not in the current files list yet
          // The files list might not be loaded yet
          setSelectedFileId(mediaId);
          hasMediaParam = true;
        }
      }
      
      // If we found any media parameters, always switch to media tab
      if (hasTimeParam || hasMediaParam) {
        setActiveTab("media");
      }
    }
  }, [location, files]);

  const selectedFile = files?.find(file => file.id === selectedFileId);
  
  // Share project handler
  const handleShareProject = () => {
    const shareUrl = `${window.location.origin}/projects/${projectId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      toast({
        title: "Link copied to clipboard",
        description: "You can now share this link with others",
      });
      setShareDialogOpen(false);
    }).catch(() => {
      toast({
        title: "Failed to copy link",
        description: "Please try again or copy the link manually",
        variant: "destructive",
      });
    });
  };
  
  // Download project handler
  const handleDownloadFile = (fileId: number) => {
    if (!fileId) {
      toast({
        title: "No file selected",
        description: "Please select a file to download",
        variant: "destructive",
      });
      return;
    }
    
    // Redirect to download endpoint
    window.open(`/api/files/${fileId}/download`, '_blank');
    setDownloadDialogOpen(false);
    
    toast({
      title: "Download started",
      description: "Your file is being downloaded",
    });
  };
  
  // Invite member handler
  const handleInviteMember = (email: string, role: string = "viewer") => {
    // Make API call to invite member
    fetch(`/api/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        projectId,
        role,
      }),
      credentials: 'include',
    })
    .then(response => {
      if (!response.ok) throw new Error("Failed to send invitation");
      return response.json();
    })
    .then(data => {
      toast({
        title: "Invitation sent",
        description: `Invitation sent to ${email}`,
      });
      setInviteDialogOpen(false);
    })
    .catch(error => {
      toast({
        title: "Failed to send invitation",
        description: error.message,
        variant: "destructive",
      });
    });
  };

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
  
  // Function to update project status to "In Review"
  const handleMarkAsInReview = () => {
    if (project.status !== 'in_review' && project.status !== 'approved' && !isUpdatingStatus) {
      setIsUpdatingStatus(true);
      
      // Direct API call instead of using hook
      fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'in_review' }),
        credentials: 'include',
      })
        .then(response => {
          if (!response.ok) throw new Error("Failed to update project status");
          return response.json();
        })
        .then(data => {
          toast({
            title: "Project marked as In Review",
            description: "Project status has been updated successfully",
          });
          // Refresh project data
          window.location.reload();
        })
        .catch(error => {
          toast({
            title: "Failed to update project status",
            description: error.message,
            variant: "destructive",
          });
        })
        .finally(() => {
          setIsUpdatingStatus(false);
        });
    }
  };

  return (
    <AppLayout>
      {/* Project Header */}
      <header className="bg-white shadow-sm dark:bg-[#0f1218] dark:border-b dark:border-gray-800">
        <div className="px-4 sm:px-6 lg:px-8 py-4 md:flex md:items-center md:justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-teal-300">{project.name}</h1>
            <div className="flex items-center mt-1">
              <span className="text-sm text-neutral-500 dark:text-gray-400">
                Updated {formatTimeAgo(new Date(project.updatedAt))}
              </span>
              <span className="mx-2 text-neutral-300 dark:text-gray-700">•</span>
              {getStatusBadge(project.status)}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 md:mt-0 md:ml-4">
            {/* Share Button */}
            <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  className="flex items-center dark:bg-[#026d55] dark:text-white dark:border-[#026d55] dark:hover:bg-[#025943] dark:hover:border-[#025943]"
                >
                  <Share2 className="h-4 w-4 mr-1.5" />
                  Share
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Share Project</DialogTitle>
                  <DialogDescription>
                    Share this project link with your team members or clients
                  </DialogDescription>
                </DialogHeader>
                <div className="flex items-center space-x-2 py-4">
                  <Input 
                    readOnly
                    value={`${window.location.origin}/projects/${projectId}`}
                    className="flex-1"
                  />
                  <Button type="button" onClick={handleShareProject} className="shrink-0">
                    Copy Link
                  </Button>
                </div>
                <DialogFooter className="sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShareDialogOpen(false)}
                  >
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Download Button */}
            <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  className="flex items-center dark:bg-[#026d55] dark:text-white dark:border-[#026d55] dark:hover:bg-[#025943] dark:hover:border-[#025943]"
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Download
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Download Files</DialogTitle>
                  <DialogDescription>
                    Select a file to download
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  {filesLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : files && files.length > 0 ? (
                    <div className="space-y-2">
                      {files.map(file => (
                        <div 
                          key={file.id}
                          className="flex items-center justify-between border p-3 rounded-md"
                        >
                          <div className="flex items-center">
                            <FileVideo className="h-5 w-5 mr-2 text-primary" />
                            <div className="text-sm">{file.filename}</div>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => handleDownloadFile(file.id)}
                          >
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-neutral-500">
                      No files available for download
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setDownloadDialogOpen(false)}
                  >
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Invite Members Button */}
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  className="flex items-center dark:bg-[#026d55] dark:text-white dark:border-[#026d55] dark:hover:bg-[#025943] dark:hover:border-[#025943]"
                >
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  Invite Members
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Team Members</DialogTitle>
                  <DialogDescription>
                    Invite team members to collaborate on this project
                  </DialogDescription>
                </DialogHeader>
                {/* Using the new InviteForm component */}
                <div className="py-4">
                  <InviteForm
                    projectId={projectId}
                    onInviteSent={() => {
                      setInviteDialogOpen(false);
                      // Refetch pending invitations
                      projectInvitationsQuery.refetch();
                      // Show success message
                      toast({
                        title: "Invitation sent",
                        description: "Project invitation was sent successfully!",
                        variant: "default",
                      });
                    }}
                  />
                </div>
              </DialogContent>
            </Dialog>

            {isEditor && (
              <>
                <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="flex items-center dark:bg-[#026d55] dark:text-white dark:border-[#026d55] dark:hover:bg-[#025943] dark:hover:border-[#025943]"
                    >
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
                <Button 
                  className="flex items-center dark:bg-[#026d55] dark:text-white dark:hover:bg-[#025943]" 
                  onClick={() => navigate(`/projects/${projectId}/upload`)}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Upload Media
                </Button>
              </>
            )}
          </div>
        </div>
        
        {/* Tabs */}
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="border-b border-neutral-200 dark:border-gray-800">
            <nav className="-mb-px flex space-x-8">
              <a 
                href="#" 
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "media" 
                    ? "border-primary-400 text-primary-500 dark:border-[#026d55] dark:text-[#026d55]" 
                    : "border-transparent text-neutral-500 dark:text-gray-400 hover:text-neutral-700 dark:hover:text-gray-300 hover:border-neutral-300 dark:hover:border-gray-700"
                }`}
                onClick={(e) => { e.preventDefault(); setActiveTab("media"); }}
              >
                Media
              </a>
              <a 
                href="#" 
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "comments" 
                    ? "border-primary-400 text-primary-500 dark:border-[#026d55] dark:text-[#026d55]" 
                    : "border-transparent text-neutral-500 dark:text-gray-400 hover:text-neutral-700 dark:hover:text-gray-300 hover:border-neutral-300 dark:hover:border-gray-700"
                }`}
                onClick={(e) => { e.preventDefault(); setActiveTab("comments"); }}
              >
                Comments
              </a>
              <a 
                href="#" 
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "activity" 
                    ? "border-primary-400 text-primary-500 dark:border-[#026d55] dark:text-[#026d55]" 
                    : "border-transparent text-neutral-500 dark:text-gray-400 hover:text-neutral-700 dark:hover:text-gray-300 hover:border-neutral-300 dark:hover:border-gray-700"
                }`}
                onClick={(e) => { e.preventDefault(); setActiveTab("activity"); }}
              >
                Activity
              </a>
              <a 
                href="#" 
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "settings" 
                    ? "border-primary-400 text-primary-500 dark:border-[#026d55] dark:text-[#026d55]" 
                    : "border-transparent text-neutral-500 dark:text-gray-400 hover:text-neutral-700 dark:hover:text-gray-300 hover:border-neutral-300 dark:hover:border-gray-700"
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
      <main className="flex-1 overflow-y-auto bg-neutral-100 dark:bg-[#080b12] p-4 sm:p-6 lg:p-8">
        {activeTab === "media" && (
          <div className="bg-white dark:bg-[#0f1218] rounded-lg shadow dark:shadow-gray-900">
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
                initialTime={initialTime}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="h-16 w-16 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mb-4">
                  <FileVideo className="h-8 w-8 text-primary-400" />
                </div>
                <h3 className="text-lg font-medium text-neutral-900 dark:text-teal-300 mb-2">No media files yet</h3>
                <p className="text-neutral-500 dark:text-gray-400 text-center mb-6 max-w-md">
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
          <div className="bg-white dark:bg-[#0f1218] rounded-lg shadow dark:shadow-gray-900 p-4 sm:p-6">
            <h2 className="text-lg font-medium mb-4 flex items-center dark:text-white">
              <MessageSquare className="h-5 w-5 mr-2 text-primary dark:text-[#026d55]" />
              All Comments
            </h2>
            
            <ProjectCommentsTab projectId={projectId} />
          </div>
        )}

        {activeTab === "activity" && (
          <div className="bg-white dark:bg-[#0f1218] rounded-lg shadow dark:shadow-gray-900 p-4 sm:p-6">
            <h2 className="text-lg font-medium mb-4 flex items-center dark:text-white">
              <Clock className="h-5 w-5 mr-2 text-primary dark:text-[#026d55]" />
              Activity Log
            </h2>
            
            <ProjectActivityTab projectId={projectId} />
          </div>
        )}

        {activeTab === "settings" && (
          <div className="bg-white dark:bg-[#0f1218] rounded-lg shadow dark:shadow-gray-900 p-4 sm:p-6">
            <h2 className="text-lg font-medium mb-4 text-teal-700 dark:text-teal-300">Project Settings</h2>
            <div className="space-y-8">
              <div>
                <h3 className="text-base font-medium mb-2 dark:text-gray-200">Project Details</h3>
                <ProjectForm 
                  projectId={projectId} 
                  className="max-w-lg"
                />
              </div>
              
              {/* Project Media Manager - Only visible for admins */}
              {user?.role === "admin" && (
                <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
                  <ProjectMediaManager projectId={projectId} />
                </div>
              )}
              
              <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
                <h3 className="text-base font-medium mb-2 dark:text-gray-200">Team Members</h3>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-neutral-500 dark:text-gray-400">
                    Manage who has access to this project
                  </p>
                </div>
                
                {/* Team Members List */}
                <ProjectTeamMembers 
                  projectId={projectId}
                  onInviteClick={() => setInviteDialogOpen(true)}
                />

                {/* Pending Invitations */}
                {pendingInvitations && pendingInvitations.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-medium mb-3 flex items-center">
                      <Mail className="h-4 w-4 mr-1.5 text-gray-500 dark:text-[#026d55]" />
                      Pending Invitations
                    </h4>
                    <ProjectInvitations projectId={projectId} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
