import nextConfig from "./next.config";

describe("settings redirects", () => {
  it("keeps old settings links pointed at the consolidated structure", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          destination: "/settings-new/account",
          source: "/settings-new/profile",
        }),
        expect.objectContaining({
          destination: "/settings-new/health#glucose-ranges",
          source: "/settings-new/glucose-range",
        }),
        expect.objectContaining({
          destination: "/settings-new/alarms-notification",
          source: "/settings-new/notifications",
        }),
        expect.objectContaining({
          destination: "/settings-new/alarms-notification#telegram",
          source: "/settings-new/telegram",
        }),
        expect.objectContaining({
          destination:
            "/settings-new/care-sharing?caregiver=:linkId#caregiver-permissions",
          source: "/settings-new/caregivers/:linkId/permissions",
        }),
        expect.objectContaining({
          destination: "/settings-new/ai#ai-provider",
          source: "/settings-new/ai-provider",
        }),
      ]),
    );
  });
});
