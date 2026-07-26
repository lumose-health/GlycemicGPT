"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import { Button, Icon } from "@/base";
import { LumoseLogo } from "@/components/LumoseLogo";
import { SidebarAccountControls } from "@/components/SidebarAccountControls";
import { SidebarBackToAppRegion } from "@/components/SidebarBackToAppRegion";
import {
  getAppNavigation,
  getSettingsNavigation,
} from "@/components/Sidebar/sidebar-navigation";
import { SidebarNavigationItems } from "@/components/SidebarNavigationItems";
import { useMealIntelligence } from "@/hooks/use-meal-intelligence";
import { useUnreadInsightsCount } from "@/hooks/use-unread-insights-count";
import { twMerge } from "@/lib/ui/twMerge";
import { useUserContext } from "@/providers";

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useUserContext();
  const { enabled: mealsEnabled } = useMealIntelligence();
  const isCaregiver = user?.role === "caregiver";
  const isSettingsNavigation = pathname.startsWith("/settings");
  const appNavigation = getAppNavigation(isCaregiver, mealsEnabled === true);
  const settingsNavigationItems = getSettingsNavigation(isCaregiver);
  const unreadCount = useUnreadInsightsCount(
    !isCaregiver && !isSettingsNavigation,
  );

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border-default bg-surface-primary pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto flex h-16 max-w-sm items-center justify-around px-6">
          <Button
            ariaLabel="Open navigation menu"
            className="flex min-w-16 flex-col items-center gap-1 rounded-panel px-3 py-1 text-foreground-primary transition-colors hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-border-active"
            onClick={() => setIsOpen(true)}
          >
            <span className="flex h-8 w-8 items-center justify-center">
              <Icon className="h-5 w-5" decorative icon="menu" />
            </span>
            <span className="font_metric_caption">Menu</span>
          </Button>
          <SidebarAccountControls compact />
        </div>
      </nav>
      {isOpen && (
        <div
          aria-label="Navigation menu"
          aria-modal="true"
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
        >
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-64 bg-surface-primary shadow-xl">
            <div className="relative flex h-dashboard-header-height items-center justify-between px-4 after:absolute after:inset-x-4 after:bottom-0 after:border-b after:border-border-default after:content-['']">
              <div className="flex items-center">
                <LumoseLogo onClick={() => setIsOpen(false)} />
              </div>
              <Button
                aria-label="Close navigation menu"
                className="p-2 text-foreground-secondary hover:text-foreground-primary"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <Icon decorative icon="sidebar-collapse" />
              </Button>
            </div>
            <nav className="h-[calc(100vh-4rem)] overflow-hidden">
              <div
                className="relative h-full overflow-hidden"
                data-navigation-mode={isSettingsNavigation ? "settings" : "app"}
              >
                <div
                  aria-hidden={isSettingsNavigation}
                  className={twMerge(
                    "absolute inset-0 overflow-x-hidden overflow-y-auto px-4 pb-4 transition-transform duration-300 ease-in-out motion-reduce:transition-none",
                    isSettingsNavigation
                      ? "pointer-events-none -translate-x-full"
                      : "translate-x-0",
                  )}
                  data-navigation-panel="app"
                  inert={isSettingsNavigation}
                >
                  <div className="space-y-1">
                    <SidebarBackToAppRegion isVisible={false} />
                    <SidebarNavigationItems
                      items={appNavigation}
                      onClick={() => setIsOpen(false)}
                      pathname={pathname}
                      unreadCount={unreadCount}
                    />
                  </div>
                </div>
                <div
                  aria-hidden={!isSettingsNavigation}
                  className={twMerge(
                    "absolute inset-0 overflow-x-hidden overflow-y-auto px-4 pb-4 transition-transform duration-300 ease-in-out motion-reduce:transition-none",
                    isSettingsNavigation
                      ? "translate-x-0"
                      : "pointer-events-none translate-x-full",
                  )}
                  data-navigation-panel="settings"
                  inert={!isSettingsNavigation}
                >
                  <div className="space-y-1">
                    <SidebarBackToAppRegion
                      isVisible
                      onClick={() => setIsOpen(false)}
                    />
                    <SidebarNavigationItems
                      items={settingsNavigationItems}
                      onClick={() => setIsOpen(false)}
                      pathname={pathname}
                      unreadCount={unreadCount}
                    />
                  </div>
                </div>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
