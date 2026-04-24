import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Copy, Trash2, Plus, Link as LinkIcon, ExternalLink, Lock, Calendar, Download, MessageSquare, Mail } from "lucide-react";
import { useShareLinks, useCreateShareLink, useRevokeShareLink, useUpdateShareLink, type ShareLinkDTO } from "@/hooks/use-share-links";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scopeType: "project" | "folder";
  scopeId: number;
  scopeName?: string;
};

function publicShareUrl(token: string) {
  return `${window.location.origin}/s/${token}`;
}

export default function ShareLinksDialog({ open, onOpenChange, scopeType, scopeId, scopeName }: Props) {
  const { toast } = useToast();
  const arg = { scopeType, scopeId };
  const { data: links = [], isLoading } = useShareLinks(arg, open);
  const createMut = useCreateShareLink(arg);
  const revokeMut = useRevokeShareLink(arg);
  const updateMut = useUpdateShareLink(arg);

  // Create form state
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState(""); // datetime-local
  const [allowDownloads, setAllowDownloads] = useState(false);
  const [allowComments, setAllowComments] = useState(true);
  const [requireEmail, setRequireEmail] = useState(false);

  const resetForm = () => {
    setName(""); setPassword(""); setExpiresAt("");
    setAllowDownloads(false); setAllowComments(true); setRequireEmail(false);
  };

  const onCreate = async () => {
    await createMut.mutateAsync({
      name: name || null,
      password: password || null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      allowDownloads, allowComments, requireEmail,
    });
    resetForm();
    toast({ title: "Share link created" });
  };

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(publicShareUrl(token));
    toast({ title: "Link copied to clipboard" });
  };

  const activeLinks = links.filter(l => !l.revokedAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share {scopeType === "project" ? "project" : "folder"}{scopeName ? ` — ${scopeName}` : ""}</DialogTitle>
          <DialogDescription>
            Create reviewer links with their own password, expiry, and permissions. One link grants access to every file in this {scopeType}.
          </DialogDescription>
        </DialogHeader>

        {/* Create new link */}
        <div className="space-y-4 rounded-md border border-neutral-200 dark:border-gray-700 bg-neutral-50 dark:bg-gray-900/80 p-4">
          <div className="text-sm font-medium flex items-center gap-2"><Plus className="h-4 w-4" /> New link</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sl-name">Label (optional)</Label>
              <Input id="sl-name" placeholder="Client review v2" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sl-password" className="flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Password (optional)</Label>
              <Input id="sl-password" type="text" placeholder="Leave blank for none" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="sl-expires" className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Expires (optional)</Label>
              <Input id="sl-expires" type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ToggleRow icon={<Download className="h-4 w-4" />} label="Allow downloads" checked={allowDownloads} onChange={setAllowDownloads} />
            <ToggleRow icon={<MessageSquare className="h-4 w-4" />} label="Allow comments" checked={allowComments} onChange={setAllowComments} />
            <ToggleRow icon={<Mail className="h-4 w-4" />} label="Require reviewer email" checked={requireEmail} onChange={setRequireEmail} />
          </div>
          <div className="flex justify-end">
            <Button onClick={onCreate} disabled={createMut.isPending} data-testid="button-create-share-link">
              {createMut.isPending ? "Creating..." : "Create link"}
            </Button>
          </div>
        </div>

        <Separator className="my-2" />

        {/* Existing links */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Active links</div>
          {isLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
          {!isLoading && activeLinks.length === 0 && (
            <div className="text-sm text-muted-foreground">No share links yet.</div>
          )}
          <ul className="space-y-2">
            {activeLinks.map(link => (
              <LinkRow
                key={link.id}
                link={link}
                onCopy={() => copy(link.token)}
                onOpen={() => window.open(publicShareUrl(link.token), "_blank")}
                onRevoke={() => revokeMut.mutate(link.id)}
                onToggle={(field, value) => updateMut.mutate({ id: link.id, [field]: value })}
                onClearPassword={() => updateMut.mutate({ id: link.id, clearPassword: true })}
                onSetPassword={(pw) => updateMut.mutate({ id: link.id, password: pw })}
                onSetExpires={(iso) => updateMut.mutate({ id: link.id, expiresAt: iso })}
              />
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-neutral-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2">
      <div className="flex items-center gap-2 text-sm">{icon}{label}</div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function LinkRow({
  link, onCopy, onOpen, onRevoke, onToggle, onClearPassword, onSetPassword, onSetExpires,
}: {
  link: ShareLinkDTO;
  onCopy: () => void;
  onOpen: () => void;
  onRevoke: () => void;
  onToggle: (field: "allowDownloads" | "allowComments" | "requireEmail", value: boolean) => void;
  onClearPassword: () => void;
  onSetPassword: (pw: string) => void;
  onSetExpires: (iso: string | null) => void;
}) {
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [expOpen, setExpOpen] = useState(false);
  const [newExp, setNewExp] = useState(link.expiresAt ? new Date(link.expiresAt).toISOString().slice(0, 16) : "");

  const expired = link.expiresAt && new Date(link.expiresAt).getTime() < Date.now();

  return (
    <li className="rounded-md border border-neutral-200 dark:border-gray-700 bg-neutral-50 dark:bg-gray-900/80 p-3 space-y-2" data-testid={`share-link-${link.id}`}>
      <div className="flex items-start gap-2">
        <LinkIcon className="h-4 w-4 mt-1 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{link.name || "Untitled link"}</div>
          <div className="text-xs text-muted-foreground truncate">/s/{link.token}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Created {format(new Date(link.createdAt), "MMM d, yyyy")}
            {link.expiresAt && (
              <span className={expired ? "text-red-600 ml-2" : "ml-2"}>
                · {expired ? "Expired" : "Expires"} {format(new Date(link.expiresAt), "MMM d, yyyy HH:mm")}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={onCopy} title="Copy link"><Copy className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" onClick={onOpen} title="Open in new tab"><ExternalLink className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" onClick={onRevoke} title="Revoke"><Trash2 className="h-3.5 w-3.5 text-red-600" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <ToggleRow icon={<Download className="h-3.5 w-3.5" />} label="Downloads" checked={link.allowDownloads} onChange={(v) => onToggle("allowDownloads", v)} />
        <ToggleRow icon={<MessageSquare className="h-3.5 w-3.5" />} label="Comments" checked={link.allowComments} onChange={(v) => onToggle("allowComments", v)} />
        <ToggleRow icon={<Mail className="h-3.5 w-3.5" />} label="Email gate" checked={link.requireEmail} onChange={(v) => onToggle("requireEmail", v)} />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Button size="sm" variant="ghost" onClick={() => setPwOpen(v => !v)}>
          <Lock className="h-3.5 w-3.5 mr-1" />
          {link.hasPassword ? "Change password" : "Set password"}
        </Button>
        {link.hasPassword && (
          <Button size="sm" variant="ghost" onClick={onClearPassword}>Clear password</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setExpOpen(v => !v)}>
          <Calendar className="h-3.5 w-3.5 mr-1" />
          {link.expiresAt ? "Change expiry" : "Set expiry"}
        </Button>
        {link.expiresAt && (
          <Button size="sm" variant="ghost" onClick={() => onSetExpires(null)}>Remove expiry</Button>
        )}
      </div>

      {pwOpen && (
        <div className="flex gap-2">
          <Input type="text" placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} />
          <Button size="sm" onClick={() => { if (newPw) { onSetPassword(newPw); setNewPw(""); setPwOpen(false); } }}>Save</Button>
        </div>
      )}
      {expOpen && (
        <div className="flex gap-2">
          <Input type="datetime-local" value={newExp} onChange={e => setNewExp(e.target.value)} />
          <Button size="sm" onClick={() => { onSetExpires(newExp ? new Date(newExp).toISOString() : null); setExpOpen(false); }}>Save</Button>
        </div>
      )}
    </li>
  );
}
