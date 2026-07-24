import { twMerge } from "@/lib/ui/twMerge";
import type { SettingsReadOnlyValueProps } from "./SettingsReadOnlyValue.types";

export function SettingsReadOnlyValue({
  className,
  label,
  labelClassName,
  value,
  valueClassName,
  ...props
}: SettingsReadOnlyValueProps) {
  return (
    <div {...props} className={twMerge("space-y-1", className)}>
      <dt
        className={twMerge(
          "font_metric_label text-foreground-secondary",
          labelClassName,
        )}
      >
        {label}
      </dt>
      <dd
        className={twMerge(
          "font_body_2 text-foreground-primary",
          valueClassName,
        )}
      >
        {value}
      </dd>
    </div>
  );
}
