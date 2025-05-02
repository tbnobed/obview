import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InsertUser, insertUserSchema } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { z } from "zod";

// Extend the schema for new user creation (with password requirements)
const createUserSchema = insertUserSchema.extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm the password"),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// Edit schema is more relaxed - passwords are optional for updates
const editUserSchema = insertUserSchema.extend({
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  confirmPassword: z.string().optional(),
}).refine(data => !data.password || data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

interface UserFormProps {
  userId?: number;
  onSuccess?: () => void;
}

export default function UserForm({ userId, onSuccess }: UserFormProps) {
  const { toast } = useToast();
  const isEditMode = !!userId;
  
  console.log(`UserForm initialized with userId:`, userId, `isEditMode:`, isEditMode);
  
  // Choose schema based on whether we're editing or creating
  const formSchema = isEditMode ? editUserSchema : createUserSchema;
  type UserFormValues = z.infer<typeof formSchema>;
  
  // Form setup with default values
  const form = useForm<UserFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      username: "",
      email: "",
      password: isEditMode ? undefined : "", // Only required for new users
      confirmPassword: isEditMode ? undefined : "",
      role: "viewer",
    },
    mode: "onChange"
  });

  // Function to directly fetch user data
  const fetchUserData = async () => {
    if (!userId) return null;
    
    console.log(`UserForm: Direct fetch for user ID ${userId}`);
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'GET',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch user: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`UserForm: Direct fetch successful:`, data);
      
      // Populate form with data
      if (data && form) {
        console.log(`UserForm: Populating form with fetched data`);
        form.reset({
          name: data.name,
          username: data.username,
          email: data.email,
          role: data.role,
        });
      }
      
      return data;
    } catch (error) {
      console.error(`UserForm: Error in direct fetch:`, error);
      return null;
    }
  };
  
  // Call direct fetch on component mount when in edit mode
  useEffect(() => {
    if (isEditMode && userId) {
      console.log(`UserForm: Triggering direct fetch on mount`);
      fetchUserData();
    }
  }, [userId, isEditMode]);

  // Query to get user details if in edit mode (as backup)
  const { data: userData, isLoading: userDataLoading } = useQuery({
    queryKey: ['/api/users', userId],
    queryFn: async () => {
      if (!userId) return null;
      console.log(`UserForm: Fetching user data for ID ${userId} via TanStack Query`);
      try {
        const response = await apiRequest("GET", `/api/users/${userId}`);
        const data = await response.json();
        console.log(`UserForm: Successfully fetched user data via TanStack Query:`, data);
        return data;
      } catch (error) {
        console.error(`UserForm: Error fetching user data via TanStack Query:`, error);
        return null;
      }
    },
    enabled: isEditMode && !!userId, // Only run this query if we're in edit mode and userId exists
  });

  // Update form values when user data is loaded via query
  useEffect(() => {
    console.log("UserForm useEffect for TanStack Query data - userData:", userData);
    console.log("UserForm useEffect for TanStack Query data - isEditMode:", isEditMode);
    
    if (userData && isEditMode) {
      console.log("UserForm: Populating form with TanStack Query data:", userData);
      // Don't include password fields when populating the form
      form.reset({
        name: userData.name,
        username: userData.username,
        email: userData.email,
        role: userData.role,
      });
      console.log("UserForm: Form reset completed from TanStack Query data");
    }
  }, [userData, form, isEditMode]);

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: Omit<UserFormValues, "confirmPassword">) => {
      const { confirmPassword, ...userData } = data;
      return await apiRequest("POST", "/api/users", userData);
    },
    onSuccess: () => {
      form.reset();
      toast({
        title: "User created",
        description: "The user has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      if (onSuccess) onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async (data: Partial<UserFormValues>) => {
      const { confirmPassword, ...updateData } = data;
      // Only include password if it's provided
      if (!updateData.password) {
        delete updateData.password;
      }
      return await apiRequest("PATCH", `/api/users/${userId}`, updateData);
    },
    onSuccess: () => {
      toast({
        title: "User updated",
        description: "The user has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}`] });
      if (onSuccess) onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle form submission based on mode
  const onSubmit = (data: UserFormValues) => {
    if (isEditMode) {
      const { confirmPassword, ...updateData } = data;
      updateUserMutation.mutate(updateData);
    } else {
      const { confirmPassword, ...createData } = data;
      createUserMutation.mutate(createData);
    }
  };

  // Show loading state when fetching user data
  if (isEditMode && userDataLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="John Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="johndoe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="john@example.com" type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Sets the permission level for this user
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {isEditMode ? "New Password (leave blank to keep current)" : "Password"}
              </FormLabel>
              <FormControl>
                <Input type="password" {...field} value={field.value || ""} />
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
              <FormLabel>
                {isEditMode ? "Confirm New Password" : "Confirm Password"}
              </FormLabel>
              <FormControl>
                <Input type="password" {...field} value={field.value || ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button 
          type="submit" 
          className="w-full"
          disabled={createUserMutation.isPending || updateUserMutation.isPending}
        >
          {(createUserMutation.isPending || updateUserMutation.isPending) && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {isEditMode ? "Update User" : "Create User"}
        </Button>
      </form>
    </Form>
  );
}
