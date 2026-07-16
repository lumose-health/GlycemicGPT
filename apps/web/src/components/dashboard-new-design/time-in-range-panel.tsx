"use client";

import type { TirBucket } from "@/lib/api";
import { twMerge } from "@/lib/ui/twMerge";
import { Panel } from "@/components/Panel";
import {
  formatPercentage,
  getQualityAssessment,
} from "./time-in-range-bar";

export interface TimeInRangePanelProps {
  buckets: TirBucket[] | null;
  readingsCount: number;
  previousBuckets: TirBucket[] | null;
  previousReadingsCount: number | null;
  error: string | null;
  isLoading?: boolean;
  className?: string;
}

export type TimeInRangePanelContentProps = Omit<TimeInRangePanelProps, "className">;

type TirBucketLabel = TirBucket["label"];

interface RingConfig {
  label: TirBucketLabel;
  displayLabel: string;
  colorClassName: string;
  maxSizeClassName: string;
}

const RING_CONFIGS = [
  {
    label: "urgent_low",
    displayLabel: "Urgent low",
    colorClassName: "text-signal-error-fill",
    maxSizeClassName: "max-w-[4.5rem]",
  },
  {
    label: "low",
    displayLabel: "Low",
    colorClassName: "text-signal-warning-fill",
    maxSizeClassName: "max-w-28",
  },
  {
    label: "in_range",
    displayLabel: "In range",
    colorClassName: "text-signal-check-fill",
    maxSizeClassName: "max-w-48",
  },
  {
    label: "high",
    displayLabel: "High",
    colorClassName: "text-signal-warning-fill",
    maxSizeClassName: "max-w-28",
  },
  {
    label: "urgent_high",
    displayLabel: "Urgent high",
    colorClassName: "text-signal-error-fill",
    maxSizeClassName: "max-w-[4.5rem]",
  },
] satisfies RingConfig[];

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function sanitizePct(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.min(value, 100);
}

function getBucketValue(buckets: TirBucket[] | null, label: TirBucketLabel) {
  const bucket = buckets?.find((item) => item.label === label);

  return {
    pct: sanitizePct(bucket?.pct ?? 0),
    readings: Math.max(0, Math.round(bucket?.readings ?? 0)),
  };
}

function getInRangePct(buckets: TirBucket[] | null): number {
  return getBucketValue(buckets, "in_range").pct;
}

function TimeInRangeRing({
  colorClassName,
  displayLabel,
  pct,
  readings,
  maxSizeClassName,
}: {
  colorClassName: string;
  displayLabel: string;
  pct: number;
  readings: number;
  maxSizeClassName: string;
}) {
  const formattedPct = formatPercentage(pct);
  const strokeLength = (pct / 100) * RING_CIRCUMFERENCE;

  return (
    <div className="grid min-w-0 grid-rows-[12rem_auto_auto] justify-items-center gap-1 text-center">
      <div className="flex h-48 w-full items-end justify-center">
        <svg
          aria-label={`${displayLabel}: ${formattedPct}`}
          className={twMerge(
            "aspect-square w-full min-w-0 shrink text-current",
            colorClassName,
            maxSizeClassName,
          )}
          role="img"
          viewBox="0 0 100 100"
        >
          <circle
            className="text-surface-tertiary"
            cx="50"
            cy="50"
            fill="none"
            r={RING_RADIUS}
            stroke="currentColor"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            fill="none"
            r={RING_RADIUS}
            stroke="currentColor"
            strokeDasharray={`${strokeLength} ${RING_CIRCUMFERENCE}`}
            strokeLinecap="butt"
            strokeWidth="8"
            style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
          />
          <text
            className="fill-foreground-primary font_jetbrains_mono"
            dominantBaseline="middle"
            fontSize="18"
            fontWeight="700"
            textAnchor="middle"
            x="50"
            y="50"
          >
            {formattedPct}
          </text>
        </svg>
      </div>
      <p className="font_metric_caption text-foreground-primary">{displayLabel}</p>
      <p className="font_metric_caption text-foreground-secondary">
        {readings} readings
      </p>
    </div>
  );
}

