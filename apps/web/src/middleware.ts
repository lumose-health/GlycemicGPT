/**
 * Auth and UI version routing middleware.
 *
 * Public URLs stay stable while the redesign is implemented under /v2.
 * The redesigned UI is the default. Supplying the exact legacy UI header
 * keeps requests on the origin/develop route tree.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "glycemicgpt_session";
const MOCK_RUNTIME_HEADER = "x-glycemicgpt-mock-api";
const UI_VERSION_HEADER = "x-glycemicgpt-ui-version";
const LEGACY_UI_VERSION = "legacy";

const legacySettingsPaths: Record<string, string> = {
  "/settings": "/dashboard/settings",
  "/settings/account": "/dashboard/settings/profile",
  "/settings/ai": "/dashboard/settings/ai-provider",
  "/settings/alarms-notification": "/dashboard/settings/alerts",
  "/settings/appearance": "/dashboard/settings",
  "/settings/care-sharing": "/dashboard/settings/caregivers",
  "/settings/connections": "/dashboard/settings/integrations",
  "/settings/data-privacy": "/dashboard/settings/data",
  "/settings/health": "/dashboard/settings/glucose-range",
};

const canonicalSettingsPaths: Record<string, string> = {
  "/dashboard/settings": "/settings/account",
  "/dashboard/settings/ai-provider": "/settings/ai",
  "/dashboard/settings/alerts": "/settings/alarms-notification",
  "/dashboard/settings/brief-delivery": "/settings/alarms-notification",
  "/dashboard/settings/caregivers": "/settings/care-sharing",
  "/dashboard/settings/communications": "/settings/alarms-notification",
  "/dashboard/settings/data": "/settings/data-privacy",
  "/dashboard/settings/emergency-contacts": "/settings/care-sharing",
  "/dashboard/settings/glucose-range": "/settings/health",
  "/dashboard/settings/insulin": "/settings/health",
  "/dashboard/settings/integrations": "/settings/connections",
  "/dashboard/settings/profile": "/settings/account",
  "/dashboard/settings/research-sources": "/settings/ai",
  "/dashboard/settings/safety-limits": "/settings/health",
  "/dashboard/settings/telegram": "/settings/alarms-notification",
};

function getLegacySettingsPath(pathname: string): string {
  const caregiverPermissions = pathname.match(
    /^\/settings\/caregivers\/([^/]+)\/permissions$/,
  );
  if (caregiverPermissions) {
    return `/dashboard/settings/caregivers/${caregiverPermissions[1]}/permissions`;
  }

  if (pathname.startsWith("/settings/integrations/")) {
    return pathname.replace("/settings", "/dashboard/settings");
  }

  return legacySettingsPaths[pathname] ?? "/dashboard/settings";
}

function getCanonicalSettingsPath(pathname: string): string {
  const caregiverPermissions = pathname.match(
    /^\/dashboard\/settings\/caregivers\/([^/]+)\/permissions$/,
  );
  if (caregiverPermissions) {
    return `/settings/caregivers/${caregiverPermissions[1]}/permissions`;
  }

  if (pathname.startsWith("/dashboard/settings/integrations/")) {
    return pathname.replace("/dashboard/settings", "/settings");
  }

  return canonicalSettingsPaths[pathname] ?? "/settings/account";
}

function getCanonicalV2Path(pathname: string): string | null {
  if (pathname === "/v2") return "/";
  if (pathname === "/v2/dashboard") return "/dashboard";
  if (pathname === "/v2/login") return "/login";
  if (pathname === "/v2/register") return "/register";
  if (pathname === "/v2/settings") return "/settings";
  if (pathname.startsWith("/v2/settings/")) {
    return pathname.slice(3);
  }
  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasMockRuntimeHeader = request.headers.get(MOCK_RUNTIME_HEADER) === "1";
  const isDevMockRuntime =
    process.env.NODE_ENV === "development" && hasMockRuntimeHeader;
  const hasSession = request.cookies.has(SESSION_COOKIE) || isDevMockRuntime;
  const usesLegacyUi =
    request.headers.get(UI_VERSION_HEADER) === LEGACY_UI_VERSION;

  const requestHeaders = new Headers(request.headers);
  if (isDevMockRuntime) {
    requestHeaders.set(MOCK_RUNTIME_HEADER, "1");
  }

  const applyVaryHeader = <T extends NextResponse>(response: T): T => {
    response.headers.set("Vary", UI_VERSION_HEADER);
    return response;
  };

  const next = () =>
    applyVaryHeader(
      NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }),
    );

  const redirect = (destination: string, preserveSearch = false) => {
    const url = new URL(destination, request.url);
    if (preserveSearch) {
      url.search = request.nextUrl.search;
    }
    return applyVaryHeader(NextResponse.redirect(url));
  };

  const rewrite = (destination: string) => {
    const url = new URL(request.url);
    url.pathname = destination;
    return applyVaryHeader(
      NextResponse.rewrite(url, {
        request: {
          headers: requestHeaders,
        },
      }),
    );
  };

  const canonicalV2Path = getCanonicalV2Path(pathname);
  if (canonicalV2Path) {
    return redirect(canonicalV2Path, true);
  }

  const isProtectedRoute =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/");

  if (isProtectedRoute && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return applyVaryHeader(NextResponse.redirect(loginUrl));
  }

  if (pathname === "/login" || pathname === "/register") {
    if (
      pathname === "/login" &&
      hasSession &&
      request.nextUrl.searchParams.get("expired") === "true"
    ) {
      const response = usesLegacyUi ? next() : rewrite("/v2/login");
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }

    if (hasSession) {
      return redirect("/dashboard");
    }
  }

  if (usesLegacyUi) {
    if (pathname === "/settings" || pathname.startsWith("/settings/")) {
      return rewrite(getLegacySettingsPath(pathname));
    }
    return next();
  }

  if (pathname === "/dashboard-new-design") {
    return redirect("/dashboard", true);
  }

  if (pathname === "/settings-new") {
    return redirect("/settings", true);
  }

  if (pathname.startsWith("/settings-new/")) {
    return redirect(pathname.replace("/settings-new", "/settings"), true);
  }

  if (
    pathname === "/dashboard/settings" ||
    pathname.startsWith("/dashboard/settings/")
  ) {
    return redirect(getCanonicalSettingsPath(pathname), true);
  }

  if (pathname === "/") return rewrite("/v2");
  if (pathname === "/login") return rewrite("/v2/login");
  if (pathname === "/register") return rewrite("/v2/register");
  if (pathname === "/dashboard") return rewrite("/v2/dashboard");
  if (pathname === "/settings") return rewrite("/v2/settings");
  if (pathname.startsWith("/settings/")) {
    return rewrite(`/v2${pathname}`);
  }

  return next();
}

export const config = {
  matcher: [
    "/",
    "/v2/:path*",
    "/dashboard/:path*",
    "/dashboard-new-design",
    "/settings/:path*",
    "/settings-new/:path*",
    "/login",
    "/register",
  ],
};
