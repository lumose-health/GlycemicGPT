const mockRedirect = jest.fn();
const mockRewrite = jest.fn();
const mockNext = jest.fn();
const mockCookieDelete = jest.fn();

function createResponse(status = 200) {
  return {
    status,
    headers: new Map<string, string>(),
    cookies: { delete: mockCookieDelete },
  };
}

jest.mock("next/server", () => ({
  NextResponse: {
    redirect: (url: URL) => {
      const response = createResponse(307);
      response.headers.set("location", url.toString());
      mockRedirect(url.toString());
      return response;
    },
    rewrite: (url: URL, init?: unknown) => {
      const response = createResponse();
      mockRewrite(url.toString(), init);
      return response;
    },
    next: (init?: unknown) => {
      const response = createResponse();
      mockNext(init);
      return response;
    },
  },
}));

import { config, middleware } from "@/middleware";

interface RequestOptions {
  legacyHeader?: string;
  mockHeader?: boolean;
  session?: boolean;
}

function createMockRequest(path: string, options: RequestOptions = {}) {
  const url = new URL(path, "http://localhost:3000");
  const headers = new Headers();

  if (options.mockHeader) {
    headers.set("x-glycemicgpt-mock-api", "1");
  }
  if (options.legacyHeader) {
    headers.set("x-glycemicgpt-ui-version", options.legacyHeader);
  }

  return {
    nextUrl: url,
    url: url.toString(),
    headers,
    cookies: {
      has: (name: string) =>
        name === "glycemicgpt_session" && options.session === true,
    },
  } as Parameters<typeof middleware>[0];
}

function getPath(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

function getRewrittenPath(): string {
  return getPath(mockRewrite.mock.calls[0][0]);
}

describe("middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("authentication", () => {
    it.each(["/dashboard", "/dashboard/alerts", "/settings/account"])(
      "redirects unauthenticated requests for %s to login",
      (path) => {
        middleware(createMockRequest(path));

        expect(getPath(mockRedirect.mock.calls[0][0])).toBe(
          `/login?redirect=${encodeURIComponent(path)}`,
        );
        expect(mockRewrite).not.toHaveBeenCalled();
      },
    );

    it("does not let the legacy header bypass authentication", () => {
      middleware(
        createMockRequest("/dashboard", { legacyHeader: "legacy" }),
      );

      expect(getPath(mockRedirect.mock.calls[0][0])).toBe(
        "/login?redirect=%2Fdashboard",
      );
    });

    it("redirects authenticated users away from login", () => {
      middleware(createMockRequest("/login", { session: true }));

      expect(getPath(mockRedirect.mock.calls[0][0])).toBe("/dashboard");
    });

    it("clears an expired session before rendering the default login", () => {
      middleware(
        createMockRequest("/login?expired=true", { session: true }),
      );

      expect(getRewrittenPath()).toBe("/v2/login?expired=true");
      expect(mockCookieDelete).toHaveBeenCalledWith("glycemicgpt_session");
    });
  });

  describe("default V2 routing", () => {
    it.each([
      ["/", "/v2"],
      ["/login", "/v2/login"],
      ["/register", "/v2/register"],
      ["/dashboard", "/v2/dashboard"],
      ["/settings", "/v2/settings"],
      ["/settings/account", "/v2/settings/account"],
    ])("internally rewrites %s to %s", (publicPath, internalPath) => {
      const session =
        publicPath.startsWith("/dashboard") ||
        publicPath.startsWith("/settings");

      middleware(createMockRequest(publicPath, { session }));

      expect(getRewrittenPath()).toBe(internalPath);
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("keeps dashboard pages without a V2 implementation on legacy", () => {
      middleware(createMockRequest("/dashboard/alerts", { session: true }));

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRewrite).not.toHaveBeenCalled();
    });

    it("redirects old settings URLs to the canonical V2 URL", () => {
      middleware(
        createMockRequest("/dashboard/settings/profile", { session: true }),
      );

      expect(getPath(mockRedirect.mock.calls[0][0])).toBe(
        "/settings/account",
      );
    });

    it.each([
      ["/dashboard-new-design", "/dashboard"],
      ["/settings-new/account", "/settings/account"],
      ["/v2/dashboard", "/dashboard"],
      ["/v2/settings/account", "/settings/account"],
    ])("redirects implementation URL %s to %s", (source, destination) => {
      middleware(createMockRequest(source, { session: true }));

      expect(getPath(mockRedirect.mock.calls[0][0])).toBe(destination);
    });
  });

  describe("legacy UI header", () => {
    it.each(["/dashboard", "/login", "/register"])(
      "keeps %s on its legacy route",
      (path) => {
        middleware(
          createMockRequest(path, {
            legacyHeader: "legacy",
            session: path === "/dashboard",
          }),
        );

        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockRewrite).not.toHaveBeenCalled();
      },
    );

    it("rewrites canonical settings to the matching legacy page", () => {
      middleware(
        createMockRequest("/settings/account", {
          legacyHeader: "legacy",
          session: true,
        }),
      );

      expect(getRewrittenPath()).toBe("/dashboard/settings/profile");
    });

    it("requires the exact legacy header value", () => {
      middleware(
        createMockRequest("/dashboard", {
          legacyHeader: "old",
          session: true,
        }),
      );

      expect(getRewrittenPath()).toBe("/v2/dashboard");
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

    it("allows the default dashboard without a session", () => {
      middleware(
        createMockRequest("/dashboard", {
          mockHeader: true,
        }),
      );

      expect(getRewrittenPath()).toBe("/v2/dashboard");
      const init = mockRewrite.mock.calls[0][1] as {
        request?: { headers?: Headers };
      };
      expect(init.request?.headers?.get("x-glycemicgpt-mock-api")).toBe("1");
    });

    it("ignores the mock runtime header outside development", () => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "production",
        configurable: true,
      });

      middleware(
        createMockRequest("/dashboard", {
          mockHeader: true,
        }),
      );

      expect(getPath(mockRedirect.mock.calls[0][0])).toBe(
        "/login?redirect=%2Fdashboard",
      );
    });
  });

  it("varies UI responses by the ModHeader value", () => {
    const response = middleware(createMockRequest("/login"));

    expect(response.headers.get("Vary")).toBe(
      "x-glycemicgpt-ui-version",
    );
  });

  it("matches every public route involved in UI selection", () => {
    expect(config.matcher).toEqual([
      "/",
      "/v2/:path*",
      "/dashboard/:path*",
      "/dashboard-new-design",
      "/settings/:path*",
      "/settings-new/:path*",
      "/login",
      "/register",
    ]);
  });
});
