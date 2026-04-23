import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, AlertCircle, Download, MessageSquare, FileVideo, ChevronLeft, Send } from "lucide-react";
import Logo from "@/components/ui/logo";
import { useToast } from "@/hooks/use-toast";

type ShareInfo = {
  scopeType: "project" | "folder" | "file";
  name: string | null;
  scopeName: string;
  expired: boolean;
  requiresPassword: boolean;
  requiresEmail: boolean;
  allowDownloads: boolean;
  allowComments: boolean;
  unlocked: boolean;
};

type ManifestFile = {
  id: number;
  filename: string;
  fileType: string;
  fileSize: number;
  version: number;
  createdAt: string;
  isAvailable: boolean;
};

type Manifest = {
  scopeType: "project" | "folder" | "file";
  name: string | null;
  allowDownloads: boolean;
  allowComments: boolean;
  projects: { id: number; name: string; files: ManifestFile[] }[];
};

type Comment = {
  id: string;
  content: string;
  authorName?: string | null;
  isPublic: boolean;
  timestamp: number | null;
  createdAt: string;
  parentId: string | null;
  user?: { name: string } | null;
};

function fmtBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export default function MultiSharePage() {
  const params = useParams();
  const token = params.token as string;
  const { toast } = useToast();

  const infoQ = useQuery<ShareInfo>({
    queryKey: ["share-info", token],
    queryFn: async () => {
      const r = await fetch(`/api/public/share/${token}/info`);
      if (!r.ok) throw new Error("not_found");
      return r.json();
    },
    retry: false,
  });

  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => { if (infoQ.data?.unlocked) setUnlocked(true); }, [infoQ.data?.unlocked]);

  const manifestQ = useQuery<Manifest>({
    queryKey: ["share-manifest", token],
    queryFn: async () => {
      const r = await fetch(`/api/public/share/${token}/manifest`);
      if (!r.ok) throw new Error("locked");
      return r.json();
    },
    enabled: !!infoQ.data && !infoQ.data.expired && (unlocked || (!infoQ.data.requiresPassword && !infoQ.data.requiresEmail)),
    retry: false,
  });

  const [activeFile, setActiveFile] = useState<ManifestFile | null>(null);

  if (infoQ.isLoading) {
    return <CenteredShell><p className="text-sm text-muted-foreground">Loading...</p></CenteredShell>;
  }
  if (infoQ.isError) {
    return <CenteredShell>
      <Alert variant="destructive"><AlertCircle className="h-4 w-4" />
        <AlertDescription>This share link is invalid, expired, or revoked.</AlertDescription>
      </Alert>
    </CenteredShell>;
  }
  const info = infoQ.data!;
  if (info.expired) {
    return <CenteredShell>
      <Alert variant="destructive"><AlertCircle className="h-4 w-4" />
        <AlertDescription>This share link has expired.</AlertDescription>
      </Alert>
    </CenteredShell>;
  }

  if (!unlocked && (info.requiresPassword || info.requiresEmail)) {
    return <UnlockGate token={token} info={info} onUnlocked={() => { setUnlocked(true); infoQ.refetch(); }} />;
  }

  const heading = info.name || info.scopeName || (info.scopeType === "project" ? "Shared project" : info.scopeType === "folder" ? "Shared folder" : "Shared file");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between p-4">
          <div className="flex items-center gap-3"><Logo /><div>
            <div className="text-sm text-muted-foreground capitalize">{info.scopeType} share</div>
            <h1 className="text-lg font-semibold" data-testid="share-heading">{heading}</h1>
          </div></div>
          {activeFile && (
            <Button variant="ghost" size="sm" onClick={() => setActiveFile(null)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back to files
            </Button>
          )}
        </div>
      </header>

      <main className="container mx-auto p-4">
        {!activeFile ? (
          <FileList manifest={manifestQ.data} loading={manifestQ.isLoading} onPick={setActiveFile} token={token} />
        ) : (
          <FileViewer
            token={token}
            file={activeFile}
            allowComments={info.allowComments}
            allowDownloads={info.allowDownloads}
          />
        )}
      </main>
    </div>
  );
}

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full">{children}</div>
    </div>
  );
}

function UnlockGate({ token, info, onUnlocked }: { token: string; info: ShareInfo; onUnlocked: () => void }) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/public/share/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: password || undefined, email: email || undefined }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.message || "Could not unlock");
      }
    },
    onSuccess: onUnlocked,
    onError: (e: Error) => toast({ title: "Unlock failed", description: e.message, variant: "destructive" }),
  });
  return (
    <CenteredShell>
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2"><Lock className="h-5 w-5" /><h2 className="text-lg font-semibold">Reviewer access</h2></div>
          <p className="text-sm text-muted-foreground">{info.name || info.scopeName}</p>
          {info.requiresEmail && (
            <div className="space-y-1">
              <Label htmlFor="g-email">Your email</Label>
              <Input id="g-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
          )}
          {info.requiresPassword && (
            <div className="space-y-1">
              <Label htmlFor="g-pw">Password</Label>
              <Input id="g-pw" type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          )}
          <Button className="w-full" disabled={m.isPending} onClick={() => m.mutate()} data-testid="button-unlock-share">
            {m.isPending ? "Unlocking..." : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </CenteredShell>
  );
}

