import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import AppLayout from "@/components/layout/app-layout";
import { useProjects } from "@/hooks/use-projects";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Plus,
  FileVideo,
  FolderKanban,
  CheckCircle2,
  Clock4,
  Eye,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import ProjectCard from "@/components/projects/project-card";
import FoldersManagement from "@/components/folders/folders-management";
import { cn } from "@/lib/utils";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent: string; // Tailwind classes for the icon tile background
  subtle?: string;
}

function StatCard({ label, value, icon, accent, subtle }: StatCardProps) {
  return (
    <Card className="border border-border/60 bg-card/60 backdrop-blur-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md">
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            accent
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {value}
          </div>
          <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          {subtle && (
            <div className="mt-0.5 text-[11px] text-muted-foreground/80">
              {subtle}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const [_, navigate] = useLocation();
  const { data: projects, isLoading } = useProjects();

  useEffect(() => {
    document.title = "Dashboard | Obviu.io";
  }, []);

  const stats = useMemo(() => {
    const list = projects ?? [];
    const total = list.length;
    const inReview = list.filter((p) => p.status === "in_review").length;
    const approved = list.filter((p) => p.status === "approved").length;
    const inProgress = list.filter((p) => p.status === "in_progress").length;
    return { total, inReview, approved, inProgress };
  }, [projects]);

  const recentProjects = useMemo(() => {
    if (!projects) return [];
    return [...projects]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, 4);
  }, [projects]);

  const firstName = user?.name?.split(" ")[0] ?? user?.username ?? "there";

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
        {/* Hero / Welcome */}
        <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-primary">
                <Sparkles className="h-3 w-3" />
                Workspace
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {getGreeting()}, {firstName}
              </h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                Pick up where you left off, review pending work, or kick off
                something new.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => navigate("/projects")}
                className="border-border/60 bg-card/60 backdrop-blur-sm"
              >
                <FolderKanban className="mr-2 h-4 w-4" />
                All projects
              </Button>
              <Button
                onClick={() => navigate("/projects/new")}
                className="shadow-sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                New project
              </Button>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            label="Total projects"
            value={isLoading ? "—" : stats.total}
            icon={<FolderKanban className="h-5 w-5 text-primary" />}
            accent="bg-primary/10"
          />
          <StatCard
            label="In review"
            value={isLoading ? "—" : stats.inReview}
            icon={<Eye className="h-5 w-5 text-blue-500" />}
            accent="bg-blue-500/10"
            subtle="Waiting on feedback"
          />
          <StatCard
            label="In progress"
            value={isLoading ? "—" : stats.inProgress}
            icon={<Clock4 className="h-5 w-5 text-amber-500" />}
            accent="bg-amber-500/10"
            subtle="Actively being edited"
          />
          <StatCard
            label="Approved"
            value={isLoading ? "—" : stats.approved}
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            accent="bg-emerald-500/10"
            subtle="Ready to ship"
          />
        </section>

        {/* Recent projects */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Recent projects
              </h2>
              <p className="text-xs text-muted-foreground">
                Your most recently updated work
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/projects")}
              className="text-primary hover:text-primary"
            >
              View all
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/40 py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : recentProjects.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {recentProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <Card className="border-2 border-dashed border-border/60 bg-card/40">
              <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <FileVideo className="h-7 w-7 text-primary" />
                </div>
                <h3 className="mb-1.5 text-base font-semibold">
                  No projects yet
                </h3>
                <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                  Create your first project to start uploading media and
                  collecting timestamped feedback from your team.
                </p>
                <Button onClick={() => navigate("/projects/new")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first project
                </Button>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Folders */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Folders</h2>
            <p className="text-xs text-muted-foreground">
              Group related projects together
            </p>
          </div>
          <FoldersManagement />
        </section>
      </div>
    </AppLayout>
  );
}
