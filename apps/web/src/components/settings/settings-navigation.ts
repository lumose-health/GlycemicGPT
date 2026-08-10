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
    href: "/settings/account",
    icon: settingsPageIcons.account,
    caregiverVisible: true,
  },
  {
    name: "Connections",
    href: "/settings/connections",
    icon: settingsPageIcons.connections,
  },
  {
    name: "AI & Insight",
    href: "/settings/ai",
    icon: settingsPageIcons.ai,
  },
  {
    name: "Glucose & Insulin",
    href: "/settings/health",
    icon: settingsPageIcons.health,
  },
  {
    name: "Alarms & Notifications",
    href: "/settings/alarms-notification",
    icon: settingsPageIcons.alarmsNotification,
    caregiverVisible: true,
  },
  {
    name: "Care & Sharing",
    href: "/settings/care-sharing",
    icon: settingsPageIcons.careSharing,
  },
  {
    name: "Data & Privacy",
    href: "/settings/data-privacy",
    icon: settingsPageIcons.dataPrivacy,
  },
  {
    name: "Appearance",
    href: "/settings/appearance",
    icon: settingsPageIcons.appearance,
    caregiverVisible: true,
  },
];
