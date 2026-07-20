import { Button } from "@/base/Button";
import type { MergedChartStatus } from "./MergedGlucoseTrendChart.types";

export function MergedChartStatusMessages({
  statuses,
}: {
  statuses: MergedChartStatus[];
}) {
  const errors = statuses.filter((status) => status.error);
  const loadingLabels = statuses
    .filter((status) => status.isLoading)
    .map((status) => status.label);

  if (errors.length === 0 && loadingLabels.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1 px-2 pt-2 sm:px-4" aria-live="polite">
      {loadingLabels.length > 0 ? (
        <p className="font_metric_caption text-foreground-secondary">
          Loading {loadingLabels.join(", ")}
        </p>
      ) : null}
      {errors.map((status) => (
        <div
          className="flex flex-wrap items-center gap-2 font_metric_caption text-signal-error-text"
          key={status.label}
          role="alert"
        >
          <span>Unable to load {status.label}</span>
          <Button
            className="rounded-button border border-border-default bg-surface-secondary px-2 py-1 text-foreground-primary hover:bg-surface-tertiary"
            onClick={status.onRetry}
          >
            Retry
          </Button>
        </div>
      ))}
    </div>
  );
}
