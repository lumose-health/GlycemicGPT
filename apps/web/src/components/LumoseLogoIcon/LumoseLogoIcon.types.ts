import type { SVGProps } from "react";

export type LumoseLogoIconProps = Omit<
  SVGProps<SVGSVGElement>,
  "children"
> & {
  decorative?: boolean;
  title?: string;
};
