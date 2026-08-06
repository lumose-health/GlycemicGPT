import type { HTMLAttributes, ReactNode } from "react";
import type { IconName } from "@/base/Icon";

export type PageHeaderProps = Omit<
  HTMLAttributes<HTMLElement>,
  "title"
> & {
  actions?: ReactNode;
  description: ReactNode;
  icon?: IconName;
  title: ReactNode;
};
