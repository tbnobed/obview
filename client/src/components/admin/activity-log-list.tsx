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

  // Helper to format activity text
  const getActivityText = (activity: any) => {
    const actor = activity.user?.name || 'A user';
    
    switch (activity.action) {
      case 'invited_user_to_system':
        return `${actor} invited a new user to join the system`;
      case 'invited_user':
        return `${actor} invited a user to a project`;
      case 'create_project':
        return `${actor} created a new project`;
      case 'update_project':
        return `${actor} updated a project`;
      case 'upload_file':
        return `${actor} uploaded a new file`;
      case 'comment':
        return `${actor} added a comment`;
      case 'resolve_comment':
        return `${actor} resolved a comment`;
      case 'unresolve_comment':
        return `${actor} reopened a comment`;
      case 'approve_file':
        return `${actor} approved a file`;
      case 'request_changes':
        return `${actor} requested changes on a file`;
      case 'resent_invitation_email':
        return `${actor} resent an invitation email`;
      case 'user_joined':
        return `A new user joined the system`;
      case 'accept_invitation':
        return `A user accepted an invitation`;
      default:
        return `${actor} performed action "${activity.action}" on ${activity.entityType}`;
    }
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
                {activity.metadata && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {activity.metadata.inviteeEmail && (
                      <span>Email: {activity.metadata.inviteeEmail}</span>
                    )}
                    {activity.metadata.role && (
                      <span className="ml-2">Role: {activity.metadata.role}</span>
                    )}
                  </div>
                )}
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