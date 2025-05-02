import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import AppLayout from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

export default function SettingsPage() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("account");

  // Create separate schema for each tab
  const accountFormSchema = z.object({
    name: z.string().min(2, {
      message: "Name must be at least 2 characters.",
    }),
    username: z.string().min(3, {
      message: "Username must be at least 3 characters.",
    }),
    email: z.string().email({
      message: "Please enter a valid email address.",
    }),
  });
  
  const passwordFormSchema = z.object({
    currentPassword: z.string().min(6, {
      message: "Current password must be at least 6 characters.",
    }),
    newPassword: z.string().min(6, {
      message: "New password must be at least 6 characters.",
    }),
    confirmPassword: z.string().min(6, {
      message: "Confirm password must be at least 6 characters.",
    }),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
  
  // Combined schema with all fields
  const formSchema = z.object({
    name: z.string().min(2, {
      message: "Name must be at least 2 characters.",
    }),
    username: z.string().min(3, {
      message: "Username must be at least 3 characters.",
    }),
    email: z.string().email({
      message: "Please enter a valid email address.",
    }),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: user?.name || "",
      username: user?.username || "",
      email: user?.email || "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const [isUpdating, setIsUpdating] = useState(false);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) return;
    
    setIsUpdating(true);
    try {
      // Separate account update from password update based on active tab
      if (activeTab === "account") {
        // Send name, username and email for account update
        const response = await fetch(`/api/users/${user.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: values.name,
            username: values.username,
            email: values.email,
          }),
          credentials: 'include',
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to update profile');
        }
        
        // Update the user data in auth context
        const updatedUser = await response.json();
        // This will trigger a refetch of user data
        queryClient.setQueryData(["/api/user"], updatedUser);
        
        toast({
          title: "Profile updated",
          description: "Your account information has been updated successfully.",
        });
      } else if (activeTab === "password") {
        // Password update logic
        if (!values.newPassword || !values.confirmPassword) {
          toast({
            title: "Missing fields",
            description: "Please provide both new password and confirmation",
            variant: "destructive",
          });
          return;
        }
        
        if (values.newPassword !== values.confirmPassword) {
          toast({
            title: "Passwords don't match",
            description: "New password and confirmation must match",
            variant: "destructive",
          });
          return;
        }
        
        try {
          const response = await fetch(`/api/users/${user.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              password: values.newPassword,
            }),
            credentials: 'include',
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to update password');
          }
          
          toast({
            title: "Password updated",
            description: "Your password has been updated successfully",
          });
          
          // Reset password fields
          form.reset({
            ...form.getValues(),
            currentPassword: "",
            newPassword: "",
            confirmPassword: "",
          });
        } catch (error: any) {
          toast({
            title: "Failed to update password",
            description: error.message || "There was an error updating your password",
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "There was an error updating your profile.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container py-10 flex flex-col items-center">
        <div className="mb-8 text-center w-full max-w-3xl">
          <h1 className="text-3xl font-bold text-primary-600 dark:text-teal-300">Settings</h1>
          <p className="text-muted-foreground dark:text-gray-300">Manage your account settings and preferences</p>
        </div>

        <Tabs defaultValue="account" value={activeTab} onValueChange={setActiveTab} className="w-full max-w-3xl">
          <TabsList className="grid w-full grid-cols-2 mb-8 dark:bg-gray-800/50">
            <TabsTrigger value="account" className="dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">Account</TabsTrigger>
            <TabsTrigger value="password" className="dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">Password</TabsTrigger>
          </TabsList>
          
          <TabsContent value="account">
            <Card>
              <CardHeader className="border-b dark:border-gray-800">
                <CardTitle className="text-primary-600 dark:text-primary-400">Account Information</CardTitle>
                <CardDescription className="dark:text-gray-400">Update your account information and email address</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="dark:text-white">Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Your name" className="dark:bg-gray-800 dark:border-gray-700 dark:text-white" {...field} />
                          </FormControl>
                          <FormDescription className="dark:text-gray-400">
                            This is the name that will be displayed on your profile
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="dark:text-white">Username</FormLabel>
                          <FormControl>
                            <Input placeholder="username" className="dark:bg-gray-800 dark:border-gray-700 dark:text-white" {...field} />
                          </FormControl>
                          <FormDescription className="dark:text-gray-400">
                            Your unique username for logging in
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="dark:text-white">Email</FormLabel>
                          <FormControl>
                            <Input placeholder="email@example.com" className="dark:bg-gray-800 dark:border-gray-700 dark:text-white" {...field} />
                          </FormControl>
                          <FormDescription className="dark:text-gray-400">
                            This email will be used for notifications and recovery
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={isUpdating}>
                      {isUpdating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        "Update account"
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="password">
            <Card>
              <CardHeader className="border-b dark:border-gray-800">
                <CardTitle className="text-primary-600 dark:text-primary-400">Change Password</CardTitle>
                <CardDescription className="dark:text-gray-400">Update your password for better security</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="dark:text-white">Current Password</FormLabel>
                          <FormControl>
                            <Input placeholder="••••••••" type="password" className="dark:bg-gray-800 dark:border-gray-700 dark:text-white" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="dark:text-white">New Password</FormLabel>
                          <FormControl>
                            <Input placeholder="••••••••" type="password" className="dark:bg-gray-800 dark:border-gray-700 dark:text-white" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="dark:text-white">Confirm New Password</FormLabel>
                          <FormControl>
                            <Input placeholder="••••••••" type="password" className="dark:bg-gray-800 dark:border-gray-700 dark:text-white" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={isUpdating}>
                      {isUpdating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        "Change password"
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}