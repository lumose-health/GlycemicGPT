"use client";
/**
 * Dashboard Layout Component
 *
 * Story 4.1: Dashboard Layout & Navigation
 * Main layout wrapper for all dashboard pages.
 * Includes sidebar navigation and main content area.
 */
import { twMerge } from "@/lib/ui/twMerge";
import { MobileNav } from "@/components/MobileNav";
import { Sidebar } from "@/components/Sidebar";
import type { DashboardLayoutProps } from "./DashboardLayout.types";
export function DashboardLayout({
  children,
  contentPaddingClassName,
}: DashboardLayoutProps) {
  return (
    <div
      data-dashboard-root
      className="flex min-h-0 flex-1 min-w-0 overflow-hidden bg-surface-page"
    >
      {/* Desktop sidebar -- natural flex child, no position:fixed */}
      <Sidebar />
      {/* Main content column */}
      <div
        data-dashboard-content
        className="flex-1 min-w-0 flex flex-col overflow-hidden"
      >
        <MobileNav />
        {/* Scrollable content area -- only scrollbar on the page */}
        <main
          id="main-content"
          className={twMerge(
            "flex-1 min-w-0 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-dashboard-panel-gap",
            contentPaddingClassName ?? "p-dashboard-panel-gap",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
