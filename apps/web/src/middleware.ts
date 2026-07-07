/**
 * Story 15.3: Next.js Auth Middleware & Route Protection
 *
 * Protects /dashboard/* routes by checking for the session cookie.
 * Redirects authenticated users away from /login and /register.
 * Cookie presence check only - the API validates the actual JWT.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "glycemicgpt_session";
const MOCK_RUNTIME_HEADER = "x-glycemicgpt-mock-api";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasMockRuntimeHeader = request.headers.get(MOCK_RUNTIME_HEADER) === "1";
  const isDevMockRuntime =
    process.env.NODE_ENV === "development" && hasMockRuntimeHeader;
  const hasSession = request.cookies.has(SESSION_COOKIE) || isDevMockRuntime;

  const requestHeaders = new Headers(request.headers);
  if (isDevMockRuntime) {
    requestHeaders.set(MOCK_RUNTIME_HEADER, "1");
  }

  const next = () => {
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    return response;
  };

  // Protected routes: redirect unauthenticated users to login
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    if (!hasSession) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Auth pages: redirect authenticated users to dashboard
  if (pathname === "/login" || pathname === "/register") {
    // Clear stale httpOnly cookie when redirected here after session expiry
    if (pathname === "/login" && hasSession && request.nextUrl.searchParams.get("expired") === "true") {
      const response = next();
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    if (hasSession) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
