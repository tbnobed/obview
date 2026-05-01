import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, Info, AlertCircle, Check, X, FileText, Users, Settings, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ActivityLogList() {
  const { data: activities, isLoading, error } = useQuery<any[]>({
    queryKey: ['/api/activities'],
    staleTime: 1000 * 60 * 1, // 1 minute
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const totalItems = activities?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => { setPage(1); }, [pageSize]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const paginatedActivities = useMemo(() => {
    if (!activities) return [];
    const start = (page - 1) * pageSize;
    return activities.slice(start, start + pageSize);
  }, [activities, page, pageSize]);

  const startIdx = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(totalItems, page * pageSize);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-800 p-4 rounded-md">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
          <span>Error loading activity logs</span>
        </div>
      </div>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-6">
        <Info className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-medium">No activity logs found</h3>
        <p className="text-sm text-muted-foreground mt-1">
          System activity will be recorded and displayed here
        </p>
      </div>
    );
  }

  // Helper to get icon for activity type
  const getActivityIcon = (action: string, entityType: string) => {
    if (action.includes('invite')) return <Users className="h-4 w-4" />;
    if (action.includes('comment')) return <FileText className="h-4 w-4" />;
    if (action.includes('approve')) return <Check className="h-4 w-4" />;
    if (action.includes('reject') || action.includes('change')) return <X className="h-4 w-4" />;
    if (action.includes('settings')) return <Settings className="h-4 w-4" />;

    switch (entityType) {
      case 'user':
        return <Users className="h-4 w-4" />;
      case 'file':
        return <FileText className="h-4 w-4" />;
      case 'project':
        return <ExternalLink className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  // Build a friendly summary line. The server normalizes action names to
  // short verbs (`upload`, `create`, `delete`, ...), so we key off
  // (action, entityType) and surface the resolved entityName / projectName
  // / targetUserName so admins can see exactly what was touched.
  const getActivityText = (activity: any) => {
    const actor = activity.user?.name || activity.user?.username || 'A user';
    const meta = activity.metadata || {};
    const entityName: string | null = activity.entityName ?? null;
    const projectName: string | null = activity.projectName ?? null;
    const targetUser: string | null = activity.targetUserName ?? null;

    const fileLabel = entityName ? `file "${entityName}"` : 'a file';
    const projectLabel = entityName ? `project "${entityName}"` : 'a project';
    const folderLabel = entityName ? `folder "${entityName}"` : 'a folder';
    const inProject = projectName ? ` in "${projectName}"` : '';

    const key = `${activity.action}:${activity.entityType}`;
    switch (key) {
      // Files
      case 'upload:file':
        return `${actor} uploaded ${fileLabel}${meta.version && meta.version > 1 ? ` (v${meta.version})` : ''}${inProject}`;
      case 'delete:file':
        return `${actor} deleted ${fileLabel}${inProject}`;
      case 'approve:file':
        return `${actor} approved ${fileLabel}${inProject}`;
      case 'request_changes:file':
        return `${actor} requested changes on ${fileLabel}${inProject}`;
      case 'comment:file':
        return `${actor} ${meta.isReply ? 'replied to a comment' : 'commented'} on ${fileLabel}${inProject}`;

      // Comments (entityId points at fileId for these)
      case 'resolve_comment:comment':
        return `${actor} resolved a comment on ${fileLabel}${inProject}`;
      case 'unresolve_comment:comment':
        return `${actor} reopened a comment on ${fileLabel}${inProject}`;
      case 'delete_comment:comment':
        return `${actor} deleted a comment on ${fileLabel}${inProject}`;

      // Projects
      case 'create:project':
        return `${actor} created ${projectLabel}`;
      case 'update:project':
        return `${actor} updated ${projectLabel}`;
      case 'soft_delete:project':
        return `${actor} moved ${projectLabel} to trash${meta.fileCount != null ? ` (${meta.fileCount} files)` : ''}`;
      case 'restore:project':
        return `${actor} restored ${projectLabel} from trash`;
      case 'purge:project':
        return `${actor} permanently deleted ${projectLabel}${meta.fileCount != null ? ` (${meta.fileCount} files)` : ''}`;
      case 'add_user:project':
        return `${actor} added ${targetUser ?? 'a user'}${meta.role ? ` as ${meta.role}` : ''} to ${projectLabel}`;
      case 'remove_user:project':
        return `${actor} removed ${targetUser ?? 'a user'} from ${projectLabel}`;
      case 'update_role:project_user':
        return `${actor} changed ${targetUser ?? "a user"}'s role to ${meta.role ?? 'a new role'}${projectName ? ` in "${projectName}"` : ''}`;

      // Folders (top-level libraries)
      case 'create:folder':
        return `${actor} created ${folderLabel}`;
      case 'update:folder':
        return `${actor} renamed ${folderLabel}`;
      case 'delete:folder':
        return `${actor} deleted ${folderLabel}`;

      // Users / invitations
      case 'create:user':
        return `${actor} created user ${entityName ? `"${entityName}"` : ''}`.trim();
      default:
        // Legacy / unmapped — keep the action name visible so it's obvious
        // when something new needs a friendly mapping.
        if (activity.action === 'invited_user_to_system')
          return `${actor} invited ${meta.inviteeEmail ?? 'a new user'} to join the system`;
        if (activity.action === 'invited_user')
          return `${actor} invited ${meta.inviteeEmail ?? 'a user'} to a project`;
        if (activity.action === 'resent_invitation_email')
          return `${actor} resent an invitation email${meta.inviteeEmail ? ` to ${meta.inviteeEmail}` : ''}`;
        if (activity.action === 'cancelled_invitation' || activity.action === 'cancelled_system_invitation')
          return `${actor} cancelled an invitation${meta.inviteeEmail ? ` to ${meta.inviteeEmail}` : ''}`;
        if (activity.action === 'accepted_system_role' || activity.action === 'accept_invitation')
          return `${actor} accepted an invitation`;
        if (activity.action === 'joined_project')
          return `${actor} joined ${projectLabel}`;
        return `${actor} performed "${activity.action}" on ${activity.entityType}${entityName ? ` "${entityName}"` : ''}`;
    }
  };

  // Render the small secondary line under the main message.
  const getActivityDetails = (activity: any) => {
    const meta = activity.metadata || {};
    const bits: string[] = [];

    if (meta.inviteeEmail) bits.push(`Email: ${meta.inviteeEmail}`);
    if (meta.role && activity.action !== 'add_user' && activity.action !== 'update_role') {
      bits.push(`Role: ${meta.role}`);
    }
    if (
      activity.entityType === 'file' &&
      activity.projectName &&
      // already shown inline in the main line — skip duplicates
      !['upload', 'delete', 'comment', 'approve', 'request_changes'].includes(activity.action)
    ) {
      bits.push(`Project: ${activity.projectName}`);
    }
    if (typeof meta.fileCount === 'number' && activity.action !== 'soft_delete' && activity.action !== 'purge') {
      bits.push(`${meta.fileCount} files`);
    }
    if (Array.isArray(meta.filesystemErrors) && meta.filesystemErrors.length > 0) {
      bits.push(`${meta.filesystemErrors.length} filesystem error(s)`);
    }
    return bits.join(' · ');
  };

  return (
    <div>
      <h3 className="text-sm font-medium mb-4">Recent Activity</h3>
      <Table>
        <TableCaption>Recent system activity logs</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">User</TableHead>
            <TableHead>Action</TableHead>
            <TableHead className="w-24">Entity</TableHead>
            <TableHead className="w-36 text-right">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedActivities.map((activity: any) => (
            <TableRow key={activity.id}>
              <TableCell>
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {activity.user?.name ? activity.user.name.substring(0, 2).toUpperCase() : 'U'}
                  </AvatarFallback>
                </Avatar>
              </TableCell>
              <TableCell>
                <div className="font-medium">{getActivityText(activity)}</div>
                {(() => {
                  const detail = getActivityDetails(activity);
                  return detail ? (
                    <div className="text-xs text-muted-foreground mt-1">{detail}</div>
                  ) : null;
                })()}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="flex items-center gap-1">
                  {getActivityIcon(activity.action, activity.entityType)}
                  <span className="text-xs capitalize">{activity.entityType}</span>
                </Badge>
              </TableCell>
              <TableCell className="text-right text-muted-foreground text-xs">
                {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 text-sm">
        <div className="text-neutral-600 dark:text-gray-400">
          {totalItems === 0
            ? "No results"
            : `Showing ${startIdx}–${endIdx} of ${totalItems}`}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-neutral-600 dark:text-gray-400">Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-neutral-600 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ActivityLogList;