import { twMerge } from "@/lib/ui/twMerge";
import { ChartLegendSwatch } from "../ChartLegendSwatch";
import type { MergedDoseMarkerLayout } from "./MergedGlucoseTrendChart.types";
import {
  formatMergedDoseUnits,
  isAutomatedMergedDose,
  isLongActingMergedDose,
} from "./merged-chart-model";

const DOSE_ROW_HEIGHT_PX = 14;
const DOSE_TOP_PX = 4;

export function MergedDoseOverlay({
  layout,
  plotLeft,
  showValues,
}: {
  layout: readonly MergedDoseMarkerLayout[];
  plotLeft: number;
  showValues: boolean;
}) {
  if (layout.length === 0) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      data-testid="merged-dose-overlay"
    >
      {layout.map((marker, index) => (
        <span
          className="absolute inline-flex h-3 items-center gap-0.5 whitespace-nowrap font_metric_caption text-foreground-primary"
          data-dose-marker
          data-dose-row={marker.row}
          key={`${marker.event.kind}-${marker.event.timestampMs}-${index}`}
          style={{
            left: plotLeft + marker.left,
            top: DOSE_TOP_PX + marker.row * DOSE_ROW_HEIGHT_PX,
          }}
        >
          <ChartLegendSwatch
            className={twMerge(
              "size-2",
              isAutomatedMergedDose(marker.event)
                ? "rotate-45 rounded-none bg-data-insulin-correction"
                : isLongActingMergedDose(marker.event)
                  ? "rounded-pill border border-data-insulin-bolus bg-transparent"
                  : "rounded-pill bg-data-insulin-bolus",
            )}
          />
          {showValues ? (
            <span data-dose-value>{formatMergedDoseUnits(marker.event)}</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
