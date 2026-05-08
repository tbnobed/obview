import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Copy, Trash2, Plus, Link as LinkIcon, ExternalLink,
  Lock, Calendar, Download, MessageSquare, Mail, Shield,
  ChevronDown, ChevronUp, X, Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useShareLinks, useCreateShareLink, useRevokeShareLink, useUpdateShareLink, type ShareLinkDTO } from "@/hooks/use-share-links";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scopeType: "project" | "folder" | "file";
  scopeId: number;
  scopeName?: string;
};

function publicShareUrl(token: string) {
  const configured = (import.meta.env.VITE_SHORT_LINK_BASE_URL as string | undefined)?.trim().replace(/\/+$/, "");
  const base = configured && configured.length > 0 ? configured : window.location.origin;
  return `${base}/${token}`;
}

export default function ShareLinksDialog({ open, onOpenChange, scopeType, scopeId, scopeName }: Props) {
  const { toast } = useToast();
  const arg = { scopeType, scopeId };
  const { data: links = [], isLoading } = useShareLinks(arg, open);
  const createMut = useCreateShareLink(arg);
  const revokeMut = useRevokeShareLink(arg);
  const updateMut = useUpdateShareLink(arg);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [allowDownloads, setAllowDownloads] = useState(false);
  const [allowComments, setAllowComments] = useState(true);
  const [allowUploads, setAllowUploads] = useState(false);
  const [requireEmail, setRequireEmail] = useState(false);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkText, setWatermarkText] = useState("");

  const resetForm = () => {
    setName(""); setPassword(""); setExpiresAt("");
    setAllowDownloads(false); setAllowComments(true); setAllowUploads(false); setRequireEmail(false);
    setWatermarkEnabled(false); setWatermarkText("");
  };

  const onCreate = async () => {
    await createMut.mutateAsync({
      name: name || null,
      password: password || null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      allowDownloads, allowComments, allowUploads, requireEmail,
      watermarkEnabled,
      watermarkText: watermarkText.trim() ? watermarkText.trim() : null,
    });
    resetForm();
    setCreateOpen(false);
    toast({ title: "Share link created" });
  };

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(publicShareUrl(token));
    toast({ title: "Link copied to clipboard" });
  };

  const activeLinks = links.filter(l => !l.revokedAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share {scopeType}{scopeName ? ` — ${scopeName}` : ""}</DialogTitle>
          <DialogDescription>
            {scopeType === "file"
              ? "Each link grants reviewer access to this file with its own password, expiry, and permissions."
              : `One link grants reviewer access to every file in this ${scopeType}. Each link has its own password, expiry, and permissions.`}
          </DialogDescription>
        </DialogHeader>

        {/* Active links list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-muted-foreground">
              {activeLinks.length === 0 ? "No share links yet" : `${activeLinks.length} active link${activeLinks.length === 1 ? "" : "s"}`}
            </div>
            {!createOpen && (
              <Button
                size="sm"
                onClick={() => setCreateOpen(true)}
                data-testid="button-new-share-link"
              >
                <Plus className="h-4 w-4 mr-1.5" /> New link
              </Button>
            )}
          </div>

          {isLoading && <div className="text-sm text-muted-foreground py-2">Loading…</div>}

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

        {/* Create new link — collapsible so the dialog isn't dominated by the form */}
        {createOpen && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium flex items-center gap-2">
                  <Plus className="h-4 w-4" /> New share link
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setCreateOpen(false); resetForm(); }} className="h-7 px-2 text-muted-foreground">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Stacked optional fields — easier to scan than a 2-col grid */}
              <div className="space-y-3">
                <FieldRow id="sl-name" label="Label" hint="Shown only to you, e.g. 'Client v2 review'">
                  <Input id="sl-name" placeholder="Optional" value={name} onChange={e => setName(e.target.value)} />
                </FieldRow>
                <FieldRow id="sl-password" label="Password" hint="Reviewers must enter this to view" icon={<Lock className="h-3.5 w-3.5" />}>
                  <Input id="sl-password" type="text" placeholder="Optional" value={password} onChange={e => setPassword(e.target.value)} />
                </FieldRow>
                <FieldRow id="sl-expires" label="Expires" hint="Link stops working after this time" icon={<Calendar className="h-3.5 w-3.5" />}>
                  <Input id="sl-expires" type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
                </FieldRow>
              </div>

              {/* Permissions — vertical list, full-width labels, no wrapping */}
              <div className="rounded-md border border-neutral-200 dark:border-gray-700 divide-y divide-neutral-200 dark:divide-gray-700 overflow-hidden">
                <SwitchRow
                  icon={<Download className="h-4 w-4" />}
                  label="Allow downloads"
                  hint="Reviewers can download the original files"
                  checked={allowDownloads}
                  onChange={setAllowDownloads}
                />
                <SwitchRow
                  icon={<MessageSquare className="h-4 w-4" />}
                  label="Allow comments"
                  hint="Reviewers can leave timestamped comments"
                  checked={allowComments}
                  onChange={setAllowComments}
                />
                {scopeType === "project" && (
                  <SwitchRow
                    icon={<Upload className="h-4 w-4" />}
                    label="Allow uploads"
                    hint="Reviewers can upload files into this project"
                    checked={allowUploads}
                    onChange={setAllowUploads}
                  />
                )}
                <SwitchRow
                  icon={<Mail className="h-4 w-4" />}
                  label="Require reviewer email"
                  hint="Reviewer must enter name + email before viewing"
                  checked={requireEmail}
                  onChange={setRequireEmail}
                />
                <div className={watermarkEnabled ? "bg-neutral-50 dark:bg-gray-900/50" : undefined}>
                  <SwitchRow
                    icon={<Shield className="h-4 w-4" />}
                    label="Watermark playback"
                    hint="Overlays reviewer email + timestamp to deter screen recording"
                    checked={watermarkEnabled}
                    onChange={setWatermarkEnabled}
                  />
                  {watermarkEnabled && (
                    <div className="px-3 pb-3">
                      <Input
                        id="sl-wmtext"
                        placeholder="Custom watermark text (defaults to email + timestamp)"
                        value={watermarkText}
                        onChange={e => setWatermarkText(e.target.value)}
                        maxLength={120}
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
                <Button onClick={onCreate} disabled={createMut.isPending} data-testid="button-create-share-link">
                  {createMut.isPending ? "Creating…" : "Create link"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({
  id, label, hint, icon, children,
}: { id: string; label: string; hint?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3">
      <Label htmlFor={id} className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </Label>
      <div className="space-y-1">
        {children}
        {hint && <div className="text-[11px] text-muted-foreground/70">{hint}</div>}
      </div>
    </div>
  );
}

function SwitchRow({
  icon, label, hint, checked, onChange,
}: { icon: React.ReactNode; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground truncate">{hint}</div>}
      </div>
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
  onToggle: (field: "allowDownloads" | "allowComments" | "allowUploads" | "requireEmail", value: boolean) => void;
  onClearPassword: () => void;
  onSetPassword: (pw: string) => void;
  onSetExpires: (iso: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [expInput, setExpInput] = useState(link.expiresAt ? new Date(link.expiresAt).toISOString().slice(0, 16) : "");

  const expired = !!link.expiresAt && new Date(link.expiresAt).getTime() < Date.now();

  return (
    <li
      className="rounded-md border border-neutral-200 dark:border-gray-700 bg-neutral-50 dark:bg-gray-900/80 overflow-hidden"
      data-testid={`share-link-${link.id}`}
    >
      {/* Header row — name, url, primary actions */}
      <div className="flex items-center gap-3 p-3">
        <LinkIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium truncate">{link.name || "Untitled link"}</div>
            {expired && <span className="text-[10px] font-semibold uppercase text-red-600 px-1.5 py-0.5 rounded bg-red-500/10">Expired</span>}
            {link.hasPassword && <Lock className="h-3 w-3 text-muted-foreground" />}
          </div>
          <div className="text-xs text-muted-foreground truncate font-mono">/{link.token}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={onCopy} title="Copy link" className="h-8 w-8">
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onOpen} title="Open in new tab" className="h-8 w-8">
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setExpanded(v => !v)}
            title={expanded ? "Hide settings" : "Edit settings"}
            className="h-8 w-8"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={onRevoke} title="Revoke" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-500/10">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Compact info strip — visible always */}
      <div className="px-3 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>Created {formatDistanceToNow(new Date(link.createdAt), { addSuffix: true })}</span>
        {link.expiresAt && (
          <span className={cn("flex items-center gap-1", expired && "text-red-600")}>
            <Calendar className="h-3 w-3" />
            {expired ? "Expired " : "Expires "}{format(new Date(link.expiresAt), "MMM d, yyyy HH:mm")}
          </span>
        )}
        <span className="flex items-center gap-2">
          <PermPill on={link.allowDownloads} icon={<Download className="h-3 w-3" />} label="Downloads" />
          <PermPill on={link.allowComments} icon={<MessageSquare className="h-3 w-3" />} label="Comments" />
          {link.scopeType === "project" && (
            <PermPill on={link.allowUploads} icon={<Upload className="h-3 w-3" />} label="Uploads" />
          )}
          <PermPill on={link.requireEmail} icon={<Mail className="h-3 w-3" />} label="Email gate" />
        </span>
      </div>

      {/* Expanded settings */}
      {expanded && (
        <div className="border-t border-neutral-200 dark:border-gray-700 bg-white dark:bg-gray-950/40">
          <div className="divide-y divide-neutral-200 dark:divide-gray-700">
            <SwitchRow
              icon={<Download className="h-4 w-4" />}
              label="Allow downloads"
              checked={link.allowDownloads}
              onChange={(v) => onToggle("allowDownloads", v)}
            />
            <SwitchRow
              icon={<MessageSquare className="h-4 w-4" />}
              label="Allow comments"
              checked={link.allowComments}
              onChange={(v) => onToggle("allowComments", v)}
            />
            {link.scopeType === "project" && (
              <SwitchRow
                icon={<Upload className="h-4 w-4" />}
                label="Allow uploads"
                checked={link.allowUploads}
                onChange={(v) => onToggle("allowUploads", v)}
              />
            )}
            <SwitchRow
              icon={<Mail className="h-4 w-4" />}
              label="Require reviewer email"
              checked={link.requireEmail}
              onChange={(v) => onToggle("requireEmail", v)}
            />
          </div>

          <div className="p-3 space-y-3">
            {/* Password row */}
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                type="text"
                placeholder={link.hasPassword ? "Enter new password to change" : "Set a password"}
                value={pwInput}
                onChange={e => setPwInput(e.target.value)}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                disabled={!pwInput}
                onClick={() => { onSetPassword(pwInput); setPwInput(""); }}
              >
                {link.hasPassword ? "Change" : "Set"}
              </Button>
              {link.hasPassword && (
                <Button size="sm" variant="ghost" onClick={onClearPassword} className="text-muted-foreground">
                  Clear
                </Button>
              )}
            </div>

            {/* Expiry row */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                type="datetime-local"
                value={expInput}
                onChange={e => setExpInput(e.target.value)}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                disabled={!expInput}
                onClick={() => onSetExpires(expInput ? new Date(expInput).toISOString() : null)}
              >
                {link.expiresAt ? "Update" : "Set"}
              </Button>
              {link.expiresAt && (
                <Button size="sm" variant="ghost" onClick={() => { onSetExpires(null); setExpInput(""); }} className="text-muted-foreground">
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function PermPill({ on, icon, label }: { on: boolean; icon: React.ReactNode; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium",
        on
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          : "bg-neutral-200/60 dark:bg-gray-700/60 text-muted-foreground line-through opacity-70",
      )}
    >
      {icon}{label}
    </span>
  );
}
