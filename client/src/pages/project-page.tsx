import { debugLog } from "@/lib/debug";
import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import AppLayout from "@/components/layout/app-layout";
import { useProject } from "@/hooks/use-projects";
import { useMediaFiles } from "@/hooks/use-media";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, FileVideo, Plus, Clock, Settings as SettingsIcon, Download, Share2, UserPlus, Mail, ChevronLeft, Activity, MoreHorizontal, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSidebar } from "@/hooks/use-sidebar";
import { useRecentProjects } from "@/hooks/use-recent-projects";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import MediaPlayer from "@/components/media/media-player";
import MediaCardGrid from "@/components/media/media-card-grid";
import { ProjectFoldersStrip, MoveFileDialog } from "@/components/projects/project-folders";
import type { File as StorageFile, Folder } from "@shared/schema";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useOsFileDrop } from "@/lib/use-os-file-drop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import ProjectForm from "@/components/projects/project-form";
import { ProjectActivityTab } from "@/components/project/project-activity-tab";
import InviteForm from "@/components/project/invite-form";
import { ProjectInvitations } from "@/components/project/project-invitations";
import { ProjectTeamMembers } from "@/components/project/project-team-members";
import { ProjectMediaManager } from "@/components/project/project-media-manager";
import { ProjectThumbnailManager } from "@/components/projects/project-thumbnail-manager";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import ShareLinksDialog from "@/components/sharing/share-links-dialog";
import UploadDialog from "@/components/uploads/upload-dialog";
import { Link as LinkIcon } from "lucide-react";



