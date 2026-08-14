import Link from "next/link";

import { Icon } from "@/base";
import { twMerge } from "@/lib/ui/twMerge";

import type { SidebarBackToAppRegionProps } from "./SidebarBackToAppRegion.types";

export function SidebarBackToAppRegion({
  collapsed = false,
  isVisible,
  onClick,
}: SidebarBackToAppRegionProps) {
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
          href="/dashboard"
          onClick={onClick}
        >
          <Icon
            className="h-5 w-5 shrink-0 rotate-180 transition-transform group-hover:-translate-x-0.5"
            decorative
            icon="chevron"
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
