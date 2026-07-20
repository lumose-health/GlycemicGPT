import { twMerge } from "@/lib/ui/twMerge";
import type { ChartLegendSwatchProps } from "./ChartLegendSwatch.types";

export function ChartLegendSwatch({ className }: ChartLegendSwatchProps) {
  return (
    <span
      aria-hidden="true"
      className={twMerge(
        "inline-block size-3 shrink-0 rounded-xs",
        className,
      )}
    />
  );
}
