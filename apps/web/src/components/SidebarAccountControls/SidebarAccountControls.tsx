"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button, Icon } from "@/base";
import { logoutUser } from "@/lib/api";
import { twMerge } from "@/lib/ui/twMerge";
import { useClearAuthenticatedQueryCache } from "@/providers/AuthenticatedQueryProvider";
import { useUserContext } from "@/providers/user-provider";

import type { SidebarAccountControlsProps } from "./SidebarAccountControls.types";

export function SidebarAccountControls({
  collapsed = false,
  compact = false,
  onNavigate,
}: SidebarAccountControlsProps) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useUserContext();
  const clearAuthenticatedQueryCache = useClearAuthenticatedQueryCache();
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
        <Button
          aria-expanded={isUserMenuOpen}
          aria-haspopup="true"
          aria-label={
            compact
              ? `${isUserMenuOpen ? "Close" : "Open"} account menu for ${accountName}`
              : undefined
          }
          className={twMerge(
            "flex min-w-0 items-center rounded-panel font_nav_link text-foreground-primary transition-all duration-200 hover:bg-surface-secondary",
            compact ? "h-11 w-11 justify-center p-0" : "w-full py-2",
            !compact && (collapsed ? "gap-0 px-4" : "gap-2 px-4"),
            isUserMenuOpen && "bg-surface-secondary text-foreground-primary",
          )}
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          type="button"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-accent text-accent-foreground">
            <Icon className="h-4 w-4" decorative icon="person" />
          </span>
          {!compact && (
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
                className={twMerge(
                  "h-4 w-4 shrink-0 transition-all duration-200",
                  collapsed && "w-0 opacity-0",
                  isUserMenuOpen && "rotate-180",
                )}
                decorative
                icon="chevron"
              />
            </>
          )}
        </Button>
        {(isUserMenuOpen || isLoggingOut) && (
          <div className="absolute bottom-full right-0 z-50 mb-2 w-full min-w-48 rounded-panel border border-border-default bg-surface-primary py-1 shadow-lg">
            <Link
              className="flex items-center gap-2 px-4 py-2 font_nav_link text-foreground-secondary hover:bg-surface-secondary hover:text-foreground-primary"
              href="/settings/account"
              onClick={() => {
                setIsUserMenuOpen(false);
                onNavigate?.();
              }}
            >
              <Icon className="h-4 w-4" decorative icon="gear" />
              Settings
            </Link>
            <hr className="my-1 border-border-default" />
            <Button
              className="flex w-full items-center gap-2 px-4 py-2 font_nav_link text-signal-error-text hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoggingOut}
              onClick={async () => {
                setIsLoggingOut(true);
                clearAuthenticatedQueryCache();

                try {
                  await logoutUser();
                } catch {
                  // Logout redirects even when the API request fails.
                } finally {
                  window.location.href = "/login";
                }
              }}
              type="button"
            >
              {isLoggingOut ? (
                <Icon
                  className="h-4 w-4 animate-spin"
                  decorative
                  icon="clock"
                />
              ) : (
                <Icon className="h-4 w-4" decorative icon="sign-out" />
              )}
              {isLoggingOut ? "Signing out..." : "Sign out"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
