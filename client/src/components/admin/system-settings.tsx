import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, CheckCircle, Server, HardDrive, FileType, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';


export function SystemSettings() {
  const { data: settings, isLoading, error } = useQuery<any>({
    queryKey: ['/api/system/settings'],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

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
          <span>Error loading system settings</span>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center py-6">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-medium">No system settings found</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Configuration information will be displayed here
        </p>
      </div>
    );
  }

  // Function to format bytes to human-readable size
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
  
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
    const i = Math.floor(Math.log(bytes) / Math.log(k));
  
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Server className="h-5 w-5 mr-2 text-muted-foreground" />
              System Information
            </CardTitle>
            <CardDescription>Server details and configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Version</span>
                <span className="text-sm font-medium">{settings.systemVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Environment</span>
                <Badge variant={settings.environment === 'production' ? 'default' : 'outline'}>
                  {settings.environment}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Started</span>
                <span className="text-sm font-medium">
                  {new Date(settings.serverStartTime).toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <HardDrive className="h-5 w-5 mr-2 text-muted-foreground" />
              Storage Settings
            </CardTitle>
            <CardDescription>File storage configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Upload Directory</span>
                <span className="text-sm font-medium truncate max-w-[200px]" title={settings.uploadDirectory}>
                  {settings.uploadDirectory}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Max Upload Size</span>
                <span className="text-sm font-medium">{formatBytes(settings.maxUploadSize)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Allowed File Types</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {settings.allowedFileTypes.map((type: string) => (
                    <Badge key={type} variant="outline" className="text-xs">
                      {type.split('/')[1].toUpperCase()}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <Mail className="h-5 w-5 mr-2 text-muted-foreground" />
            Email Configuration
          </CardTitle>
          <CardDescription>Email notification settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm">SendGrid Email Service</p>
              <p className="text-xs text-muted-foreground">Used for sending invitation emails and notifications</p>
            </div>
            <div className="flex items-center">
              {settings.emailEnabled ? (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100 flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>Enabled</span>
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-500 border-amber-200 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>Not Configured</span>
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SystemSettings;