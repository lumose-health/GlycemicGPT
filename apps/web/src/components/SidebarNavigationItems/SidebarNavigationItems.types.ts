import type { SidebarNavItem } from "@/components/Sidebar/sidebar-navigation";

export interface SidebarNavigationItemsProps {
  collapsed?: boolean;
  items: readonly SidebarNavItem[];
  onClick?: () => void;
  pathname: string;
  unreadCount: number;
}
