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
  expiresAt: string | null;
  allowDownloads: boolean;
  allowComments: boolean;
  requireEmail: boolean;
  revokedAt: string | null;
  createdById: number;
  createdAt: string;
};

type ScopeArg = { scopeType: "project" | "folder"; scopeId: number };

const listKey = ({ scopeType, scopeId }: ScopeArg) =>
  scopeType === "project"
    ? ["/api/projects", scopeId, "share-links"]
    : ["/api/folders", scopeId, "share-links"];

const listUrl = ({ scopeType, scopeId }: ScopeArg) =>
  scopeType === "project"
    ? `/api/projects/${scopeId}/share-links`
    : `/api/folders/${scopeId}/share-links`;

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
  requireEmail?: boolean;
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
