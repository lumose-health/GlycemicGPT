import { DashboardSidebarLink } from "@/components/DashboardSidebarLink";
import { UnreadBadge } from "@/components/UnreadBadge";

import type { SidebarNavigationItemsProps } from "./SidebarNavigationItems.types";

export function SidebarNavigationItems({
  collapsed = false,
  items,
  onClick,
  pathname,
  unreadCount,
}: SidebarNavigationItemsProps) {
  return items.map((item) => {
    const isActive =
      pathname === item.href ||
      (item.href !== "/dashboard" &&
        item.href !== "/dashboard/caregiver" &&
        pathname.startsWith(item.href));

    return (
      <DashboardSidebarLink
        activeIcon={item.activeIcon}
        badge={
          item.badgeKey === "briefs" ? (
            <UnreadBadge count={unreadCount} />
          ) : undefined
        }
        collapsed={collapsed}
        documentNavigation={item.documentNavigation}
        href={item.href}
        icon={item.icon}
        isActive={isActive}
        key={item.name}
        label={item.name}
        onClick={onClick}
      />
    );
  });
}
