import { twMerge } from "@/lib/ui/twMerge";
import {
  formatOverrideRemaining,
  prettySourceName,
  type LoopState,
  type LoopStatusInfo,
  type OverrideInfo,
} from "@/lib/pump/closed-loop-status";
import type { LivePumpStatsProps } from "./LivePumpStats.types";

type PumpMetric = {
  ariaLabel: string;
  label: string;
  testId: string;
  value: string;
};

const automationState: Record<
  LoopState,
  { label: string; textClassName: string }
> = {
  looping: {
    label: "Active",
    textClassName: "text-signal-check-text",
  },
  not_looping: {
    label: "Open loop",
    textClassName: "text-signal-warning-text",
  },
  failed: {
    label: "Cycle failed",
    textClassName: "text-signal-error-text",
  },
};

const rowClassName =
  "flex min-h-12 items-center justify-between gap-4 py-3 first:pt-0 last:pb-0";

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
          className={rowClassName}
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
      {props.loopStatus ? (
        <AutomationStatusRow status={props.loopStatus} />
      ) : null}
      {props.override ? <ActiveModeRow override={props.override} /> : null}
    </dl>
  );
}

function AutomationStatusRow({ status }: { status: LoopStatusInfo }) {
  const state = automationState[status.state];
  const sourceName = prettySourceName(status.source);
  const ariaState =
    status.state === "looping"
      ? "active"
      : status.state === "not_looping"
        ? "open loop"
        : "cycle failed";
  const title =
    status.state === "failed" && status.failureReason
      ? `${sourceName}: ${status.failureReason}`
      : undefined;

  return (
    <div
      aria-label={`${sourceName} insulin automation: ${ariaState}`}
      className={rowClassName}
      data-testid="live-pump-automation-row"
      role="status"
      title={title}
    >
      <dt className="font_metric_caption uppercase text-foreground-primary">
        AUTOMATION:
      </dt>
      <dd className="flex flex-wrap items-center justify-end gap-1.5 text-right">
        <span
          className={twMerge(
            "inline-flex items-center gap-1.5 font_metric_label",
            state.textClassName,
          )}
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-pill bg-current"
          />
          {state.label}
        </span>
        <span className="font_body_3 text-foreground-secondary">
          · {sourceName}
        </span>
      </dd>
    </div>
  );
}

function ActiveModeRow({ override }: { override: OverrideInfo }) {
  const remaining = formatOverrideRemaining(override.endsAt);
  const detail = remaining ? `${remaining} left` : "Ongoing";

  return (
    <div
      aria-label={`Active therapy mode: ${override.name}, ${detail.toLowerCase()}`}
      className={rowClassName}
      data-testid="live-pump-active-mode-row"
      role="status"
    >
      <dt className="font_metric_caption uppercase text-foreground-primary">
        MODE:
      </dt>
      <dd className="flex flex-col items-end text-right">
        <span className="font_metric_label text-foreground-primary">
          {override.name}
        </span>
        <span className="font_body_3 text-foreground-secondary">{detail}</span>
      </dd>
    </div>
  );
}
