import { ChartLegendSwatch } from "@/components/ChartLegendSwatch";
import type { ForecastUnavailableReason } from "@/lib/api";
import { prettySourceName } from "@/lib/pump/closed-loop-status";
import type { GlucoseForecastLegendProps } from "./GlucoseForecast.types";

function unavailableMessage(
  reason: ForecastUnavailableReason | null,
): string | null {
  switch (reason) {
    case "opted_out":
      return "Forecast overlay off";
    case "needs_pick":
      return "Forecast source needs to be selected in Connections";
    case "source_silent":
      return "Forecast source has no recent data";
    case "stale":
      return "Forecast data is older than 30 minutes";
    default:
      return null;
  }
}

export function GlucoseForecastLegend({
  eligible,
  forecast,
  points,
}: GlucoseForecastLegendProps) {
  if (!eligible || !forecast) {
    return null;
  }

  if (points.length >= 2 && forecast.effective_source) {
    return (
      <span
        className="inline-flex items-center gap-1.5"
        data-testid="forecast-legend"
      >
        <ChartLegendSwatch className="h-0 w-5 rounded-none border-t-2 border-dashed border-data-glucose-forecast bg-transparent" />
        Forecast from {prettySourceName(forecast.effective_source)}
      </span>
    );
  }

  const message = unavailableMessage(forecast.forecast_unavailable_reason);

  return message ? (
    <span
      className="italic text-foreground-secondary"
      data-testid="forecast-legend"
    >
      {message}
    </span>
  ) : null;
}
