"use client";

/**
 * Story 15.1: Login Page
 *
 * Email/password login form with redirect to dashboard on success.
 * Redirects already-authenticated users to the dashboard.
 */

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Icon } from "@/base";
import { HighlightButton } from "@/components/HighlightButton";
import { LumoseLogoIcon } from "@/components/LumoseLogoIcon";
import { TextInput } from "@/components/TextInput";
import { AnimatedCard } from "@/components/ui/animated-card";
import { loginUser, getCurrentUser, verifySessionCookie } from "@/lib/api";

function getRedirectTarget(searchParams: URLSearchParams): string {
  const redirect = searchParams.get("redirect");
  return redirect &&
    (redirect === "/dashboard" || redirect.startsWith("/dashboard/"))
    ? redirect
    : "/dashboard";
}

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page">
      <div className="text-center" role="status">
        <span
          aria-hidden="true"
          className="mx-auto mb-3 block h-8 w-8 animate-spin rounded-full border-2 border-accent border-r-transparent"
        />
        <p className="font_poppins font_body_3 text-foreground-secondary">
          Loading...
        </p>
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auth check state
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expired session banner
  const expired = searchParams.get("expired") === "true";

  // Check if user is already authenticated
  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        await getCurrentUser();
        if (!cancelled) {
          router.replace(getRedirectTarget(searchParams));
        }
      } catch {
        if (!cancelled) {
          setIsCheckingAuth(false);
        }
      }
    }

    checkAuth();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await loginUser(email.trim(), password);
      // Verify the session cookie actually saved. When the deploy is
      // over plain HTTP from a non-localhost host, the browser drops the
      // Secure cookie silently and /api/auth/me returns 401 even though
      // login returned 200. We inspect the status code directly so a
      // transient 5xx or network blip doesn't get misattributed to the
      // cookie issue.
      const verifyStatus = await verifySessionCookie();
      if (verifyStatus === 401) {
        setError(
          "Login succeeded, but your browser did not store the session " +
            "cookie. This usually means GlycemicGPT is being served over " +
            "plain HTTP from a non-localhost address — browsers refuse to " +
            "store secure cookies in that case. Fix: serve GlycemicGPT " +
            "over HTTPS. As a LAN-only / local-dev workaround (not safe " +
            "for any internet-exposed deployment, since session tokens " +
            "and personal health data would travel in clear text) you " +
            "can set COOKIE_SECURE=false in your docker-compose.yml. See " +
            "https://github.com/glycemicgpt/glycemicgpt/blob/main/docs/install/docker.md#troubleshooting."
        );
        setIsSubmitting(false);
        return;
      }
      if (verifyStatus >= 400) {
        setError(
          `Could not verify your session (status ${verifyStatus}). ` +
            "Check the API logs and try again."
        );
        setIsSubmitting(false);
        return;
      }
      router.replace(getRedirectTarget(searchParams));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      setIsSubmitting(false);
    }
  };

  if (isCheckingAuth) {
    return <LoadingSpinner />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page p-4 text-foreground-primary">
      <AnimatedCard className="w-full max-w-sm">
        <div className="w-full rounded-panel border border-border-default bg-surface-primary p-8 shadow-sm">
          {/* Branding */}
          <div className="mb-8 text-center">
            <div
              aria-label="Lumose"
              className="mb-6 flex items-center justify-center gap-3 text-foreground-primary"
              role="img"
            >
              <LumoseLogoIcon
                className="aspect-[268.88/243.31] h-12 w-auto"
                decorative
              />
              <Icon
                className="h-auto w-36 text-foreground-primary"
                decorative
                icon="logo-text"
              />
            </div>
            <h1 className="font_poppins font_header_3 text-foreground-primary">
              Sign In
            </h1>
          </div>

          {/* Expired session banner */}
          {expired && (
            <div
              className="font_poppins font_body_3 mb-4 rounded-panel border border-signal-warning-text bg-surface-primary p-3 text-signal-warning-text"
              role="alert"
            >
              Your session has expired. Please sign in again.
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div
              className="font_poppins font_body_3 mb-4 rounded-panel border border-signal-error-text bg-surface-primary p-3 text-signal-error-text"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <TextInput
              autoComplete="email"
              id="email"
              inputClassName="font_poppins"
              label="Email Address"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="your@email.com"
              required
              type="email"
              value={email}
            />

            <div className="relative">
              <TextInput
                autoComplete="current-password"
                id="password"
                inputClassName="font_poppins pr-11"
                label="Password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <Button
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute bottom-0 right-0 flex h-10 w-10 cursor-pointer items-center justify-center rounded-button text-foreground-secondary transition-colors hover:text-foreground-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active"
                onClick={() => setShowPassword((isVisible) => !isVisible)}
              >
                <Icon
                  className="h-5 w-5"
                  decorative
                  icon={showPassword ? "eye-slash" : "eye"}
                />
              </Button>
            </div>

            <HighlightButton
              className="font_poppins w-full"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                  />
                  Signing In...
                </>
              ) : (
                <>
                  <Icon
                    className="h-5 w-5"
                    decorative
                    icon="sign-in"
                  />
                  Sign In
                </>
              )}
            </HighlightButton>
          </form>

          {/* Navigation links */}
          <div className="mt-6 space-y-2 text-center">
            <p className="font_poppins font_body_3 text-foreground-secondary">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="rounded-button text-accent transition-colors hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active"
              >
                Register
              </Link>
            </p>
            <p className="font_poppins font_body_4 text-foreground-secondary">
              <Link
                href="/"
                className="rounded-button transition-colors hover:text-foreground-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active"
              >
                Back to home
              </Link>
            </p>
          </div>
        </div>
      </AnimatedCard>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LoginForm />
    </Suspense>
  );
}
