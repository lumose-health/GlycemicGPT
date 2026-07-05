"use client";
/**
 * Dashboard Layout Component
 *
 * Story 4.1: Dashboard Layout & Navigation
 * Main layout wrapper for all dashboard pages.
 * Includes sidebar navigation and main content area.
 */
import { MobileNav, Sidebar } from"./sidebar";
interface DashboardLayoutProps {
  children: React.ReactNode;
}
export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div data-dashboard-root className="flex min-h-0 flex-1 min-w-0 overflow-hidden bg-surface-page">
      {/* Desktop sidebar -- natural flex child, no position:fixed */}
      <Sidebar />
      {/* Main content column */}
      <div data-dashboard-content className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="fixed left-3 top-11 z-40 lg:hidden">
          <MobileNav />
        </div>
        {/* Scrollable content area -- only scrollbar on the page */}
        <main id="main-content" className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 pt-14 lg:pt-4">
          {children}
        </main>
      </div>
    </div>
  );
}
