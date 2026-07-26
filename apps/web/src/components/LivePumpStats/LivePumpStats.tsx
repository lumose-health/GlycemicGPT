import { twMerge } from "@/lib/ui/twMerge";
import type { LivePumpStatsProps } from "./LivePumpStats.types";

type PumpMetric = {
  ariaLabel: string;
  label: string;
  testId: string;
  value: string;
};

function sanitizeValue(value: number | null | undefined, allowNegative = false) {
  if (value == null) return null;
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  if (!allowNegative && value < 0) return null;
  return value;
}

export function getLivePumpStatsMetrics({
  basalRate,
  batteryPct,
  cobGrams,
  iob,
  reservoirUnits,
}: LivePumpStatsProps): PumpMetric[] {
  const safeIob = sanitizeValue(iob, true);
  const safeBasal = sanitizeValue(basalRate);
  const safeBattery = sanitizeValue(batteryPct);
  const safeReservoir = sanitizeValue(reservoirUnits);
  const safeCob = sanitizeValue(cobGrams);

  const metrics: PumpMetric[] = [
    {
      ariaLabel:
        safeIob !== null
          ? `Insulin on board: ${safeIob.toFixed(2)} units`
          : "Insulin on board: unavailable",
      label: "IOB:",
      testId: "live-pump-iob-value",
      value: safeIob !== null ? `${safeIob.toFixed(2)}u` : "--",
    },
    {
      ariaLabel:
        safeBasal !== null
          ? `Basal rate: ${safeBasal.toFixed(2)} units per hour`
          : "Basal rate: unavailable",
      label: "BASAL:",
      testId: "live-pump-basal-value",
      value: safeBasal !== null ? `${safeBasal.toFixed(2)} u/hr` : "--",
    },
    {
      ariaLabel:
        safeBattery !== null
          ? `Battery: ${Math.round(safeBattery)} percent`
          : "Battery: unavailable",
      label: "BATTERY:",
      testId: "live-pump-battery-value",
      value: safeBattery !== null ? `${Math.round(safeBattery)}%` : "--",
    },
    {
      ariaLabel:
        safeReservoir !== null
          ? `Reservoir: ${safeReservoir.toFixed(0)} units remaining`
          : "Reservoir: unavailable",
      label: "RESERVOIR:",
      testId: "live-pump-reservoir-value",
      value: safeReservoir !== null ? `${Math.round(safeReservoir)}u` : "--",
    },
  ];

  if (safeCob !== null) {
    metrics.push({
      ariaLabel: `Carbs on board: ${Math.round(safeCob)} grams`,
      label: "COB:",
      testId: "live-pump-cob-value",
      value: `${Math.round(safeCob)}g`,
    });
  }

  return metrics;
}

export function LivePumpStats(props: LivePumpStatsProps) {
  const metrics = getLivePumpStatsMetrics(props);

  return (
    <dl
      aria-label="Pump status metrics"
      className={twMerge("divide-y divide-border-default", props.className)}
      data-testid="live-pump-stats"
    >
      {metrics.map((metric) => (
        <div
          aria-label={metric.ariaLabel}
          className="flex min-h-12 items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          data-testid="live-pump-stats-row"
          key={metric.label}
        >
          <dt className="font_metric_caption uppercase text-foreground-primary">
            {metric.label}
          </dt>
          <dd
            className="font_metric_label text-right text-foreground-primary"
            data-testid={metric.testId}
          >
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
