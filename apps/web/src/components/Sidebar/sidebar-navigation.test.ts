import { getAppNavigation, getSettingsNavigation } from "./sidebar-navigation";

describe("sidebar navigation", () => {
  it("adds meals immediately before settings when enabled", () => {
    expect(getAppNavigation(false, true).map((item) => item.name)).toEqual([
      "Dashboard",
      "Daily Briefs",
      "AI Chat",
      "Knowledge Base",
      "Meals",
      "Settings",
    ]);
  });

  it("keeps meals hidden when disabled", () => {
    expect(
      getAppNavigation(false, false).map((item) => item.name),
    ).not.toContain("Meals");
  });

  it("limits caregiver navigation and settings", () => {
    expect(getAppNavigation(true, true).map((item) => item.name)).toEqual([
      "Dashboard",
    ]);
    expect(getSettingsNavigation(true).map((item) => item.name)).toEqual([
      "Account",
      "Alarms & Notifications",
      "Appearance",
    ]);
  });
});