function TimeInRangeSkeleton() {
  return (
    <div
      aria-label="Loading time in range data"
      className="grid grid-cols-[0.75fr_1fr_1.35fr_1fr_0.75fr] gap-1 py-2 sm:gap-3"
      role="status"
    >
      {RING_CONFIGS.map((ring) => (
        <div
          key={ring.label}
          className="grid min-w-0 grid-rows-[12rem_auto] justify-items-center gap-1"
        >
          <div className="flex h-48 w-full items-end justify-center">
            <div
              className={twMerge(
                "aspect-square w-full animate-pulse rounded-full bg-surface-tertiary",
                ring.maxSizeClassName,
              )}
            />
          </div>
          <div
            className="h-3 w-full max-w-16 animate-pulse rounded-sm bg-surface-tertiary"
          />
        </div>
      ))}
    </div>
  );
}

export function TimeInRangePanel({
  buckets,
  readingsCount,
  previousBuckets,
  previousReadingsCount,
  error,
  isLoading = false,
  className,
}: TimeInRangePanelProps) {
  return (
    <Panel
      aria-busy={isLoading}
      bodyClassName="p-4 sm:p-5"
      className={twMerge("min-w-0", className)}
      heading="Time in Range"
    >
      <TimeInRangePanelContent
        buckets={buckets}
        readingsCount={readingsCount}
        previousBuckets={previousBuckets}
        previousReadingsCount={previousReadingsCount}
        error={error}
        isLoading={isLoading}
      />
    </Panel>
  );
}

export function TimeInRangePanelContent({
  buckets,
  readingsCount,
  previousBuckets,
  previousReadingsCount,
  error,
  isLoading = false,
}: TimeInRangePanelContentProps) {
  const hasData = Boolean(buckets && readingsCount > 0);
  const inRangePct = hasData ? getInRangePct(buckets) : 0;
  const previousInRangePct = previousBuckets ? getInRangePct(previousBuckets) : null;
  const delta =
    previousInRangePct !== null ? Math.round(inRangePct - previousInRangePct) : null;
  const quality = getQualityAssessment(inRangePct);
  const readingsSummary = `${readingsCount.toLocaleString()} readings${
    previousReadingsCount != null
      ? ` compared with ${previousReadingsCount.toLocaleString()} previous`
      : ""
  }`;

  return (
    <div aria-busy={isLoading}>
      {isLoading ? (
        <TimeInRangeSkeleton />
      ) : error ? (
        <p
          className="py-8 text-center font_body_3 text-signal-error-text"
          data-testid="time-in-range-panel-error"
          role="alert"
        >
          {error}
        </p>
      ) : !hasData ? (
        <p
          className="py-8 text-center font_body_3 text-foreground-secondary"
          data-testid="time-in-range-panel-empty"
        >
          No glucose data available for this period.
        </p>
      ) : (
        <div data-testid="time-in-range-panel">
          <div className="mb-3 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font_metric_caption text-foreground-secondary">
              {readingsSummary}
            </p>
            <span aria-hidden="true" className="text-foreground-secondary">·</span>
            <span className={twMerge("font_body_3", quality.colorClass)}>
              {quality.label}
            </span>
            {delta !== null && delta !== 0 ? (
              <span
                className={twMerge(
                  "font_metric_caption",
                  delta > 0 ? "text-signal-check-text" : "text-signal-error-text",
                )}
                data-testid="time-in-range-delta"
              >
                {delta > 0 ? "+" : ""}
                {delta}%
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-[0.75fr_1fr_1.35fr_1fr_0.75fr] items-end gap-1 sm:gap-3">
            {RING_CONFIGS.map((ring) => {
              const bucketValue = getBucketValue(buckets, ring.label);

              return (
                <TimeInRangeRing
                  key={ring.label}
                  colorClassName={ring.colorClassName}
                  displayLabel={ring.displayLabel}
                  pct={bucketValue.pct}
                  readings={bucketValue.readings}
                  maxSizeClassName={ring.maxSizeClassName}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
