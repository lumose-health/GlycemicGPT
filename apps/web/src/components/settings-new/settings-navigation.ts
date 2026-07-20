import type { IconName } from "@/base";

export interface SettingsNavItem {
  name: string;
  href: string;
  icon: IconName;
  caregiverVisible?: boolean;
}

export const settingsNavigation: SettingsNavItem[] = [
  {
    name: "Profile",
    href: "/settings-new/profile",
    icon: "person",
    caregiverVisible: true,
  },
  {
    name: "Appearance",
    href: "/settings-new/appearance",
    icon: "sun",
    caregiverVisible: true,
  },
  {
    name: "Integrations",
    href: "/settings-new/integrations",
    icon: "link",
  },
  {
    name: "AI Provider",
    href: "/settings-new/ai-provider",
    icon: "key",
  },
  {
    name: "AI Research Sources",
    href: "/settings-new/research-sources",
    icon: "book-open",
  },
  {
    name: "Glucose Range",
    href: "/settings-new/glucose-range",
    icon: "glucose",
  },
  {
    name: "Insulin / Medications",
    href: "/settings-new/insulin",
    icon: "exercise-dumbbell",
  },
  {
    name: "Safety Limits",
    href: "/settings-new/safety-limits",
    icon: "circle-slash",
  },
  {
    name: "Daily Briefs",
    href: "/settings-new/brief-delivery",
    icon: "clock",
  },
  {
    name: "Alerts",
    href: "/settings-new/alerts",
    icon: "bell",
  },
  {
    name: "Emergency Contacts",
    href: "/settings-new/emergency-contacts",
    icon: "people",
  },
  {
    name: "Caregivers",
    href: "/settings-new/caregivers",
    icon: "person-add",
  },
  {
    name: "Communications",
    href: "/settings-new/communications",
    icon: "mail",
    caregiverVisible: true,
  },
  {
    name: "Data",
    href: "/settings-new/data",
    icon: "desktop-device",
  },
];
