import type { HTMLAttributes, ReactNode } from "react";

export type StatusBadgeVariant = "error" | "neutral" | "success" | "warning";

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  variant?: StatusBadgeVariant;
};
