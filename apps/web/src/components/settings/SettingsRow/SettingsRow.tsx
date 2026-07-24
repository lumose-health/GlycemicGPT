import { useId } from "react";
import { twMerge } from "@/lib/ui/twMerge";
import type { SettingsRowProps } from "./SettingsRow.types";

export function SettingsRow({
  className,
  control,
  description,
  label,
  labelId,
  ...props
}: SettingsRowProps) {
  const generatedId = useId();
  const resolvedLabelId = labelId ?? generatedId;

  return (
    <div
      {...props}
      className={twMerge(
        "grid gap-4 py-2 md:grid-cols-[minmax(0,1fr)_minmax(12rem,24rem)] md:items-start md:gap-8",
        className,
      )}
    >
      <div className="space-y-1">
        <p
          className="font_body_2 text-foreground-primary"
          id={resolvedLabelId}
        >
          {label}
        </p>
        {description ? (
          <p className="font_body_3 text-foreground-secondary">{description}</p>
        ) : null}
      </div>
      <div className="w-full md:max-w-96">{control}</div>
    </div>
  );
}
