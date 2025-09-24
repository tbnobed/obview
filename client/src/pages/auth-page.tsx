import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { insertUserSchema } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import Logo from "@/components/ui/logo";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = insertUserSchema.extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const resetPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;
type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<string>("login");
  const [showResetForm, setShowResetForm] = useState(false);
  const { user, loginMutation, registerMutation, resetPasswordRequestMutation } = useAuth();
  const [_, setLocation] = useLocation();
  
  // Check if registration is disabled via environment variable
  const isRegistrationDisabled = import.meta.env.VITE_DISABLE_REGISTRATION === 'true';
  
  // Extract invitation information from URL if coming from invitation page
  const searchParams = new URLSearchParams(window.location.search);
  const invitedEmail = searchParams.get("email") || "";
  const invitedName = searchParams.get("name") || "";
  const invitedRole = searchParams.get("role") || "viewer"; // Default to viewer if no role provided

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      email: invitedEmail, // Pre-fill with invited email if available
      name: invitedName, // Pre-fill with invited name if available
      role: invitedRole, // Use the role from the invitation
    },
  });

  const resetPasswordForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  // Get returnTo from URL query parameter
  const returnTo = new URLSearchParams(window.location.search).get("returnTo") || "/";
  
  // Redirect if user is already logged in
  useEffect(() => {
    if (user) {
      setLocation(returnTo);
    }
  }, [user, setLocation, returnTo]);

  const onLoginSubmit = async (data: LoginFormValues) => {
    console.log("Login form submitted with data:", data);
    
    try {
      // Try direct fetch first for debugging
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
      });
      
      console.log("Login response status:", response.status);
      const responseText = await response.text();
      console.log("Login response:", responseText);
      
      if (response.ok) {
        try {
          const userResponse = JSON.parse(responseText);
          // Manual update of query cache
          queryClient.setQueryData(["/api/user"], userResponse);
          // Navigate to home page
          setLocation(returnTo);
        } catch (parseError) {
          console.error("Error parsing login response:", parseError);
        }
      }
    } catch (error) {
      console.error("Login fetch error:", error);
    }
    
    // Also use the mutation as a backup
    loginMutation.mutate(data, {
      onSuccess: () => {
        // After login, navigate to the returnTo or home page
        setLocation(returnTo);
      }
    });
  };

  const onRegisterSubmit = (data: RegisterFormValues) => {
    // Remove confirmPassword as it's not part of the API schema
    const { confirmPassword, ...registerData } = data;
    registerMutation.mutate(registerData, {
      onSuccess: () => {
        // After registration, navigate to the returnTo or home page
        setLocation(returnTo);
      }
    });
  };

  const onResetPasswordSubmit = (data: ResetPasswordFormValues) => {
    resetPasswordRequestMutation.mutate(data);
    resetPasswordForm.reset();
    setShowResetForm(false);
  };

  if (user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-neutral-50 dark:bg-gray-900">
      {/* Left Side - Forms */}
      <div className="flex flex-col justify-center flex-1 px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="w-full max-w-sm mx-auto lg:w-96">
          <div className="mb-24 flex justify-center h-40">
            <div className="h-32 mb-6">
              <Logo size="lg" withText={false} className="scale-[5]" />
            </div>
          </div>

          {showResetForm ? (
            <Card>
              <CardHeader>
                <CardTitle>Reset Password</CardTitle>
                <CardDescription>
                  Enter your email and we'll send you a link to reset your password.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...resetPasswordForm}>
                  <form onSubmit={resetPasswordForm.handleSubmit(onResetPasswordSubmit)} className="space-y-4">
                    <FormField
                      control={resetPasswordForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="you@example.com" type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-between pt-2">
                      <Button type="button" variant="ghost" onClick={() => setShowResetForm(false)}>
                        Back to login
                      </Button>
                      <Button type="submit" disabled={resetPasswordRequestMutation.isPending}>
                        {resetPasswordRequestMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Reset Password
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="login" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className={`grid w-full mb-6 bg-neutral-100 dark:bg-gray-800 ${isRegistrationDisabled ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <TabsTrigger 
                  value="login"
                  className="data-[state=active]:bg-[#026d55] data-[state=active]:text-white hover:bg-[#025a4710] dark:data-[state=active]:bg-[#026d55] dark:data-[state=active]:text-white"
                >
                  Login
                </TabsTrigger>
                {!isRegistrationDisabled && (
                  <TabsTrigger 
                    value="register"
                    className="data-[state=active]:bg-[#026d55] data-[state=active]:text-white hover:bg-[#025a4710] dark:data-[state=active]:bg-[#026d55] dark:data-[state=active]:text-white"
                  >
                    Register
                  </TabsTrigger>
                )}
              </TabsList>
              
              <TabsContent value="login">
                <Card>
                  <CardHeader>
                    <CardTitle>Login to your account</CardTitle>
                    <CardDescription>
                      Enter your username and password to sign in
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...loginForm}>
                      <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                        <FormField
                          control={loginForm.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username or Email</FormLabel>
                              <FormControl>
                                <Input placeholder="johndoe" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={loginForm.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Password</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="••••••••" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="flex justify-end pt-2">
                          <Button 
                            type="button" 
                            variant="link" 
                            className="px-0 text-sm"
                            onClick={() => setShowResetForm(true)}
                          >
                            Forgot password?
                          </Button>
                        </div>
                        <Button 
                          type="submit" 
                          className="w-full bg-[#026d55] hover:bg-[#025a47] dark:bg-[#026d55] dark:hover:bg-[#025a47] dark:text-white text-white"
                          disabled={loginMutation.isPending}
                        >
                          {loginMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Sign in
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                  {!isRegistrationDisabled && (
                    <CardFooter className="flex flex-col space-y-4">
                      <div className="text-sm text-center text-neutral-500 dark:text-neutral-400">
                        Don't have an account?{" "}
                        <Button 
                          variant="link" 
                          className="p-0" 
                          onClick={() => setActiveTab("register")}
                        >
                          Create one now
                        </Button>
                      </div>
                    </CardFooter>
                  )}
                </Card>
              </TabsContent>
              
              {!isRegistrationDisabled && (
                <TabsContent value="register">
                  <Card>
                    <CardHeader>
                      <CardTitle>Create an account</CardTitle>
                      <CardDescription>
                        Fill in your details to register a new account
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Form {...registerForm}>
                        <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                          <FormField
                            control={registerForm.control}
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
                            control={registerForm.control}
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
                            control={registerForm.control}
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
                            control={registerForm.control}
                            name="password"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="••••••••" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="confirmPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Confirm Password</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="••••••••" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <input type="hidden" {...registerForm.register("role")} value="viewer" />
                          <Button 
                            type="submit" 
                            className="w-full bg-[#026d55] hover:bg-[#025a47] dark:bg-[#026d55] dark:hover:bg-[#025a47] dark:text-white text-white"
                            disabled={registerMutation.isPending}
                          >
                            {registerMutation.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Create Account
                          </Button>
                        </form>
                      </Form>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-4">
                      <div className="text-sm text-center text-neutral-500 dark:text-neutral-400">
                        Already have an account?{" "}
                        <Button 
                          variant="link" 
                          className="p-0" 
                          onClick={() => setActiveTab("login")}
                        >
                          Sign in instead
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          )}
        </div>
      </div>
      
      {/* Right Side - Hero Area */}
      <div className="relative flex-1 hidden w-0 lg:block">
        <div className="absolute inset-0 bg-gradient-to-r from-teal-700 to-teal-500 flex flex-col items-center justify-center text-white px-12">
          <div className="max-w-md">
            <div className="flex justify-center w-full mb-24">
              <div className="h-32 mb-6">
                <Logo size="lg" withText={false} className="text-white scale-[5]" />
              </div>
            </div>
            <h1 className="text-4xl font-bold mb-6">Streamline Your Media Review Process</h1>
            <p className="text-lg mb-8 text-white/90">
              Obviu.io is a powerful platform for teams to collaborate on media projects. 
              Upload videos, leave timestamped comments, and get approvals—all in one place.
            </p>
            <ul className="space-y-3">
              <li className="flex items-center">
                <svg className="h-6 w-6 mr-2 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Timestamped comments & feedback
              </li>
              <li className="flex items-center">
                <svg className="h-6 w-6 mr-2 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Simple approval workflow
              </li>
              <li className="flex items-center">
                <svg className="h-6 w-6 mr-2 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Team collaboration tools
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}