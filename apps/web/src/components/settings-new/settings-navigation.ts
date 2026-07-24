import type { IconName } from "@/base";

export interface SettingsNavItem {
  name: string;
  href: string;
  icon: IconName;
  caregiverVisible?: boolean;
}

export const settingsPageIcons = {
  account: "person",
  ai: "lightbulb",
  alarmsNotification: "bell",
  appearance: "sun",
  careSharing: "people",
  connections: "link",
  dataPrivacy: "desktop-device",
  health: "glucose",
} as const satisfies Record<string, IconName>;

export const settingsNavigation: SettingsNavItem[] = [
  {
    name: "Account",
    href: "/settings-new/account",
    icon: settingsPageIcons.account,
    caregiverVisible: true,
  },
  {
    name: "Connections",
    href: "/settings-new/connections",
    icon: settingsPageIcons.connections,
  },
  {
    name: "AI & Insight",
    href: "/settings-new/ai",
    icon: settingsPageIcons.ai,
  },
  {
    name: "Glucose & Insulin",
    href: "/settings-new/health",
    icon: settingsPageIcons.health,
  },
  {
    name: "Alarms & Notifications",
    href: "/settings-new/alarms-notification",
    icon: settingsPageIcons.alarmsNotification,
    caregiverVisible: true,
  },
  {
    name: "Care & Sharing",
    href: "/settings-new/care-sharing",
    icon: settingsPageIcons.careSharing,
  },
  {
    name: "Data & Privacy",
    href: "/settings-new/data-privacy",
    icon: settingsPageIcons.dataPrivacy,
  },
  {
    name: "Appearance",
    href: "/settings-new/appearance",
    icon: settingsPageIcons.appearance,
    caregiverVisible: true,
  },
];
