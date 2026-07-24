import type { HTMLAttributes, ReactNode } from "react";
import type { IconName } from "@/base";

export type SettingsPageHeaderProps = Omit<
  HTMLAttributes<HTMLElement>,
  "title"
> & {
  description: ReactNode;
  icon?: IconName;
  title: ReactNode;
};
