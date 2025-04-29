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
import { Loader2, FileVideo, Edit, Users, Plus, MessageSquare, Clock, Settings as SettingsIcon, Download, Share2, UserPlus, Mail } from "lucide-react";
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
    queryKey: ["/api/projects", projectId, "users"],
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
  
  // Parse URL parameters for file ID and timestamp
  useEffect(() => {
    // Parse the URL for potential media ID and timestamp parameters
    if (location) {
      const url = new URL(window.location.href);
      const searchParams = new URLSearchParams(url.search);
      
      // Check for time parameter
      const timeParam = searchParams.get('time');
      if (timeParam) {
        const time = parseFloat(timeParam);
        if (!isNaN(time)) {
          setInitialTime(time);
          setActiveTab("media");
        }
      }
      
      // Check for media ID parameter
      const mediaParam = searchParams.get('media');
      if (mediaParam && files && files.length > 0) {
        const mediaId = parseInt(mediaParam);
        if (!isNaN(mediaId) && files.some(file => file.id === mediaId)) {
          setSelectedFileId(mediaId);
          setActiveTab("media");
        }
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
          <div className="mt-4 flex flex-wrap gap-2 md:mt-0 md:ml-4">
            {/* Share Button */}
            <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex items-center">
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
                <Button variant="outline" className="flex items-center">
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
                <Button variant="outline" className="flex items-center">
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
                initialTime={initialTime}
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
                  <Button 
                    size="sm" 
                    className="flex items-center"
                    onClick={() => setInviteDialogOpen(true)}
                  >
                    <UserPlus className="h-4 w-4 mr-1.5" />
                    Invite Members
                  </Button>
                </div>
                {/* Team Members List */}
                <div className="space-y-4 mt-2">
                  {/* Active Members */}
                  <div className="border rounded-md">
                    {projectMembers && projectMembers.length > 0 ? (
                      projectMembers.filter(member => member.user).map((member) => (
                        <div 
                          key={member.id} 
                          className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0 h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-semibold">
                              {member.user?.name?.charAt(0).toUpperCase() || member.user?.email?.charAt(0).toUpperCase() || '?'}
                            </div>
                            <div>
                              <div className="text-sm font-medium">{member.user?.name || 'Unknown user'}</div>
                              <div className="text-xs text-gray-500">{member.user?.email}</div>
                            </div>
                          </div>
                          <div className="flex items-center">
                            <Badge 
                              className={`mr-2 ${
                                member.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                member.role === 'editor' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {member.role && (member.role.charAt(0).toUpperCase() + member.role.slice(1))}
                            </Badge>
                            {isEditor && (
                              <Button 
                                size="sm" 
                                variant="ghost"
                                className="text-gray-500 hover:text-red-600"
                                onClick={() => {
                                  // Implement remove member functionality
                                  if (window.confirm(`Remove ${member.user?.name || member.user?.email || 'this user'} from project?`)) {
                                    fetch(`/api/projects/${projectId}/users/${member.userId}`, {
                                      method: 'DELETE',
                                      credentials: 'include',
                                    })
                                    .then(response => {
                                      if (!response.ok) throw new Error('Failed to remove member');
                                      // Invalidate query to refresh members list
                                      window.location.reload();
                                    })
                                    .catch(error => {
                                      toast({
                                        title: 'Failed to remove member',
                                        description: error.message,
                                        variant: 'destructive',
                                      });
                                    });
                                  }
                                }}
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      pendingInvitations && pendingInvitations.length === 0 && (
                        <div className="py-8 text-center text-gray-500">
                          <Users className="h-10 w-10 mx-auto mb-2 text-gray-400" />
                          <p>No team members yet</p>
                          <p className="text-sm mt-1">Invite members to collaborate on this project</p>
                        </div>
                      )
                    )}
                  </div>

                  {/* Pending Invitations */}
                  {pendingInvitations && pendingInvitations.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-medium mb-3 flex items-center">
                        <Mail className="h-4 w-4 mr-1.5 text-gray-500" />
                        Pending Invitations
                      </h4>
                      <ProjectInvitations projectId={projectId} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
