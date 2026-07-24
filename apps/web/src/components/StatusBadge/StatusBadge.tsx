import { twMerge } from "@/lib/ui/twMerge";
import type { StatusBadgeProps, StatusBadgeVariant } from "./StatusBadge.types";

const VARIANT_CLASS: Record<StatusBadgeVariant, string> = {
  error: "border-signal-error-text text-signal-error-text",
  neutral: "border-border-default text-foreground-secondary",
  success: "border-signal-check-text text-signal-check-text",
  warning: "border-signal-warning-text text-signal-warning-text",
};

export function StatusBadge({
  children,
  className,
  variant = "neutral",
  ...props
}: StatusBadgeProps) {
  return (
    <span
      {...props}
      className={twMerge(
        "font_metric_caption inline-flex w-fit items-center rounded-full border bg-surface-primary px-2.5 py-1",
        VARIANT_CLASS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
