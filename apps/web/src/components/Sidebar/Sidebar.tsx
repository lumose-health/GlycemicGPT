"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { Button, Icon } from "@/base";
import { LumoseLogo } from "@/components/LumoseLogo";
import { SidebarAccountControls } from "@/components/SidebarAccountControls";
import { SidebarBackToAppRegion } from "@/components/SidebarBackToAppRegion";
import { SidebarNavigationItems } from "@/components/SidebarNavigationItems";
import { useMealIntelligence } from "@/hooks/use-meal-intelligence";
import { useUnreadInsightsCount } from "@/hooks/use-unread-insights-count";
import { twMerge } from "@/lib/ui/twMerge";
import { useUserContext } from "@/providers/user-provider";

import { getAppNavigation, getSettingsNavigation } from "./sidebar-navigation";
import type { SidebarProps } from "./Sidebar.types";

export function Sidebar({ className }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const { user } = useUserContext();
  const { enabled: mealsEnabled } = useMealIntelligence();
  const isCaregiver = user?.role === "caregiver";
  const isSettingsNavigation = pathname.startsWith("/settings");
  const isSidebarCollapsed = isSettingsNavigation ? false : isCollapsed;
  const appNavigation = getAppNavigation(isCaregiver, mealsEnabled === true);
  const settingsNavigationItems = getSettingsNavigation(isCaregiver);
  const unreadCount = useUnreadInsightsCount(
    !isCaregiver && !isSettingsNavigation,
  );

  useEffect(() => {
    if (isSettingsNavigation && isCollapsed) {
      setIsCollapsed(false);
    }
  }, [isCollapsed, isSettingsNavigation]);

  return (
    <aside
      className={twMerge(
        "hidden shrink-0 overflow-x-hidden transition-[width] duration-300 lg:flex lg:flex-col",
        isSidebarCollapsed ? "lg:w-20" : "lg:w-64",
        "bg-surface-primary border-r border-border-default",
        className,
      )}
      data-collapsed={isSidebarCollapsed}
    >
      <div className="relative flex h-dashboard-header-height items-center justify-start px-[23.5px] after:absolute after:inset-x-2 after:bottom-0 after:border-b after:border-border-default after:content-['']">
        <LumoseLogo collapsed={isSidebarCollapsed} />
      </div>
      <nav className="min-h-0 flex-1 overflow-hidden transition-all duration-200">
        <div
          className="relative h-full overflow-hidden"
          data-navigation-mode={isSettingsNavigation ? "settings" : "app"}
        >
          <div
            aria-hidden={isSettingsNavigation}
            className={twMerge(
              "absolute inset-0 overflow-x-hidden overflow-y-auto px-2 pb-4 transition-transform duration-300 ease-in-out motion-reduce:transition-none",
              isSettingsNavigation
                ? "pointer-events-none -translate-x-full"
                : "translate-x-0",
            )}
            data-navigation-panel="app"
            inert={isSettingsNavigation}
          >
            <div className="space-y-1">
              <SidebarBackToAppRegion
                collapsed={isSidebarCollapsed}
                isVisible={false}
              />
              <SidebarNavigationItems
                collapsed={isSidebarCollapsed}
                items={appNavigation}
                pathname={pathname}
                unreadCount={unreadCount}
              />
            </div>
            <Button
              aria-expanded={!isSidebarCollapsed}
              ariaLabel={
                isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              className={twMerge(
                "relative isolate mt-3 flex h-9 w-16 cursor-pointer items-center justify-center rounded-button text-foreground-primary transition-colors",
                "before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:right-px before:z-0 before:rounded-button before:transition-colors before:content-['']",
                "hover:text-foreground-primary hover:before:bg-surface-primary",
                "focus-visible:ring-2 focus-visible:ring-border-active",
              )}
              onClick={() => setIsCollapsed((current) => !current)}
            >
              <Icon
                className="relative z-10 h-5 w-5"
                decorative
                icon={
                  isSidebarCollapsed ? "sidebar-expand" : "sidebar-collapse"
                }
              />
            </Button>
          </div>
          <div
            aria-hidden={!isSettingsNavigation}
            className={twMerge(
              "absolute inset-0 overflow-x-hidden overflow-y-auto px-2 pb-4 transition-transform duration-300 ease-in-out motion-reduce:transition-none",
              isSettingsNavigation
                ? "translate-x-0"
                : "pointer-events-none translate-x-full",
            )}
            data-navigation-panel="settings"
            inert={!isSettingsNavigation}
          >
            <div className="space-y-1">
              <SidebarBackToAppRegion isVisible />
              <SidebarNavigationItems
                items={settingsNavigationItems}
                pathname={pathname}
                unreadCount={unreadCount}
              />
            </div>
          </div>
        </div>
      </nav>
      <div className="relative px-2 py-4 transition-all duration-200 before:absolute before:inset-x-2 before:top-0 before:border-t before:border-border-default before:content-['']">
        <SidebarAccountControls collapsed={isSidebarCollapsed} />
      </div>
    </aside>
  );
}
