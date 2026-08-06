import type { IconName } from "@/base/Icon";

export type SettingsTabItem<T extends string> = {
  href: string;
  icon?: IconName;
  label: string;
  value: T;
};

export type SettingsTabsProps<T extends string> = {
  "aria-label": string;
  className?: string;
  idPrefix: string;
  items: SettingsTabItem<T>[];
  value: T;
};