function FileList({ manifest, loading, onPick, token }: { manifest?: Manifest; loading: boolean; onPick: (f: ManifestFile) => void; token: string }) {
  if (loading || !manifest) return <p className="text-sm text-muted-foreground">Loading files...</p>;
  if (manifest.projects.length === 0) return <p className="text-sm text-muted-foreground">No files in this share.</p>;
  return (
    <div className="space-y-6">
      {manifest.projects.map(p => (
        <section key={p.id} data-testid={`share-project-${p.id}`}>
          <h2 className="text-sm font-semibold mb-2">{p.name}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {p.files.map(f => (
              <button
                key={f.id}
                onClick={() => onPick(f)}
                disabled={!f.isAvailable}
                className="text-left rounded-lg border bg-card p-3 hover:border-primary transition disabled:opacity-50"
                data-testid={`share-file-${f.id}`}
              >
                <div className="aspect-video rounded bg-muted flex items-center justify-center overflow-hidden">
                  {f.fileType === "video" || f.fileType?.startsWith("video/") ? (
                    <video
                      preload="metadata"
                      muted
                      className="w-full h-full object-contain bg-black"
                      src={`/api/public/share/${token}/files/${f.id}/scrub`}
                    />
                  ) : f.fileType === "image" || f.fileType?.startsWith("image/") ? (
                    <img className="w-full h-full object-contain" src={`/api/public/share/${token}/files/${f.id}/content`} alt={f.filename} />
                  ) : (
                    <FileVideo className="h-10 w-10 text-muted-foreground" />
                  )}
                </div>
                <div className="mt-2 text-sm font-medium truncate" title={f.filename}>{f.filename}</div>
                <div className="text-xs text-muted-foreground">v{f.version} · {fmtBytes(f.fileSize)}</div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FileViewer({ token, file, allowComments, allowDownloads }: { token: string; file: ManifestFile; allowComments: boolean; allowDownloads: boolean }) {
  const isVideo = file.fileType === "video" || file.fileType?.startsWith("video/");
  const isAudio = file.fileType === "audio" || file.fileType?.startsWith("audio/");
  const isImage = file.fileType === "image" || file.fileType?.startsWith("image/");

  const commentsQ = useQuery<Comment[]>({
    queryKey: ["share-comments", token, file.id],
    queryFn: async () => {
      const r = await fetch(`/api/public/share/${token}/files/${file.id}/comments`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });

  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const { toast } = useToast();
  const post = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/public/share/${token}/files/${file.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content, displayName: name || "Anonymous" }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || "Failed");
      }
    },
    onSuccess: () => { setContent(""); commentsQ.refetch(); toast({ title: "Comment posted" }); },
    onError: (e: Error) => toast({ title: "Could not post", description: e.message, variant: "destructive" }),
  });

  const mediaSrc = isVideo
    ? `/api/public/share/${token}/files/${file.id}/scrub`
    : `/api/public/share/${token}/files/${file.id}/content`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-3">
        <div className="rounded-lg overflow-hidden bg-black">
          {isVideo && <video src={mediaSrc} controls className="w-full max-h-[70vh] mx-auto bg-black" />}
          {isAudio && <audio src={mediaSrc} controls className="w-full" />}
          {isImage && <img src={mediaSrc} alt={file.filename} className="w-full max-h-[70vh] object-contain mx-auto bg-black" />}
          {!isVideo && !isAudio && !isImage && (
            <div className="p-12 text-center text-muted-foreground">No preview available for this file type.</div>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">{file.filename}</div>
            <div className="text-xs text-muted-foreground">v{file.version} · {fmtBytes(file.fileSize)}</div>
          </div>
          {allowDownloads && (
            <a
              className="inline-flex items-center text-sm bg-primary text-primary-foreground rounded-md px-3 py-1.5 hover:opacity-90"
              href={`/api/public/share/${token}/files/${file.id}/download`}
              data-testid="button-download-shared"
            >
              <Download className="h-4 w-4 mr-1" /> Download
            </a>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Comments</h3>
        {!allowComments && (
          <Alert><AlertDescription>Comments are disabled for this share link.</AlertDescription></Alert>
        )}
        {allowComments && (
          <div className="space-y-2 rounded-md border p-2">
            <Input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
            <textarea
              className="w-full text-sm rounded-md border p-2 min-h-[80px] bg-background"
              placeholder="Leave feedback..."
              value={content}
              onChange={e => setContent(e.target.value)}
            />
            <Button size="sm" disabled={!content.trim() || post.isPending} onClick={() => post.mutate()} data-testid="button-post-share-comment">
              <Send className="h-3.5 w-3.5 mr-1" /> Post
            </Button>
          </div>
        )}
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {commentsQ.data?.map(c => (
            <div key={c.id} className="rounded-md border p-2 text-sm" data-testid={`share-comment-${c.id}`}>
              <div className="text-xs text-muted-foreground mb-1">
                {c.user?.name || c.authorName || "Anonymous"}
                {c.timestamp != null && <span> · @ {Math.floor(c.timestamp)}s</span>}
              </div>
              <div className="whitespace-pre-wrap">{c.content}</div>
            </div>
          ))}
          {commentsQ.data && commentsQ.data.length === 0 && (
            <p className="text-xs text-muted-foreground">No comments yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
