import { useId, type ReactElement } from "react";
import { STATIC_ASSET_ICON_SPRITE_PATH } from "@/lib/staticAssets";
import { twMerge } from "@/lib/ui/twMerge";
import type { LumoseLogoIconProps } from "./LumoseLogoIcon.types";

export function LumoseLogoIcon({
  className,
  decorative = false,
  title = "Lumose logo",
  ...props
}: LumoseLogoIconProps): ReactElement {
  const gradientId = `lumose-logo-gradient-${useId().replaceAll(":", "")}`;
  const accessibleTitle = decorative ? undefined : title;

  return (
    <svg
      {...props}
      aria-hidden={accessibleTitle ? undefined : true}
      aria-label={accessibleTitle}
      className={twMerge(
        "inline h-10 w-10 flex-none text-brand-gradient-middle",
        className,
      )}
      focusable="false"
      role={accessibleTitle ? "img" : undefined}
      viewBox="0 0 268.88 243.31"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="268.88"
          x2="0"
          y1="0"
          y2="243.31"
          gradientUnits="userSpaceOnUse"
        >
          <stop
            offset="0"
            stopColor="var(--color-brand-gradient-start)"
          />
          <stop offset="0.48" stopColor="currentColor" />
          <stop offset="1" stopColor="var(--color-brand-gradient-end)" />
        </linearGradient>
      </defs>
      <use
        fill={`url(#${gradientId})`}
        href={`${STATIC_ASSET_ICON_SPRITE_PATH}#lumose-logo-icon-shape`}
      />
    </svg>
  );
}
