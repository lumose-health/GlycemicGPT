/**
 * Story 15.3: Auth Middleware Tests
 *
 * Tests the middleware logic by mocking NextRequest/NextResponse
 * since Edge runtime APIs aren't available in Jest's node environment.
 */

// Mock next/server before importing middleware
const mockRedirect = jest.fn();
const mockNext = jest.fn();
const mockCookieDelete = jest.fn();

jest.mock("next/server", () => ({
  NextResponse: {
    redirect: (url: URL) => {
      const response = {
        status: 307,
        headers: new Map([["location", url.toString()]]),
        cookies: { delete: mockCookieDelete },
      };
      mockRedirect(url.toString());
      return response;
    },
    next: (init?: unknown) => {
      const response = {
        status: 200,
        headers: new Map(),
        cookies: { delete: mockCookieDelete },
      };
      mockNext(response, init);
      return response;
    },
  },
}));

import { middleware, config } from "@/middleware";

function createMockRequest(
  path: string,
  cookieOptions:
    | boolean
    | { session?: boolean; mockHeader?: boolean } = false
) {
  const url = new URL(path, "http://localhost:3000");
  const hasSession =
    typeof cookieOptions === "boolean" ? cookieOptions : !!cookieOptions.session;
  const hasMockHeader =
    typeof cookieOptions === "boolean" ? false : !!cookieOptions.mockHeader;
  const headers = new Headers();
  if (hasMockHeader) {
    headers.set("x-glycemicgpt-mock-api", "1");
  }
  return {
    nextUrl: url,
    url: url.toString(),
    headers,
    cookies: {
      has: (name: string) => {
        if (name === "glycemicgpt_session") return hasSession;
        return false;
      },
    },
  } as Parameters<typeof middleware>[0];
}

