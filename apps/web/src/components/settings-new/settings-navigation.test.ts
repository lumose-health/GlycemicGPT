import { settingsNavigation } from "./settings-navigation";

describe("settingsNavigation", () => {
  it("exposes the consolidated settings structure in the intended order", () => {
    expect(
      settingsNavigation.map(({ href, icon, name }) => ({ href, icon, name })),
    ).toEqual([
      {
        href: "/settings-new/account",
        icon: "person",
        name: "Account",
      },
      {
        href: "/settings-new/connections",
        icon: "link",
        name: "Connections",
      },
      {
        href: "/settings-new/ai",
        icon: "lightbulb",
        name: "AI & Insight",
      },
      {
        href: "/settings-new/health",
        icon: "glucose",
        name: "Glucose & Insulin",
      },
      {
        href: "/settings-new/alarms-notification",
        icon: "bell",
        name: "Alarms & Notifications",
      },
      {
        href: "/settings-new/care-sharing",
        icon: "people",
        name: "Care & Sharing",
      },
      {
        href: "/settings-new/data-privacy",
        icon: "desktop-device",
        name: "Data & Privacy",
      },
      {
        href: "/settings-new/appearance",
        icon: "sun",
        name: "Appearance",
      },
    ]);
  });

  it("keeps caregiver settings in the shared navigation order", () => {
    expect(
      settingsNavigation
        .filter(({ caregiverVisible }) => caregiverVisible)
        .map(({ name }) => name),
    ).toEqual(["Account", "Alarms & Notifications", "Appearance"]);
  });
});
