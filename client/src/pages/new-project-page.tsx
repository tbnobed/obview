import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProjectForm from "@/components/projects/project-form";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NewProjectPage() {
  const [location, navigate] = useLocation();

  const folderId = useMemo(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(search);
    const raw = params.get("folderId");
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  }, [location]);

  const backHref = folderId ? `/folders/${folderId}` : "/projects";
  const backLabel = folderId ? "Back to Folder" : "Back to Projects";

  useEffect(() => {
    document.title = "Create New Project | Obviu.io";
  }, []);

  return (
    <AppLayout>
      <div className="p-6 max-w-none mx-auto w-full">
        <div className="mb-6">
          <Button
            variant="ghost"
            className="gap-1 mb-4"
            onClick={() => navigate(backHref)}
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Button>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Create New Project</h1>
          <p className="text-neutral-500 mt-1">
            Set up a new project to start reviewing media files
          </p>
        </div>

        <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
          </CardHeader>
          <CardContent className="px-8 py-6">
            <ProjectForm
              className="max-w-none w-full"
              defaultFolderId={folderId}
              onSuccess={(projectId) => {
                navigate(`/projects/${projectId}`);
              }}
              onCancel={() => navigate(backHref)}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
