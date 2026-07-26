import Link from "next/link";

import { Icon } from "@/base";
import { LumoseLogoIcon } from "@/components/LumoseLogoIcon";
import { twMerge } from "@/lib/ui/twMerge";

import type { LumoseLogoProps } from "./LumoseLogo.types";

export function LumoseLogo({
  className = "h-auto w-[33px]",
  collapsed = false,
  onClick,
}: LumoseLogoProps) {
  return (
    <Link
      className="rounded-button outline-hidden focus-visible:ring-2 focus-visible:ring-border-active focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary"
      href="/dashboard"
      onClick={onClick}
    >
      <span
        aria-label="Lumose"
        className={twMerge(
          "flex items-center text-foreground-primary transition-all duration-200",
          collapsed ? "gap-0" : "gap-2.5",
        )}
        role="img"
      >
        <LumoseLogoIcon
          className={twMerge(className, "aspect-[268.88/243.31]")}
          decorative
        />
        <span
          className={twMerge(
            "min-w-0 overflow-hidden whitespace-nowrap transition-all duration-200",
            collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100",
          )}
        >
          <Icon
            className="ml-1.5 mt-0.5 text-foreground-primary"
            decorative
            icon="logo-text"
          />
        </span>
      </span>
    </Link>
  );
}
