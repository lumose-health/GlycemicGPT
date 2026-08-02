"use client";

import { useEffect, useState } from "react";
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
import { useUserContext } from "@/providers/user-provider";

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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border-default bg-surface-primary pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto grid h-16 max-w-sm grid-cols-3 items-center px-6">
          <Button
            aria-controls="mobile-navigation-overlay"
            aria-expanded={isOpen}
            ariaLabel="Open navigation menu"
            className="flex h-11 w-11 items-center justify-center justify-self-start rounded-panel text-foreground-primary transition-colors hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-border-active"
            onClick={() => setIsOpen(true)}
          >
            <Icon className="h-7 w-7" decorative icon="menu" />
          </Button>
          <div className="flex items-center justify-center justify-self-center">
            <LumoseLogo className="h-9 w-auto" collapsed />
          </div>
          <div className="justify-self-end">
            <SidebarAccountControls compact />
          </div>
        </div>
      </nav>
      <div
        aria-hidden={!isOpen}
        aria-label="Navigation menu"
        aria-modal="true"
        className={twMerge(
          "fixed inset-0 z-50 transition-[visibility] duration-300 motion-reduce:transition-none lg:hidden",
          isOpen
            ? "visible"
            : "pointer-events-none invisible delay-300",
        )}
        id="mobile-navigation-overlay"
        inert={!isOpen}
        role="dialog"
      >
        <div
          className={twMerge(
            "fixed inset-0 bg-overlay-primary transition-opacity duration-300 ease-out motion-reduce:transition-none",
            isOpen ? "opacity-100" : "opacity-0",
          )}
          data-testid="mobile-navigation-backdrop"
          onClick={() => setIsOpen(false)}
        />
        <div
          className={twMerge(
            "fixed inset-y-0 left-0 w-64 transform-gpu bg-surface-primary shadow-xl transition-transform duration-300 ease-out motion-reduce:transition-none",
            isOpen ? "translate-x-0" : "-translate-x-full",
          )}
          data-testid="mobile-navigation-drawer"
        >
          <div className="relative flex h-dashboard-header-height items-center px-4 after:absolute after:inset-x-4 after:bottom-0 after:border-b after:border-border-default after:content-['']">
            <div className="flex items-center">
              <LumoseLogo onClick={() => setIsOpen(false)} />
            </div>
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
    </>
  );
}