function getRedirectPath(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

describe("Auth Middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCookieDelete.mockClear();
  });

  describe("protected routes (unauthenticated)", () => {
    it("redirects /dashboard to /login with redirect param", () => {
      const request = createMockRequest("/dashboard");
      middleware(request);

      expect(mockRedirect).toHaveBeenCalledTimes(1);
      const redirectUrl = mockRedirect.mock.calls[0][0];
      expect(getRedirectPath(redirectUrl)).toBe(
        "/login?redirect=%2Fdashboard"
      );
    });

    it("redirects /dashboard/settings to /login with redirect param", () => {
      const request = createMockRequest("/dashboard/settings");
      middleware(request);

      expect(mockRedirect).toHaveBeenCalledTimes(1);
      const redirectUrl = mockRedirect.mock.calls[0][0];
      expect(getRedirectPath(redirectUrl)).toBe(
        "/login?redirect=%2Fdashboard%2Fsettings"
      );
    });

    it("redirects /dashboard/settings/profile to /login with redirect param", () => {
      const request = createMockRequest("/dashboard/settings/profile");
      middleware(request);

      expect(mockRedirect).toHaveBeenCalledTimes(1);
      const redirectUrl = mockRedirect.mock.calls[0][0];
      expect(getRedirectPath(redirectUrl)).toBe(
        "/login?redirect=%2Fdashboard%2Fsettings%2Fprofile"
      );
    });

    it("redirects /dashboard/ai-chat to /login with redirect param", () => {
      const request = createMockRequest("/dashboard/ai-chat");
      middleware(request);

      expect(mockRedirect).toHaveBeenCalledTimes(1);
      const redirectUrl = mockRedirect.mock.calls[0][0];
      expect(getRedirectPath(redirectUrl)).toBe(
        "/login?redirect=%2Fdashboard%2Fai-chat"
      );
    });
  });

  describe("protected routes (authenticated)", () => {
    it("allows /dashboard through with valid cookie", () => {
      const request = createMockRequest("/dashboard", true);
      middleware(request);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("allows /dashboard/settings through with valid cookie", () => {
      const request = createMockRequest("/dashboard/settings", true);
      middleware(request);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("allows /dashboard/alerts through with valid cookie", () => {
      const request = createMockRequest("/dashboard/alerts", true);
      middleware(request);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe("public routes", () => {
    it("allows / without auth (not matched by middleware config)", () => {
      const request = createMockRequest("/");
      middleware(request);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("allows /login without auth", () => {
      const request = createMockRequest("/login");
      middleware(request);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("allows /register without auth", () => {
      const request = createMockRequest("/register");
      middleware(request);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("allows /invite/abc123 without auth (not matched by middleware config)", () => {
      const request = createMockRequest("/invite/abc123");
      middleware(request);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe("auth page redirects (authenticated)", () => {
    it("redirects /login to /dashboard when authenticated", () => {
      const request = createMockRequest("/login", true);
      middleware(request);

      expect(mockRedirect).toHaveBeenCalledTimes(1);
      const redirectUrl = mockRedirect.mock.calls[0][0];
      expect(getRedirectPath(redirectUrl)).toBe("/dashboard");
    });

    it("redirects /register to /dashboard when authenticated", () => {
      const request = createMockRequest("/register", true);
      middleware(request);

      expect(mockRedirect).toHaveBeenCalledTimes(1);
      const redirectUrl = mockRedirect.mock.calls[0][0];
      expect(getRedirectPath(redirectUrl)).toBe("/dashboard");
    });
  });

  describe("expired session handling", () => {
    it("clears cookie and shows login when authenticated user hits /login?expired=true", () => {
      const request = createMockRequest("/login?expired=true", true);
      middleware(request);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockCookieDelete).toHaveBeenCalledWith("glycemicgpt_session");
    });

    it("redirects authenticated user to /dashboard on /login without expired param", () => {
      const request = createMockRequest("/login", true);
      middleware(request);

      expect(mockRedirect).toHaveBeenCalledTimes(1);
      expect(mockCookieDelete).not.toHaveBeenCalled();
    });

    it("allows unauthenticated user to /login?expired=true without cookie deletion", () => {
      const request = createMockRequest("/login?expired=true", false);
      middleware(request);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockCookieDelete).not.toHaveBeenCalled();
    });

    it("does not clear cookie on /register?expired=true (only /login handles expiry)", () => {
      const request = createMockRequest("/register?expired=true", true);
      middleware(request);

      expect(mockRedirect).toHaveBeenCalledTimes(1);
      expect(mockCookieDelete).not.toHaveBeenCalled();
      const redirectUrl = mockRedirect.mock.calls[0][0];
      expect(getRedirectPath(redirectUrl)).toBe("/dashboard");
    });
  });

  describe("edge cases", () => {
    it("redirects /dashboard/ (trailing slash) to /login", () => {
      const request = createMockRequest("/dashboard/");
      middleware(request);

      expect(mockRedirect).toHaveBeenCalledTimes(1);
      const redirectUrl = mockRedirect.mock.calls[0][0];
      expect(getRedirectPath(redirectUrl)).toBe(
        "/login?redirect=%2Fdashboard%2F"
      );
    });

    it("preserves only pathname in redirect param (not query strings)", () => {
      const request = createMockRequest("/dashboard/settings");
      middleware(request);

      expect(mockRedirect).toHaveBeenCalledTimes(1);
      const redirectUrl = mockRedirect.mock.calls[0][0];
      // Middleware uses pathname only, not full URL with query params
      expect(getRedirectPath(redirectUrl)).toBe(
        "/login?redirect=%2Fdashboard%2Fsettings"
      );
    });
  });

  describe("development mock runtime", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "development",
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: originalNodeEnv,
        configurable: true,
      });
    });

    it("requires the mock runtime header in development", () => {
      const request = createMockRequest("/dashboard");
      middleware(request);

      expect(mockRedirect).toHaveBeenCalledTimes(1);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("allows /dashboard with the mock runtime header without a session", () => {
      const request = createMockRequest("/dashboard", {
        mockHeader: true,
      });
      middleware(request);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRedirect).not.toHaveBeenCalled();
      const init = mockNext.mock.calls[0][1] as {
        request?: { headers?: Headers };
      };
      expect(init.request?.headers?.get("x-glycemicgpt-mock-api")).toBe(
        "1"
      );
    });

    it("keeps mock mode active when the header is present with query params", () => {
      const request = createMockRequest("/dashboard?foo=bar", {
        mockHeader: true,
      });
      middleware(request);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe("middleware config", () => {
    it("exports matcher config with correct routes", () => {
      expect(config.matcher).toEqual([
        "/dashboard/:path*",
        "/login",
        "/register",
      ]);
    });
  });
});
