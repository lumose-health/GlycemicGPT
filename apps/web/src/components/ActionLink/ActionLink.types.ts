import type { ComponentProps } from "react";
import type Link from "next/link";

export type ActionLinkVariant = "highlight" | "secondary";

export type ActionLinkProps = ComponentProps<typeof Link> & {
  variant?: ActionLinkVariant;
};
