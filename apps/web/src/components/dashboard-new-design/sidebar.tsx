"use client";
/**
 * Sidebar Navigation Component
 *
 * Story 4.1: Dashboard Layout & Navigation
 * Story 8.3: Role-aware navigation for caregiver accounts
 * Story 8.6: Caregivers see only the Caregiver Dashboard link
 * Story 11.3: Unread badge on Daily Briefs nav item
 * Provides navigation to Dashboard, Daily Briefs, AI Chat, and Settings.
 * Caregivers see only the Caregiver Dashboard (read-only enforcement).
 * Uses a bottom app bar with a navigation drawer on mobile.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Icon, type IconName } from "@/base";
import { DashboardSidebarLink } from "@/components/dashboard-new-design/DashboardSidebarLink";
import { LumoseLogoIcon } from "@/components/LumoseLogoIcon";
import { settingsNavigation } from "@/components/settings-new/settings-navigation";
import { useUserContext } from "@/providers";
import { useMealIntelligence } from "@/hooks/use-meal-intelligence";
import { getUnreadInsightsCount, logoutUser } from "@/lib/api";
import { twMerge } from "@/lib/ui/twMerge";
interface NavItem {
  name: string;
  href: string;
  icon: IconName;
  activeIcon?: IconName;
  badgeKey?: string;
  documentNavigation?: boolean;
}
const diabeticNavigation: NavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: "home",
    activeIcon: "home-fill",
    documentNavigation: true,
  },
  {
    name: "Dashboard V2",
    href: "/dashboard-new-design",
    icon: "home",
    documentNavigation: true,
  },
  {
    name: "Daily Briefs",
    href: "/dashboard/briefs",
    icon: "clock",
    activeIcon: "clock-fill",
    badgeKey: "briefs",
  },
  { name: "AI Chat", href: "/dashboard/ai-chat", icon: "chat-bubbles" },
  {
    name: "Knowledge Base",
    href: "/dashboard/knowledge-base",
    icon: "book-open",
  },
  {
    name: "Settings (old)",
    href: "/dashboard/settings",
    icon: "gear",
    documentNavigation: true,
  },
  { name: "Settings", href: "/settings-new/account", icon: "gear" },
];
const caregiverNavigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard/caregiver", icon: "people" },
];
// Meals is gated on the user's own meal-intelligence preference (read from the
// shared user context). When off, the nav item is hidden; the route itself
// renders a clear feature-off state (never a raw 404), mirroring the mobile
// client. Inserted just before the settings links.
const mealsNavItem: NavItem = {
  name: "Meals",
  href: "/dashboard/meals",
  icon: "fork-knife",
};
function navItemsFor(isCaregiver: boolean, mealsEnabled: boolean): NavItem[] {
  if (isCaregiver) return caregiverNavigation;
  if (!mealsEnabled) return diabeticNavigation;
  const settingsStartIndex = diabeticNavigation.length - 2;
  return [
    ...diabeticNavigation.slice(0, settingsStartIndex),
    mealsNavItem,
    ...diabeticNavigation.slice(settingsStartIndex),
  ];
}
function settingsNavItemsFor(isCaregiver: boolean): NavItem[] {
  const visibleSettings = isCaregiver
    ? settingsNavigation.filter((item) => item.caregiverVisible)
    : settingsNavigation;

  return [
    ...visibleSettings,
    {
      name: "Open old settings",
      href: "/dashboard/settings",
      icon: "gear",
      documentNavigation: true,
    },
  ];
}

function BackToAppRegion({
  collapsed = false,
  isVisible,
  onClick,
}: {
  collapsed?: boolean;
  isVisible: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={twMerge(
        "flex items-center overflow-hidden border-b",
        isVisible
          ? "mb-3 h-dashboard-header-height border-border-default"
          : "h-3 border-transparent",
      )}
    >
      {isVisible ? (
        <Link
          className={twMerge(
            "group flex min-h-11 items-center overflow-hidden font_nav_link text-foreground-primary outline-hidden transition-colors hover:text-accent",
            "focus-visible:ring-2 focus-visible:ring-border-active focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary",
            collapsed ? "gap-0 pl-[22px] pr-0" : "gap-3 pl-[22px] pr-3",
          )}
          href="/dashboard-new-design"
          onClick={onClick}
        >
          <Icon
            icon="chevron"
            decorative
            className="h-5 w-5 shrink-0 rotate-180 transition-transform group-hover:-translate-x-0.5"
          />
          <span
            className={twMerge(
              "min-w-0 flex-1 truncate whitespace-nowrap transition-all duration-200",
              collapsed ? "max-w-0 opacity-0" : "max-w-full opacity-100",
            )}
          >
            Go back to app
          </span>
        </Link>
      ) : null}
    </div>
  );
}

function SidebarNavigationItems({
  collapsed = false,
  items,
  onClick,
  pathname,
  unreadCount,
}: {
  collapsed?: boolean;
  items: NavItem[];
  onClick?: () => void;
  pathname: string;
  unreadCount: number;
}) {
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
interface SidebarProps {
  className?: string;
}
function useUnreadCount(enabled: boolean) {
  const [unreadCount, setUnreadCount] = useState(0);
  const fetchCount = useCallback(async () => {
    if (!enabled) return;
    try {
      const count = await getUnreadInsightsCount();
      setUnreadCount(count);
    } catch {
      // Silently fail - badge just won't show
    }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    fetchCount();
    // Refresh count every 60 seconds
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, [fetchCount, enabled]);
  return unreadCount;
}
function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const display = count > 99 ? "99+" : String(count);
  return (
    <span
      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-accent px-1.5 font_metric_caption text-accent-foreground"
      aria-label={`${count} unread`}
    >
      {display}
    </span>
  );
}
function LumoseLogo({
  className = "h-auto w-[33px]",
  collapsed = false,
  onClick,
}: {
  className?: string;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href="/dashboard-new-design"
      onClick={onClick}
      className="rounded-button outline-hidden focus-visible:ring-2 focus-visible:ring-border-active focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary"
    >
      <span
        role="img"
        aria-label="Lumose"
        className={twMerge(
          "flex items-center text-foreground-primary transition-all duration-200",
          collapsed ? "gap-0" : "gap-2.5",
        )}
      >
        <LumoseLogoIcon
          decorative
          className={twMerge(className, "aspect-[268.88/243.31]")}
        />
        <span
          className={twMerge(
            "min-w-0 overflow-hidden whitespace-nowrap transition-all duration-200",
            collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100",
          )}
        >
          <Icon
            icon="logo-text"
            decorative
            className="ml-1.5 mt-0.5 text-foreground-primary"
          />
        </span>
      </span>
    </Link>
  );
}
function SidebarAccountControls({
  collapsed = false,
  compact = false,
  onNavigate,
}: {
  collapsed?: boolean;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useUserContext();
  const accountName = user?.display_name || user?.email || "Account";
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  return (
    <div className={compact ? "w-auto" : "w-full"} ref={menuRef}>
      <div className="relative min-w-0">
        <button
          type="button"
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className={twMerge(
            "flex min-w-0 items-center rounded-panel font_nav_link text-foreground-secondary transition-all duration-200 hover:bg-surface-secondary hover:text-foreground-primary",
            compact ? "min-w-16 flex-col gap-1 px-3 py-1" : "w-full py-2",
            !compact && (collapsed ? "gap-0 px-4" : "gap-2 px-4"),
            isUserMenuOpen && "bg-surface-secondary text-foreground-primary",
          )}
          aria-label={
            compact
              ? `${isUserMenuOpen ? "Close" : "Open"} account menu for ${accountName}`
              : undefined
          }
          aria-expanded={isUserMenuOpen}
          aria-haspopup="true"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Icon icon="person" decorative className="h-4 w-4" />
          </span>
          {compact ? (
            <span className="font_metric_caption">Account</span>
          ) : (
            <>
              <span
                className={twMerge(
                  "min-w-0 flex-1 truncate text-left font_nav_link text-foreground-primary transition-all duration-200",
                  collapsed ? "max-w-0 opacity-0" : "max-w-full opacity-100",
                )}
              >
                {accountName}
              </span>
              <Icon
                icon="chevron"
                decorative
                className={twMerge(
                  "h-4 w-4 shrink-0 transition-all duration-200",
                  collapsed && "w-0 opacity-0",
                  isUserMenuOpen && "rotate-180",
                )}
              />
            </>
          )}
        </button>
        {(isUserMenuOpen || isLoggingOut) && (
          <div className="absolute bottom-full right-0 z-50 mb-2 w-full min-w-48 rounded-lg border border-border-default bg-surface-primary py-1 shadow-lg">
            <Link
              href="/settings-new/account"
              onClick={() => {
                setIsUserMenuOpen(false);
                onNavigate?.();
              }}
              className="flex items-center gap-2 px-4 py-2 font_nav_link text-foreground-secondary hover:bg-surface-secondary hover:text-foreground-primary"
            >
              <Icon icon="gear" decorative className="h-4 w-4" />
              Settings
            </Link>
            <a
              href="/dashboard/settings"
              onClick={() => {
                setIsUserMenuOpen(false);
                onNavigate?.();
              }}
              className="flex items-center gap-2 px-4 py-2 font_nav_link text-foreground-secondary hover:bg-surface-secondary hover:text-foreground-primary"
            >
              <Icon icon="gear" decorative className="h-4 w-4" />
              Settings (old)
            </a>
            <hr className="my-1 border-border-default" />
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={async () => {
                setIsLoggingOut(true);
                try {
                  await logoutUser();
                } catch {
                  // Best-effort logout: redirect regardless of API failure
                } finally {
                  window.location.href = "/login";
                }
              }}
              className="flex w-full items-center gap-2 px-4 py-2 font_nav_link text-signal-error-text hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoggingOut ? (
                <Icon
                  icon="clock"
                  decorative
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <Icon icon="sign-out" decorative className="h-4 w-4" />
              )}
              {isLoggingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
export function Sidebar({ className }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const { user } = useUserContext();
  const { enabled: mealsEnabled } = useMealIntelligence();
  const isCaregiver = user?.role === "caregiver";
  const isSettingsNavigation = pathname.startsWith("/settings-new");
  const isSidebarCollapsed = isSettingsNavigation ? false : isCollapsed;
  const appNavigation = navItemsFor(isCaregiver, mealsEnabled === true);
  const settingsNavigationItems = settingsNavItemsFor(isCaregiver);
  const unreadCount = useUnreadCount(!isCaregiver && !isSettingsNavigation);

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
      {/* Logo */}
      <div className="relative flex h-dashboard-header-height items-center justify-start px-[23.5px] after:absolute after:inset-x-2 after:bottom-0 after:border-b after:border-border-default after:content-['']">
        <LumoseLogo collapsed={isSidebarCollapsed} />
      </div>
      {/* Navigation */}
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
              <BackToAppRegion
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
                icon={
                  isSidebarCollapsed ? "sidebar-expand" : "sidebar-collapse"
                }
                decorative
                className="relative z-10 h-5 w-5"
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
              <BackToAppRegion isVisible />
              <SidebarNavigationItems
                items={settingsNavigationItems}
                pathname={pathname}
                unreadCount={unreadCount}
              />
            </div>
          </div>
        </div>
      </nav>
      {/* Footer */}
      <div className="relative px-2 py-4 transition-all duration-200 before:absolute before:inset-x-2 before:top-0 before:border-t before:border-border-default before:content-['']">
        <SidebarAccountControls collapsed={isSidebarCollapsed} />
      </div>
    </aside>
  );
}
export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useUserContext();
  const { enabled: mealsEnabled } = useMealIntelligence();
  const isCaregiver = user?.role === "caregiver";
  const isSettingsNavigation = pathname.startsWith("/settings-new");
  const appNavigation = navItemsFor(isCaregiver, mealsEnabled === true);
  const settingsNavigationItems = settingsNavItemsFor(isCaregiver);
  const unreadCount = useUnreadCount(!isCaregiver && !isSettingsNavigation);
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
              <Icon decorative icon="menu" className="h-5 w-5" />
            </span>
            <span className="font_metric_caption">Menu</span>
          </Button>
          <SidebarAccountControls compact />
        </div>
      </nav>
      {/* Mobile menu overlay */}
      {isOpen && (
        <div
          aria-label="Navigation menu"
          aria-modal="true"
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />
          {/* Sidebar */}
          <div className="fixed inset-y-0 left-0 w-64 bg-surface-primary shadow-xl">
            {/* Header */}
            <div className="relative flex h-dashboard-header-height items-center justify-between px-4 after:absolute after:inset-x-4 after:bottom-0 after:border-b after:border-border-default after:content-['']">
              <div className="flex items-center">
                <LumoseLogo onClick={() => setIsOpen(false)} />
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 text-foreground-secondary hover:text-foreground-primary"
                aria-label="Close navigation menu"
              >
                <Icon icon="sidebar-collapse" decorative />
              </button>
            </div>
            {/* Navigation */}
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
                    <BackToAppRegion isVisible={false} />
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
                    <BackToAppRegion
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
