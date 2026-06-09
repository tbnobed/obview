import { useState, useEffect, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Eye,
  EyeOff,
  ShieldCheck,
  KeyRound,
  Lock,
  CheckCircle2,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import logoImage from "@/assets/logo.png";
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

// Lightweight client-side strength hint (purely advisory).
function scorePassword(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

const STRENGTH = [
  { label: "Too short", color: "bg-neutral-300 dark:bg-neutral-700" },
  { label: "Weak", color: "bg-red-500" },
  { label: "Fair", color: "bg-amber-500" },
  { label: "Good", color: "bg-lime-500" },
  { label: "Strong", color: "bg-emerald-500" },
];

export default function ResetPasswordPage() {
  const { token, userId } = useParams<{ token: string; userId: string }>();
  const [, setLocation] = useLocation();
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { toast } = useToast();

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const passwordValue = form.watch("password");
  const strength = useMemo(() => scorePassword(passwordValue), [passwordValue]);

  // Validate token on page load
  useEffect(() => {
    const validateToken = async () => {
      if (!token || !userId) {
        setIsValidToken(false);
        setIsValidating(false);
        return;
      }

      try {
        // Call the validation endpoint
        const response = await fetch(`/api/validate-reset-token/${token}/${userId}`);
        const data = await response.json();

        if (data.valid) {
          setIsValidToken(true);
        } else {
          setIsValidToken(false);
          toast({
            title: "Invalid reset link",
            description: data.message || "The password reset link is invalid or has expired.",
            variant: "destructive",
          });
        }
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
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Left Side - Form */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          {/* Brand */}
          <div className="mb-10 flex items-center gap-3">
            <img
              src={logoImage}
              alt="Obviu.io"
              className="h-11 w-11 object-contain drop-shadow-[0_0_12px_rgba(20,184,166,0.45)]"
            />
            <span className="text-xl font-semibold tracking-tight">Obviu.io</span>
          </div>

          {isValidating ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card/60 p-10 text-center shadow-sm">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Validating your reset link…</p>
            </div>
          ) : !isValidToken ? (
            <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Link expired or invalid</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This password reset link can't be used. It may have already been used or expired.
                Request a new one from the login page.
              </p>
              <Button onClick={() => setLocation("/auth")} className="mt-6 w-full" size="lg">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Return to login
              </Button>
            </div>
          ) : (
            <div>
              <div className="mb-8">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <KeyRound className="h-6 w-6" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight">Reset your password</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Choose a new password for your account. Make it strong and unique.
                </p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="Enter a new password"
                              type={showPassword ? "text" : "password"}
                              autoComplete="new-password"
                              className="h-11 pl-10 pr-10"
                              {...field}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((v) => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                              aria-label={showPassword ? "Hide password" : "Show password"}
                              tabIndex={-1}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>

                        {/* Strength meter */}
                        {passwordValue ? (
                          <div className="mt-2">
                            <div className="flex gap-1.5">
                              {[0, 1, 2, 3].map((i) => (
                                <div
                                  key={i}
                                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                                    i < strength ? STRENGTH[strength].color : "bg-muted"
                                  }`}
                                />
                              ))}
                            </div>
                            <p className="mt-1.5 text-xs text-muted-foreground">
                              Password strength:{" "}
                              <span className="font-medium text-foreground">{STRENGTH[strength].label}</span>
                            </p>
                          </div>
                        ) : null}

                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="Re-enter your new password"
                              type={showConfirm ? "text" : "password"}
                              autoComplete="new-password"
                              className="h-11 pl-10 pr-10"
                              {...field}
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirm((v) => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                              aria-label={showConfirm ? "Hide password" : "Show password"}
                              tabIndex={-1}
                            >
                              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="h-11 w-full text-base" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resetting password…
                      </>
                    ) : (
                      "Reset password"
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => setLocation("/auth")}
                    className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to login
                  </button>
                </form>
              </Form>
            </div>
          )}
        </div>
      </div>

      {/* Right Side - Brand Hero */}
      <div className="relative hidden flex-1 overflow-hidden lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-600 via-teal-500 to-emerald-600" />
        {/* Soft decorative glows */}
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-emerald-300/20 blur-3xl" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative flex h-full flex-col justify-center p-14 xl:p-20 text-white">
          <div className="mb-8 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25">
            <ShieldCheck className="h-7 w-7" />
          </div>

          <h2 className="max-w-md text-4xl font-bold leading-tight tracking-tight">
            Secure your Obviu.io account
          </h2>
          <p className="mt-4 max-w-md text-lg text-white/85">
            Create a strong, unique password to keep your projects and reviews protected.
          </p>

          <ul className="mt-10 space-y-4 text-white/90">
            {[
              "Use at least 10 characters for the best protection",
              "Mix uppercase, numbers, and symbols",
              "Never reuse a password from another site",
            ].map((tip) => (
              <li key={tip} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-white" />
                <span className="text-[15px]">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
