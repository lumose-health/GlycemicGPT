import nextConfig from "./next.config";

describe("settings redirects", () => {
  it("keeps obsolete and preview links pointed at canonical settings", async () => {
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
});
