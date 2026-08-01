import { useId } from "react";
import { twMerge } from "@/lib/ui/twMerge";
import type { SettingsRowProps } from "./SettingsRow.types";

export function SettingsRow({
  className,
  control,
  description,
  label,
  labelAs = "p",
  labelId,
  ...props
}: SettingsRowProps) {
  const generatedId = useId();
  const resolvedLabelId = labelId ?? generatedId;
  const Label = labelAs;

  return (
    <div
      {...props}
      className={twMerge(
        "grid gap-4 py-2 md:grid-cols-[minmax(0,1fr)_minmax(12rem,24rem)] md:items-start md:gap-8",
        className,
      )}
    >
      <div className="space-y-1">
        <Label
          className={
            labelAs === "h2"
              ? "font_poppins font_header_3 text-foreground-primary"
              : "font_body_2 text-foreground-primary"
          }
          id={resolvedLabelId}
        >
          {label}
        </Label>
        {description ? (
          <p className="font_body_3 text-foreground-secondary">{description}</p>
        ) : null}
      </div>
      <div className="w-full md:max-w-96">{control}</div>
    </div>
  );
}
