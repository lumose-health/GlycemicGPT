import Link from "next/link";
import { Icon } from "@/base/Icon";
import { twMerge } from "@/lib/ui/twMerge";
import type { DashboardSidebarLinkProps } from "./DashboardSidebarLink.types";

export function DashboardSidebarLink({
  activeIcon,
  badge,
  collapsed = false,
  documentNavigation = false,
  href,
  icon,
  isActive = false,
  label,
  onClick,
}: DashboardSidebarLinkProps) {
  const selectedIcon = isActive && activeIcon ? activeIcon : icon;
  const className = twMerge(
    "group relative flex min-h-11 items-center overflow-hidden rounded-panel py-2.5 font_nav_link outline-hidden transition-all duration-200",
    "focus-visible:ring-2 focus-visible:ring-border-active focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary",
    collapsed ? "gap-0 pl-[22px] pr-0" : "gap-3 pl-[22px] pr-3",
    isActive
      ? "bg-surface-elevated text-foreground-primary"
      : "text-foreground-secondary hover:bg-surface-elevated hover:text-foreground-primary",
  );
  const content = (
    <>
      <span
        aria-hidden="true"
        className={twMerge(
          "absolute left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-accent transition-opacity",
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      />
      <span
        aria-hidden="true"
        className={twMerge(
          "absolute inset-y-1 left-1 w-8 rounded-full bg-accent opacity-0 blur-xl transition-opacity",
          isActive ? "opacity-25" : "group-hover:opacity-20",
        )}
      />
      <Icon icon={selectedIcon} decorative className="relative h-5 w-5" />
      <span
        className={twMerge(
          "relative min-w-0 flex-1 truncate whitespace-nowrap transition-all duration-200",
          collapsed ? "max-w-0 opacity-0" : "max-w-full opacity-100",
        )}
      >
        {label}
      </span>
      {badge ? (
        <span
          className={twMerge(
            "relative ml-auto overflow-hidden transition-all duration-200",
            collapsed ? "w-0 opacity-0" : "w-auto opacity-100",
          )}
        >
          {badge}
        </span>
      ) : null}
    </>
  );

  if (documentNavigation) {
    return (
      <a
        aria-current={isActive ? "page" : undefined}
        className={className}
        href={href}
        onClick={onClick}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={className}
      href={href}
      onClick={onClick}
    >
      {content}
    </Link>
  );
}
