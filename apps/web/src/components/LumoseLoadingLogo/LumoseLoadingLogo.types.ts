import type { HTMLAttributes } from "react";

export type LumoseLoadingLogoProps = Omit<
  HTMLAttributes<HTMLSpanElement>,
  "aria-label" | "children" | "role"
> & {
  decorative?: boolean;
  label?: string;
};
