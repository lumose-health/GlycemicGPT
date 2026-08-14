import type { HTMLAttributes, ReactNode } from "react";
import type { IconName } from "@/base/Icon";

export type EmptyStateProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  action?: ReactNode;
  description: ReactNode;
  icon?: IconName;
  title: ReactNode;
};
