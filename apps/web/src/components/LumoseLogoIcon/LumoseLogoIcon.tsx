import { useId, type ReactElement } from "react";
import { twMerge } from "@/lib/ui/twMerge";
import type { LumoseLogoIconProps } from "./LumoseLogoIcon.types";

const SPRITE_PATH = "/static_assets/iconSprite.svg";

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
        "inline h-10 w-10 flex-none text-brand-gradient",
        className,
      )}
      focusable="false"
      role={accessibleTitle ? "img" : undefined}
      viewBox="0 0 268.88 243.31"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          x2="268.88"
          y1="0"
          y2="243.31"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="currentColor" />
          <stop offset="0.48" stopColor="currentColor" stopOpacity="0.86" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.68" />
        </linearGradient>
      </defs>
      <use
        fill={`url(#${gradientId})`}
        href={`${SPRITE_PATH}#lumose-logo-icon-shape`}
      />
    </svg>
  );
}
