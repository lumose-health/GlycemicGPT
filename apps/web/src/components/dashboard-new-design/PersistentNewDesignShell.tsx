"use client";

import { usePathname } from "next/navigation";

import { AuthDisclaimerGate } from "@/components/auth-disclaimer-gate";
import { AlertNotificationProvider, UserProvider } from "@/providers";

import { Banner } from "./Banner";
import { DashboardTimeRangeProvider } from "./dashboard-time-range-context";
import { DashboardLayout } from "./dashboard-layout";

function SkipLink() {
  return (
    <a
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-button focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-foreground focus:outline-hidden focus:ring-2 focus:ring-border-active focus:ring-offset-2"
      href="#main-content"
    >
      Skip to main content
    </a>
  );
}

export function PersistentNewDesignShell({
  children,
  isMockRuntimeEnabled,
}: {
  children: React.ReactNode;
  isMockRuntimeEnabled: boolean;
}) {
  const pathname = usePathname();
  const usesSettingsLayout =
    pathname === "/settings-new" || pathname.startsWith("/settings-new/");
  const usesNewDesignShell =
    pathname === "/dashboard-new-design" || usesSettingsLayout;

  if (!usesNewDesignShell) {
    return children;
  }

  return (
    <div className="flex h-screen flex-col bg-surface-page">
      <SkipLink />
      <Banner theme={isMockRuntimeEnabled ? "mock" : "default"} />
      <UserProvider>
        <AuthDisclaimerGate>
          <AlertNotificationProvider>
            <DashboardTimeRangeProvider defaultRange="24h">
              <DashboardLayout
                contentPaddingClassName={
                  usesSettingsLayout
                    ? "p-4 lg:p-dashboard-panel-gap"
                    : undefined
                }
              >
                {children}
              </DashboardLayout>
            </DashboardTimeRangeProvider>
          </AlertNotificationProvider>
        </AuthDisclaimerGate>
      </UserProvider>
    </div>
  );
}
