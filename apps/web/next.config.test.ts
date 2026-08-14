import type { NextConfig } from "next";

const originalNextDistDir = process.env.NEXT_DIST_DIR;

function loadNextConfig(nextDistDir: string | undefined): NextConfig {
  jest.resetModules();
  if (nextDistDir === undefined) {
    delete process.env.NEXT_DIST_DIR;
  } else {
    process.env.NEXT_DIST_DIR = nextDistDir;
  }

  return require("./next.config").default as NextConfig;
}

afterEach(() => {
  if (originalNextDistDir === undefined) {
    delete process.env.NEXT_DIST_DIR;
  } else {
    process.env.NEXT_DIST_DIR = originalNextDistDir;
  }
});

describe("production output", () => {
  it("builds the standalone server expected by the Docker image", () => {
    const nextConfig = loadNextConfig(originalNextDistDir);

    expect(nextConfig.output).toBe("standalone");
  });

  it.each([
    [undefined, ".next"],
    ["", ".next"],
    ["custom-next-output", "custom-next-output"],
  ])("uses %p as NEXT_DIST_DIR and resolves to %p", (value, expected) => {
    expect(loadNextConfig(value).distDir).toBe(expected);
  });
});

describe("settings redirects", () => {
  it("keeps obsolete and preview links pointed at canonical settings", async () => {
    const nextConfig = loadNextConfig(originalNextDistDir);
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          destination: "/settings/account",
          source: "/settings-new/profile",
        }),
        expect.objectContaining({
          destination: "/settings/health#glucose-ranges",
          source: "/settings/glucose-range",
        }),
        expect.objectContaining({
          destination: "/settings/alarms-notification",
          source: "/settings-new/notifications",
        }),
        expect.objectContaining({
          destination: "/settings/alarms-notification#telegram",
          source: "/settings/telegram",
        }),
        expect.objectContaining({
          destination:
            "/settings/care-sharing?caregiver=:linkId#caregiver-permissions",
          source: "/settings-new/caregivers/:linkId/permissions",
        }),
        expect.objectContaining({
          destination: "/settings/ai#ai-provider",
          source: "/settings/ai-provider",
        }),
        expect.objectContaining({
          destination: "/settings/:path*",
          source: "/settings-new/:path*",
        }),
      ]),
    );
  });

  it("routes settings-new account through the Next redirect layer", async () => {
    const nextConfig = loadNextConfig(originalNextDistDir);
    const redirects = await nextConfig.redirects?.();
    const catchAll = redirects?.find(
      (redirect) => redirect.source === "/settings-new/:path*",
    );

    expect(catchAll).toEqual({
      destination: "/settings/:path*",
      permanent: false,
      source: "/settings-new/:path*",
    });
    expect(catchAll?.source.replace(":path*", "account")).toBe(
      "/settings-new/account",
    );
    expect(catchAll?.destination.replace(":path*", "account")).toBe(
      "/settings/account",
    );
  });
});
