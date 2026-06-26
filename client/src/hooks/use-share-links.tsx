import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type ShareLinkDTO = {
  id: string;
  token: string;
  scopeType: "project" | "folder" | "file";
  scopeId: number;
  name: string | null;
  hasPassword: boolean;
  hasCustomThumbnail: boolean;
  expiresAt: string | null;
  allowDownloads: boolean;
  allowComments: boolean;
  allowUploads: boolean;
  requireEmail: boolean;
  watermarkEnabled: boolean;
  watermarkText: string | null;
  revokedAt: string | null;
  createdById: number;
  createdAt: string;
};

type ScopeArg = { scopeType: "project" | "folder" | "file"; scopeId: number };

const listKey = ({ scopeType, scopeId }: ScopeArg) =>
  scopeType === "project"
    ? ["/api/projects", scopeId, "share-links"]
    : scopeType === "folder"
      ? ["/api/folders", scopeId, "share-links"]
      : ["/api/files", scopeId, "share-links"];

const listUrl = ({ scopeType, scopeId }: ScopeArg) =>
  scopeType === "project"
    ? `/api/projects/${scopeId}/share-links`
    : scopeType === "folder"
      ? `/api/folders/${scopeId}/share-links`
      : `/api/files/${scopeId}/share-links`;

export function useShareLinks(arg: ScopeArg, enabled = true) {
  return useQuery<ShareLinkDTO[]>({
    queryKey: listKey(arg),
    queryFn: async () => {
      const r = await fetch(listUrl(arg), { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load share links");
      return r.json();
    },
    enabled,
  });
}

export type CreateShareLinkInput = {
  name?: string | null;
  password?: string | null;
  expiresAt?: string | null;
  allowDownloads?: boolean;
  allowComments?: boolean;
  allowUploads?: boolean;
  requireEmail?: boolean;
  watermarkEnabled?: boolean;
  watermarkText?: string | null;
};

export function useCreateShareLink(arg: ScopeArg) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: CreateShareLinkInput) => {
      return (await apiRequest("POST", listUrl(arg), input)) as ShareLinkDTO;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey(arg) });
    },
    onError: (e: Error) =>
      toast({ title: "Could not create link", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateShareLink(arg: ScopeArg) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<CreateShareLinkInput> & { clearPassword?: boolean }) => {
      return (await apiRequest("PATCH", `/api/share-links/${id}`, input)) as ShareLinkDTO;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey(arg) }),
    onError: (e: Error) =>
      toast({ title: "Could not update link", description: e.message, variant: "destructive" }),
  });
}

export function useSetShareLinkThumbnail(arg: ScopeArg) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append("thumbnail", file);
      const r = await fetch(`/api/share-links/${id}/thumbnail`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!r.ok) {
        const msg = await r.json().catch(() => ({}));
        throw new Error(msg.message || "Failed to upload image");
      }
      return (await r.json()) as ShareLinkDTO;
    },
    onSuccess: () => {
      toast({ title: "Preview image updated" });
      queryClient.invalidateQueries({ queryKey: listKey(arg) });
    },
    onError: (e: Error) =>
      toast({ title: "Could not upload image", description: e.message, variant: "destructive" }),
  });
}

export function useClearShareLinkThumbnail(arg: ScopeArg) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/share-links/${id}/thumbnail`);
    },
    onSuccess: () => {
      toast({ title: "Preview image removed" });
      queryClient.invalidateQueries({ queryKey: listKey(arg) });
    },
    onError: (e: Error) =>
      toast({ title: "Could not remove image", description: e.message, variant: "destructive" }),
  });
}

export function useRevokeShareLink(arg: ScopeArg) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/share-links/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Link revoked" });
      queryClient.invalidateQueries({ queryKey: listKey(arg) });
    },
    onError: (e: Error) =>
      toast({ title: "Could not revoke link", description: e.message, variant: "destructive" }),
  });
}
