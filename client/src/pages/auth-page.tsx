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
import { Loader2 } from "lucide-react";
import Logo from "@/components/ui/logo";
import backgroundVideo from "@assets/media_tiles_1758739085369.mp4";

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
  const invitedRole = searchParams.get("role") || "viewer";

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
      email: invitedEmail,
      name: invitedName,
      role: invitedRole,
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
          queryClient.setQueryData(["/api/user"], userResponse);
          setLocation(returnTo);
        } catch (parseError) {
          console.error("Error parsing login response:", parseError);
        }
      }
    } catch (error) {
      console.error("Login fetch error:", error);
    }
    
    loginMutation.mutate(data, {
      onSuccess: () => {
        setLocation(returnTo);
      }
    });
  };

  const onRegisterSubmit = (data: RegisterFormValues) => {
    const { confirmPassword, ...registerData } = data;
    registerMutation.mutate(registerData, {
      onSuccess: () => {
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
    <div className="relative min-h-screen flex items-center justify-center">
      {/* Background Video */}
      <video
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        loop
        muted
        playsInline
      >
        <source src={backgroundVideo} type="video/mp4" />
      </video>
      
      {/* Dark overlay for better text readability */}
      <div className="absolute inset-0 bg-black/50"></div>
      
      {/* Content Container */}
      <div className="relative z-10 w-full max-w-md mx-auto px-6">
        {/* Logo */}
        <div className="flex justify-center mb-12">
          <Logo size="lg" withText={false} className="text-white scale-[4]" />
        </div>

        {/* Auth Forms */}
        {showResetForm ? (
          <Card className="backdrop-blur-sm bg-white/95 dark:bg-gray-900/95 border-white/20">
            <CardHeader>
              <CardTitle className="text-center">Reset Password</CardTitle>
              <CardDescription className="text-center">
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
            {!isRegistrationDisabled && (
              <TabsList className="grid w-full mb-6 bg-white/10 backdrop-blur-sm border-white/20">
                <TabsTrigger 
                  value="login"
                  className="data-[state=active]:bg-[#026d55] data-[state=active]:text-white text-white/80 hover:text-white"
                >
                  Login
                </TabsTrigger>
                <TabsTrigger 
                  value="register"
                  className="data-[state=active]:bg-[#026d55] data-[state=active]:text-white text-white/80 hover:text-white"
                >
                  Register
                </TabsTrigger>
              </TabsList>
            )}
            
            <TabsContent value="login">
              <Card className="backdrop-blur-sm bg-white/95 dark:bg-gray-900/95 border-white/20">
                <CardHeader>
                  <CardTitle className="text-center">Welcome Back</CardTitle>
                  <CardDescription className="text-center">
                    Sign in to your account
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
                              <Input placeholder="Enter your username" {...field} />
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
                              <Input type="password" placeholder="Enter your password" {...field} />
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
                        className="w-full bg-[#026d55] hover:bg-[#025a47] text-white"
                        disabled={loginMutation.isPending}
                      >
                        {loginMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Sign In
                      </Button>
                    </form>
                  </Form>
                </CardContent>
                {!isRegistrationDisabled && (
                  <CardFooter className="flex justify-center">
                    <div className="text-sm text-center text-neutral-600 dark:text-neutral-400">
                      Don't have an account?{" "}
                      <Button 
                        variant="link" 
                        className="p-0 text-[#026d55] hover:text-[#025a47]" 
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
                <Card className="backdrop-blur-sm bg-white/95 dark:bg-gray-900/95 border-white/20">
                  <CardHeader>
                    <CardTitle className="text-center">Create Account</CardTitle>
                    <CardDescription className="text-center">
                      Join the platform
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
                          className="w-full bg-[#026d55] hover:bg-[#025a47] text-white"
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
                  <CardFooter className="flex justify-center">
                    <div className="text-sm text-center text-neutral-600 dark:text-neutral-400">
                      Already have an account?{" "}
                      <Button 
                        variant="link" 
                        className="p-0 text-[#026d55] hover:text-[#025a47]" 
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
  );
}