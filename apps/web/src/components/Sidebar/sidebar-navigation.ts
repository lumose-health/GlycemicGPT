import type { IconName } from "@/base";
import { settingsNavigation } from "@/components/settings/settings-navigation";

export interface SidebarNavItem {
  name: string;
  href: string;
  icon: IconName;
  activeIcon?: IconName;
  badgeKey?: string;
  documentNavigation?: boolean;
}

const diabeticNavigation: readonly SidebarNavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: "home",
    activeIcon: "home-fill",
  },
  {
    name: "Daily Briefs",
    href: "/dashboard/briefs",
    icon: "clock",
    activeIcon: "clock-fill",
    badgeKey: "briefs",
  },
  { name: "AI Chat", href: "/dashboard/ai-chat", icon: "chat-bubbles" },
  {
    name: "Knowledge Base",
    href: "/dashboard/knowledge-base",
    icon: "book-open",
  },
  { name: "Settings", href: "/settings/account", icon: "gear" },
];

const caregiverNavigation: readonly SidebarNavItem[] = [
  { name: "Dashboard", href: "/dashboard/caregiver", icon: "people" },
];

const mealsNavItem: SidebarNavItem = {
  name: "Meals",
  href: "/dashboard/meals",
  icon: "fork-knife",
};

export function getAppNavigation(
  isCaregiver: boolean,
  mealsEnabled: boolean,
): readonly SidebarNavItem[] {
  if (isCaregiver) {
    return caregiverNavigation;
  }

  if (!mealsEnabled) {
    return diabeticNavigation;
  }

  const settingsStartIndex = diabeticNavigation.length - 1;

  return [
    ...diabeticNavigation.slice(0, settingsStartIndex),
    mealsNavItem,
    ...diabeticNavigation.slice(settingsStartIndex),
  ];
}

export function getSettingsNavigation(
  isCaregiver: boolean,
): readonly SidebarNavItem[] {
  return isCaregiver
    ? settingsNavigation.filter((item) => item.caregiverVisible)
    : settingsNavigation;
}
