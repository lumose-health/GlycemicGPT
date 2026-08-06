import Link from "next/link";
import { twMerge } from "@/lib/ui/twMerge";
import type { ActionLinkProps, ActionLinkVariant } from "./ActionLink.types";

const VARIANT_CLASS: Record<ActionLinkVariant, string> = {
  highlight:
    "bg-accent text-accent-foreground hover:bg-accent-hover",
  secondary:
    "border border-border-default bg-surface-primary text-foreground-primary hover:border-border-hover hover:bg-surface-secondary",
};

export function ActionLink({
  children,
  className,
  variant = "highlight",
  ...props
}: ActionLinkProps) {
  return (
    <Link
      {...props}
      className={twMerge(
        "font_poppins font_body_2 inline-flex h-10 items-center justify-center gap-2 rounded-button px-4 shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active",
        VARIANT_CLASS[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}
