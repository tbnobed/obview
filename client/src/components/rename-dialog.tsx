import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  kind: "file" | "folder";
  id: number;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function RenameDialog({ kind, id, name, open, onOpenChange }: Props) {
  const [newName, setNewName] = useState(name);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  useEffect(() => {
    if (open) setNewName(name);
  }, [open, id, name]);

  const rename = useMutation({
    mutationFn: async () => apiRequest(
      "PATCH",
      kind === "file" ? `/api/files/${id}/rename` : `/api/folders/${id}`,
      { name: newName.trim() },
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey.some((key) =>
          typeof key === "string" &&
          (/^\/api\/(files|folders|projects)(\/|$)/.test(key) ||
            key.startsWith("share-")),
        ),
      });
      onOpenChange(false);
      toast({ title: kind === "file" ? "File renamed" : "Folder renamed" });
    },
    onError: (error: Error) => toast({
      title: `Could not rename ${kind}`,
      description: error.message,
      variant: "destructive",
    }),
  });

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (!rename.isPending) onOpenChange(value);
    }}>
      <DialogContent onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Rename {kind}</DialogTitle>
          <DialogDescription>
            {kind === "file"
              ? "Changes the visible name of this version only. Other versions and existing share links are preserved. Keep the file extension."
              : "Changes the folder name without moving its contents or changing existing share links."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (newName.trim() && !rename.isPending) rename.mutate();
        }}>
          <div className="space-y-2 mb-4">
            <Label htmlFor={`rename-${kind}-${id}`}>Name</Label>
            <Input
              id={`rename-${kind}-${id}`}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={kind === "folder" ? 50 : 255}
              autoFocus
              disabled={rename.isPending}
              data-testid="input-rename-name"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={rename.isPending}
              onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit"
              disabled={!newName.trim() || newName.trim() === name || rename.isPending}
              data-testid="button-confirm-rename">
              {rename.isPending ? "Saving…" : "Save name"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
