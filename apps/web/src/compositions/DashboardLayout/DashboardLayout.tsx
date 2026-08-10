"use client";
/**
 * Dashboard Layout Component
 *
 * Story 4.1: Dashboard Layout & Navigation
 * Main layout wrapper for all dashboard pages.
 * Includes sidebar navigation and main content area.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { MobileNav } from "@/components/MobileNav";
import { Sidebar } from "@/components/Sidebar";
import { twMerge } from "@/lib/ui/twMerge";

import type { DashboardLayoutProps } from "./DashboardLayout.types";

export function DashboardLayout({
  children,
  contentPaddingClassName,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [pathname]);

  return (
    <div
      data-dashboard-root
      className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-surface-page"
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
          data-dashboard-scroll-container
          id="main-content"
          ref={mainRef}
          className={twMerge(
            "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:stable] pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-dashboard-panel-gap",
            contentPaddingClassName ?? "p-dashboard-panel-gap",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
