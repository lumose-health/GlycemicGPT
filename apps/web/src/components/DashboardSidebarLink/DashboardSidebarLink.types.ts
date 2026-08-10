import type { ReactNode } from "react";
import type { IconName } from "@/base/Icon";

export interface DashboardSidebarLinkProps {
  activeIcon?: IconName;
  badge?: ReactNode;
  collapsed?: boolean;
  documentNavigation?: boolean;
  href: string;
  icon: IconName;
  isActive?: boolean;
  label: string;
  onClick?: () => void;
}
