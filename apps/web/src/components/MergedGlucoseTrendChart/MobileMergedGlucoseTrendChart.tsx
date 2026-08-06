import { twMerge } from "@/lib/ui/twMerge";
import type { MergedChartRendererProps } from "./MergedGlucoseTrendChart.types";
import { MergedChartLegend } from "./MergedChartLegend";
import { MergedChartStatusMessages } from "./MergedChartStatusMessages";
import { MergedGlucoseTrendSurface } from "./MergedGlucoseTrendSurface";

export function MobileMergedGlucoseTrendChart({
  className,
  model,
}: MergedChartRendererProps) {
  return (
    <div
      className={twMerge("min-w-0 px-1 py-2", className)}
      data-testid="mobile-merged-glucose-trend"
    >
      <MergedChartStatusMessages statuses={model.statuses} />
      <MergedGlucoseTrendSurface
        heightClassName="h-80"
        interactive={false}
        compactAxes
        model={model}
        xDomain={model.fullDomain}
      />
      <MergedChartLegend className="mt-3 border-t border-border-default pt-3" model={model} />
    </div>
  );
}
