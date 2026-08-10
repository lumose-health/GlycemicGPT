"use client";

import { Button } from "@/base/Button";
import { twMerge } from "@/lib/ui/twMerge";
import type { TimeRangeQuickSelectProps } from "./TimeRangeQuickSelect.types";

export function TimeRangeQuickSelect<Value extends string>({
  "aria-label": ariaLabel = "Quick time range",
  className,
  disabled = false,
  onChange,
  options,
  value,
}: TimeRangeQuickSelectProps<Value>) {
  return (
    <div
      aria-label={ariaLabel}
      className={twMerge("grid w-full gap-2", className)}
      role="group"
    >
      {options.map((option) => {
        const isActive = value === option.value;

        return (
          <Button
            aria-label={option.accessibleLabel}
            aria-pressed={isActive}
            className={twMerge(
              "font_metric_caption min-h-11 cursor-pointer rounded-button border px-2 transition-colors",
              "focus-visible:ring-2 focus-visible:ring-border-active",
              "disabled:cursor-not-allowed disabled:border-border-disabled disabled:opacity-50",
              isActive
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border-default bg-surface-primary text-foreground-secondary hover:bg-surface-secondary hover:text-foreground-primary",
            )}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
