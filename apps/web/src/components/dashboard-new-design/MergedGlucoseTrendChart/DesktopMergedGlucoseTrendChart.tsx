"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/base/Button";
import { Icon } from "@/base/Icon";
import { serializeTimeRangeClipboardValue } from "@/lib/glucose/time-range-clipboard";
import { twMerge } from "@/lib/ui/twMerge";
import type { MergedChartRendererProps } from "./MergedGlucoseTrendChart.types";
import { MergedChartLegend } from "./MergedChartLegend";
import { MergedChartStatusMessages } from "./MergedChartStatusMessages";
import { MergedGlucoseTrendSurface } from "./MergedGlucoseTrendSurface";

export function DesktopMergedGlucoseTrendChart({
  className,
  model,
}: MergedChartRendererProps) {
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const xDomain = zoomDomain ?? model.fullDomain;

  useEffect(() => {
    setZoomDomain(null);
    setCopyError(null);
  }, [model.fullDomain]);

  const copyZoomRange = useCallback(async () => {
    if (!zoomDomain) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        serializeTimeRangeClipboardValue({
          from: new Date(zoomDomain[0]).toISOString(),
          to: new Date(zoomDomain[1]).toISOString(),
        })
      );
      setCopyError(null);
    } catch {
      setCopyError("Could not copy zoom range.");
    }
  }, [zoomDomain]);

  return (
    <div
      className={twMerge("min-w-0 px-4 py-4", className)}
      data-testid="desktop-merged-glucose-trend"
    >
      <MergedChartStatusMessages statuses={model.statuses} />
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <MergedChartLegend model={model} />
        {zoomDomain ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="flex items-center gap-1 rounded-button bg-surface-secondary px-2 py-1 font_metric_caption text-foreground-primary hover:bg-surface-tertiary"
              onClick={copyZoomRange}
            >
              <Icon icon="copy" decorative className="size-3.5" />
              Copy Time Range
            </Button>
            <Button
              className="flex items-center gap-1 rounded-button bg-surface-secondary px-2 py-1 font_metric_caption text-foreground-primary hover:bg-surface-tertiary"
              onClick={() => setZoomDomain(null)}
            >
              <Icon icon="zoom-out" decorative className="size-3.5" />
              Reset Time Range
            </Button>
          </div>
        ) : null}
      </div>
      {copyError ? (
        <p className="mb-2 font_metric_caption text-signal-warning-text" role="alert">
          {copyError}
        </p>
      ) : null}
      <MergedGlucoseTrendSurface
        heightClassName="h-[25rem]"
        interactive
        model={model}
        onZoomChange={setZoomDomain}
        xDomain={xDomain}
      />
    </div>
  );
}
