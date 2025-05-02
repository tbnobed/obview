import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import Logo from "@/components/ui/logo";
import { apiRequest } from "@/lib/queryClient";

// Define schema for reset password form
const resetPasswordFormSchema = z
  .object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;

export default function ResetPasswordPage() {
  const { token, userId } = useParams<{ token: string; userId: string }>();
  const [location, setLocation] = useLocation();
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  // Validate token on page load
  useEffect(() => {
    const validateToken = async () => {
      if (!token || !userId) {
        setIsValidToken(false);
        setIsValidating(false);
        return;
      }

      try {
        // The API doesn't need to actually validate here as we'll do that on submit
        // However, we could add a validation endpoint if needed
        setIsValidToken(true);
      } catch (error) {
        setIsValidToken(false);
        toast({
          title: "Invalid reset link",
          description: "The password reset link is invalid or has expired.",
          variant: "destructive",
        });
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token, userId, toast]);

  const onSubmit = async (data: ResetPasswordFormValues) => {
    if (!token || !userId) {
      toast({
        title: "Missing information",
        description: "The password reset link is invalid.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await apiRequest("POST", "/api/reset-password", {
        token,
        userId,
        password: data.password,
      });

      toast({
        title: "Password reset successful",
        description: "Your password has been reset. You can now log in with your new password.",
      });

      // Redirect to login page
      setLocation("/auth");
    } catch (error) {
      toast({
        title: "Failed to reset password",
        description: error instanceof Error ? error.message : "Invalid or expired reset link.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Left Side - Forms */}
      <div className="flex flex-col justify-center flex-1 px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="w-full max-w-sm mx-auto lg:w-96">
          <div className="mb-24 flex justify-center h-40">
            <div className="h-32 mb-6">
              <Logo size="lg" withText={false} className="scale-[5]" />
            </div>
          </div>

          {isValidating ? (
            <Card>
              <CardContent className="flex items-center justify-center p-6">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Validating reset link...</p>
              </CardContent>
            </Card>
          ) : !isValidToken ? (
            <Card>
              <CardHeader>
                <CardTitle>Invalid Reset Link</CardTitle>
                <CardDescription>
                  The password reset link is invalid or has expired.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => setLocation("/auth")}
                  className="w-full"
                >
                  Return to Login
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Reset Your Password</CardTitle>
                <CardDescription>
                  Please enter a new password for your account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="••••••"
                              type="password"
                              autoComplete="new-password"
                              {...field}
                            />
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
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="••••••"
                              type="password"
                              autoComplete="new-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Resetting Password...
                        </>
                      ) : (
                        "Reset Password"
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Right Side - Hero */}
      <div className="relative flex-1 hidden lg:block">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-violet-600">
          <div className="flex flex-col justify-center h-full p-12 text-white">
            <h1 className="text-4xl font-bold mb-6">Reset Your Obviu.io Password</h1>
            <p className="text-xl opacity-90 max-w-md">
              Create a strong password to protect your account. For best security, use a unique password that you don't use on other sites.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}