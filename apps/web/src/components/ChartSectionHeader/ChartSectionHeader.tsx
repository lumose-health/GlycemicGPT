import { twMerge } from "@/lib/ui/twMerge";
import type { ChartSectionHeaderProps } from "./ChartSectionHeader.types";

export function ChartSectionHeader({
  className,
  details,
  heading,
  message,
  separator = false,
  unit,
}: ChartSectionHeaderProps) {
  return (
    <header
      className={twMerge(
        "flex min-h-8 flex-wrap items-stretch justify-between gap-x-4 gap-y-1 py-1 font_metric_caption",
        separator
          ? "my-1 rounded-panel bg-surface-secondary pr-3 text-foreground-primary"
          : "text-foreground-primary",
        className,
      )}
    >
      <div className="flex min-w-0 items-stretch">
        {unit ? (
          <span className="my-1 flex shrink-0 items-center whitespace-nowrap border-r border-border-active pl-3 pr-3">
            {unit}
          </span>
        ) : null}
        <div
          className={twMerge(
            "flex min-w-0 flex-wrap items-center gap-x-2",
            unit || separator ? "pl-3" : "pl-9",
          )}
        >
          <h3 className="font_metric_label">{heading}</h3>
          {message ? <p>{message}</p> : null}
        </div>
      </div>
      {details ? (
        <div className="ml-auto flex flex-wrap items-center gap-3 self-center">
          {details}
        </div>
      ) : null}
    </header>
  );
}
