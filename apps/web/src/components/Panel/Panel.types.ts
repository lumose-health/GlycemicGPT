import type { HTMLAttributes, ReactNode } from "react";
import type { Stylable } from "@/base/types";

export type PanelHeadingLevel = 2 | 3 | 4;

export type PanelProps = Stylable<"body" | "header" | "heading" | "subheading"> &
  HTMLAttributes<HTMLElement> & {
    disableHeaderDesktop?: boolean;
    disableHeaderMobile?: boolean;
    fullWidthMobile?: boolean;
    heading: ReactNode;
    headingId?: string;
    headingLevel?: PanelHeadingLevel;
    subheading?: ReactNode;
  };