export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id);
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isCollapsed, toggleSidebar, collapseSidebar, expandSidebar } = useSidebar();
  // Remember whether the left sidebar was expanded before the user opened a
  // file so we can restore that state when they leave the player.
  const sidebarWasExpandedRef = useRef(false);
  const { addRecentProject } = useRecentProjects();

  // Record this project as recently opened so it shows up in the sidebar's
  // "Recent" list. Runs once per project id change.
  useEffect(() => {
    if (Number.isFinite(projectId)) {
      addRecentProject(projectId);
    }
  }, [projectId, addRecentProject]);
  
  // Fetch all users for the invite dropdown
  const { data: allUsers } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });
  
  // Fetch project members to filter out from invite dropdown.
  // NOTE: the default queryFn only uses queryKey[0] as the URL, so we must
  // pass the full URL there (or a custom queryFn). Earlier this was
  // ["/api/projects", projectId, "members"] which silently fetched the
  // project list instead of the members roster.
  const { data: projectMembers } = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/members`],
    enabled: !!projectId,
  });
  
  // Fetch pending invitations for this project
  const projectInvitationsQuery = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/invitations`],
    enabled: !!projectId,
  });
  const { data: pendingInvitations } = projectInvitationsQuery;
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [isCommentsPanelHidden, setIsCommentsPanelHidden] = useState(false);
  const [initialTime, setInitialTime] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("media");
  const [viewMode, setViewMode] = useState<'grid' | 'player'>('grid'); // Start with grid view

  // Auto-collapse the left sidebar when the user opens a file in the player so
  // they get a focused review surface, and restore it when they go back to the
  // grid (only if it was the player that collapsed it in the first place).
  useEffect(() => {
    if (viewMode === 'player') {
      if (!isCollapsed) {
        sidebarWasExpandedRef.current = true;
        collapseSidebar();
      }
    } else if (sidebarWasExpandedRef.current) {
      sidebarWasExpandedRef.current = false;
      expandSidebar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);
  const [reviewerLinksOpen, setReviewerLinksOpen] = useState(false);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [activitySheetOpen, setActivitySheetOpen] = useState(false);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  const [showUsersDropdown, setShowUsersDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // Initialize from ?folder=N in the URL so deep links from a folder
  // share land directly inside that subfolder (otherwise the user gets
  // dropped at the project root and has to click into the folder again).
  // Read once on mount; subsequent navigation is local state.
  const [currentSubfolderId, setCurrentSubfolderId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const f = new URLSearchParams(window.location.search).get("folder");
    const n = f ? parseInt(f, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  // Folders for the current project — used to resolve the name of the
  // subfolder we're browsing so the Share dialog can scope to it.
  const { data: projectFolders = [] } = useQuery<Folder[]>({
    queryKey: [`/api/projects/${projectId}/folders`],
    enabled: !!projectId,
  });
  const currentFolder =
    currentSubfolderId != null
      ? projectFolders.find((f) => f.id === currentSubfolderId) ?? null
      : null;
  const [movingFile, setMovingFile] = useState<StorageFile | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  

  
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

  // Remove auto-selection since we want to show grid first
  // useEffect(() => {
  //   // Set the first file as selected when files load
  //   if (files && files.length > 0 && !selectedFileId) {
  //     setSelectedFileId(files[0].id);
  //   }
  // }, [files, selectedFileId]);
  
  // Listen for custom event for timestamp navigation
  useEffect(() => {
    // Handler for the custom event
    const handleJumpEvent = (event: any) => {
      debugLog("⚡ Received custom jump event:", event.detail);
      const { fileId, timestamp } = event.detail;
      
      if (fileId && timestamp !== undefined) {
        setSelectedFileId(fileId);
        setInitialTime(timestamp);
        setActiveTab("media");
        setViewMode("player"); // Switch to player when jumping to timestamp
      }
    };
    
    // Handler for the backup event
    const handleBackupEvent = (event: any) => {
      debugLog("⚡ Received backup jump event:", event.detail);
      const { fileId, timestamp } = event.detail;
      
      if (fileId && timestamp !== undefined) {
        setSelectedFileId(fileId);
        setInitialTime(timestamp);
        setActiveTab("media");
        setViewMode("player"); // Switch to player when jumping to timestamp
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
          debugLog("⚡ Found global jump data:", jumpData);
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
      debugLog("Parsing URL params from location:", location);
      const url = new URL(window.location.href);
      const searchParams = new URLSearchParams(url.search);
      debugLog("Search params:", Object.fromEntries(searchParams.entries()));
      
      // Always prioritize query parameters if they exist
      let hasTimeParam = false;
      let hasMediaParam = false;
      
      // Check for time parameter
      const timeParam = searchParams.get('time');
      if (timeParam) {
        const time = parseFloat(timeParam);
        debugLog("Found time parameter:", time);
        if (!isNaN(time)) {
          setInitialTime(time);
          hasTimeParam = true;
        }
      }
      
      // Check for media ID parameter
      const mediaParam = searchParams.get('media');
      if (mediaParam) {
        const mediaId = parseInt(mediaParam);
        debugLog("Found media parameter:", mediaId);
        debugLog("Available files:", files);
        
        if (!isNaN(mediaId)) {
          // Always set the file ID even if it's not in the current files list yet
          // The files list might not be loaded yet
          setSelectedFileId(mediaId);
          hasMediaParam = true;
        }
      }
      
      // If we found any media parameters, always switch to media tab
      // and open the player (otherwise the URL just selects a file but
      // leaves the user staring at the grid).
      if (hasTimeParam || hasMediaParam) {
        setActiveTab("media");
        if (hasMediaParam) setViewMode("player");
      }
    }
  }, [location, files]);

  const selectedFile = files?.find(file => file.id === selectedFileId) || null;
  
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
        return (
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Approved
          </Badge>
        );
      case 'in_review':
        return (
          <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
            In Review
          </Badge>
        );
      case 'in_progress':
      default:
        return (
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
            In Progress
          </Badge>
        );
    }
  };

  const isEditor = user?.role === "admin" || user?.role === "editor";

  // OS-file drag onto the project page background → upload into this
  // project. Card-level handlers (stack-as-version) call
  // stopPropagation on drop so they win when the drop lands on a card.
  // Must be declared above any early returns to keep hook order stable.
  const projectDropRef = useRef<HTMLDivElement | null>(null);
  const isProjectFileDrop = useOsFileDrop(projectDropRef, projectId, {
    enabled: isEditor,
    label: project?.name || `project ${projectId}`,
    folderId: currentSubfolderId,
  });

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
  
  // Status update is now handled in the MediaPlayer component


  return (
    <AppLayout hideHeader>
     <div className={cn(
       "flex flex-col",
       viewMode === "player" ? "h-full min-h-0" : "min-h-full"
     )}>
      {/* Project Header — combined global + project bar, single row.
          Hidden in landscape on phones while a file is open so the player + comments
          get the full viewport (URL bar + header would otherwise eat ~30% of height). */}
      <header className={cn(
        "bg-white dark:bg-zinc-950 border-b border-neutral-200 dark:border-zinc-800/50",
        viewMode === "player" && "landscape:hidden lg:landscape:block",
      )}>
        <div className="px-3 py-2 flex items-center justify-between gap-3 lg:px-4 lg:py-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex h-8 w-8 shrink-0 text-neutral-500 dark:text-neutral-400 hover:text-foreground"
              onClick={toggleSidebar}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-neutral-500 hover:text-foreground"
              onClick={() => {
                if (viewMode === "player") {
                  setSelectedFileId(null);
                  setViewMode("grid");
                } else {
                  navigate("/projects");
                }
              }}
              title={viewMode === "player" ? "Back to project media" : "Back to projects"}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              {viewMode === 'player' && selectedFile ? (() => {
                // While playing a file, show the file name + uploader so
                // reviewers know exactly what they're looking at. Uploader
                // resolves from the project members roster (gated by
                // hasProjectAccess on the server, so non-members never see
                // this anyway).
                const uploaderFromMembers = (projectMembers || []).find(
                  (m: any) => m?.user?.id === selectedFile.uploadedById,
                )?.user;
                // Admins also have allUsers — covers cases where the uploader
                // isn't (or no longer is) a project member.
                const uploaderFromAll = (allUsers || []).find(
                  (u: any) => u?.id === selectedFile.uploadedById,
                );
                const uploader = uploaderFromMembers || uploaderFromAll;
                const uploaderName = uploader?.name || uploader?.username || null;
                return (
                  <div className="flex flex-col min-w-0">
                    <h1
                      className="text-sm font-semibold text-neutral-900 dark:text-white truncate lg:text-base"
                      title={(selectedFile as any).originalFilename || selectedFile.filename}
                      data-testid="player-file-title"
                    >
                      {(selectedFile as any).originalFilename || selectedFile.filename}
                    </h1>
                    <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-gray-500 truncate">
                      <span className="truncate" title={project.name}>{project.name}</span>
                      {uploaderName && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="truncate" data-testid="player-file-uploader">
                            {uploaderName}
                          </span>
                        </>
                      )}
                      <span className="hidden md:inline" aria-hidden>·</span>
                      <span className="hidden md:inline truncate">
                        Updated {formatTimeAgo(new Date(selectedFile.createdAt))}
                      </span>
                    </div>
                  </div>
                );
              })() : (
                <div className="flex items-center gap-2.5 min-w-0">
                  <h1 className="text-sm font-semibold text-neutral-900 dark:text-white truncate lg:text-base" title={project.name}>
                    {project.name}
                  </h1>
                  <span className="hidden md:inline text-xs text-neutral-400 dark:text-gray-500 truncate">
                    · Updated {formatTimeAgo(new Date(project.updatedAt))}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
              {/* Overflow menu — collapses Share, Download, Invite, Activity, Settings.
                  These are project-level actions, so they're hidden while the user
                  is focused on a single piece of media. */}
              {viewMode !== 'player' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-neutral-600 dark:text-gray-400 hover:text-foreground hover:bg-neutral-100 dark:hover:bg-gray-800/60"
                    title="More actions"
                    data-testid="button-project-actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => setReviewerLinksOpen(true)} data-testid="menu-reviewer-links">
                    <Share2 className="mr-2 h-4 w-4" />
                    {currentSubfolderId != null ? "Share folder" : "Share project"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDownloadDialogOpen(true)} data-testid="menu-download">
                    <Download className="mr-2 h-4 w-4" />
                    Download files
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setInviteDialogOpen(true)} data-testid="menu-invite">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Invite members
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setActivitySheetOpen(true)} data-testid="menu-activity">
                    <Activity className="mr-2 h-4 w-4" />
                    Activity
                  </DropdownMenuItem>
                  {isEditor && (
                    <DropdownMenuItem onSelect={() => setSettingsSheetOpen(true)} data-testid="menu-settings">
                      <SettingsIcon className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              )}

              {/* Reviewer Links Dialog */}
              <ShareLinksDialog
                open={reviewerLinksOpen}
                onOpenChange={setReviewerLinksOpen}
                scopeType={currentSubfolderId != null ? "folder" : "project"}
                scopeId={currentSubfolderId != null ? currentSubfolderId : projectId}
                scopeName={currentSubfolderId != null ? (currentFolder?.name ?? "Folder") : project?.name}
              />

            {/* Download Dialog */}
            <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
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
                            <div className="text-sm">{(file as any).originalFilename || file.filename}</div>
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

            {/* Invite Members Dialog */}
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
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

            {isEditor && viewMode !== 'player' && (
              <Button
                size="sm"
                className="h-9 px-3.5 bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shadow-sm"
                onClick={() => setUploadOpen(true)}
                title="Upload media"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline text-sm font-medium">Upload</span>
              </Button>
            )}
            {viewMode === 'player' && selectedFileId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-neutral-600 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-[#3ddcb0]"
                onClick={() => setIsCommentsPanelHidden(v => !v)}
                title={isCommentsPanelHidden ? 'Show comments panel' : 'Hide comments panel'}
                data-testid="button-toggle-comments-panel"
              >
                {isCommentsPanelHidden ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
              </Button>
            )}
            <div className="hidden md:block mx-1 h-5 w-px bg-neutral-200 dark:bg-gray-800" aria-hidden />
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
          </div>
        </div>

      </header>
      
      {/* Main Content — always media */}
      <div
        ref={projectDropRef}
        className={cn(
          "bg-neutral-50 dark:bg-zinc-950",
          viewMode === "player" ? "flex-1 min-h-0 flex flex-col p-0" : "overflow-auto p-0 lg:p-6",
          isProjectFileDrop && "ring-2 ring-inset ring-primary"
        )}
      >
        <div className={cn(
          viewMode === "player"
            ? "bg-white dark:bg-black flex-1 min-h-0 flex flex-col"
            : "bg-card border border-border/50 rounded-xl"
        )}>
          {viewMode === 'grid' && (
            <ProjectFoldersStrip
              projectId={projectId}
              currentFolderId={currentSubfolderId}
              onSelectFolder={setCurrentSubfolderId}
              canEdit={isEditor}
            />
          )}
          {(() => {
            const visibleFiles = (files ?? []).filter(
              (f) => (f.folderId ?? null) === currentSubfolderId,
            );
            if (filesLoading) {
              return (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              );
            }
            if (files && files.length > 0) {
              return (
            <>
              {viewMode === 'grid' && (
                <MediaCardGrid
                  files={visibleFiles}
                  projectId={projectId}
                  onMoveFile={isEditor ? (f) => setMovingFile(f) : undefined}
                  onSelectFile={(fileId) => {
                    setSelectedFileId(fileId);
                    setViewMode('player');
                  }}
                />
              )}

              {viewMode === 'player' && selectedFileId && (
                <div className="relative h-full flex flex-col lg:flex lg:flex-col">
                  <div className="relative flex-1 min-h-0 lg:flex-1 lg:min-h-0">
                    {/* Mobile actions container kept for compatibility */}
                    <div className="absolute top-2 right-2 z-10 lg:hidden">
                      <div id="mobile-actions-container"></div>
                    </div>
                    <MediaPlayer
                      file={files.find(f => f.id === selectedFileId) || null}
                      projectId={projectId}
                      onSelectFile={setSelectedFileId}
                      files={files}
                      initialTime={initialTime}
                      project={project}
                      isSidebarHidden={isCommentsPanelHidden}
                    />
                  </div>
                </div>
              )}
            </>
              );
            }
            return (
              <div className="flex flex-col items-center justify-center py-12 lg:py-20">
                <div className="h-12 w-12 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mb-3 lg:h-16 lg:w-16 lg:mb-4">
                  <FileVideo className="h-6 w-6 text-primary-400 lg:h-8 lg:w-8" />
                </div>
                <h3 className="text-base font-medium text-neutral-900 dark:text-teal-300 mb-2 lg:text-lg">No media files yet</h3>
                <p className="text-sm text-neutral-500 dark:text-gray-400 text-center mb-4 max-w-sm px-4 lg:text-base lg:mb-6 lg:max-w-md lg:px-0">
                  Upload your first media file to start the review process
                </p>
                {isEditor && (
                  <Button onClick={() => setUploadOpen(true)}>
                    Upload Media
                  </Button>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      <MoveFileDialog
        projectId={projectId}
        file={movingFile}
        onClose={() => setMovingFile(null)}
      />

      {project && (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          projectId={projectId}
          projectName={project.name}
          folderId={currentSubfolderId}
        />
      )}

      {/* Activity Sheet */}
      <Sheet open={activitySheetOpen} onOpenChange={setActivitySheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary dark:text-cyan-400" />
              Activity Log
            </SheetTitle>
            <SheetDescription>Recent changes and events on this project</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <ProjectActivityTab projectId={projectId} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Settings Sheet */}
      <Sheet open={settingsSheetOpen} onOpenChange={setSettingsSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-card dark:bg-[#0f1320] border-l border-border">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-primary dark:text-cyan-400" />
              Project Settings
            </SheetTitle>
            <SheetDescription>Manage project details, media, and team members</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-8">
            <div>
              <h3 className="text-base font-medium mb-3 dark:text-gray-200">Project Details</h3>
              <ProjectForm projectId={projectId} className="max-w-lg" />
            </div>

            <div className="border-t border-border/60 pt-6">
              <ProjectThumbnailManager projectId={projectId} />
            </div>

            {user?.role === "admin" && (
              <div className="border-t border-border/60 pt-6">
                <ProjectMediaManager projectId={projectId} />
              </div>
            )}

            <div className="border-t border-border/60 pt-6">
              <h3 className="text-base font-medium mb-3 dark:text-gray-200">Team Members</h3>
              <p className="text-sm text-neutral-500 dark:text-gray-400 mb-4">
                Manage who has access to this project
              </p>
              <ProjectTeamMembers
                projectId={projectId}
                onInviteClick={() => setInviteDialogOpen(true)}
              />
              {pendingInvitations && pendingInvitations.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium mb-3 flex items-center">
                    <Mail className="h-4 w-4 mr-1.5 text-gray-500 dark:text-cyan-400" />
                    Pending Invitations
                  </h4>
                  <ProjectInvitations projectId={projectId} />
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
     </div>
    </AppLayout>
  );
}
