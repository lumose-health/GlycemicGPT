import { Icon } from "@/base";

export function DashboardQueryStatus({
  hasBackgroundError,
  isUpdating,
  rangeLabel,
}: {
  hasBackgroundError: boolean;
  isUpdating: boolean;
  rangeLabel?: string;
}) {
  const isActive = hasBackgroundError || isUpdating;

  return (
    <div
      className={
        !isActive
          ? "sr-only"
          : hasBackgroundError
            ? "flex items-center gap-2 font_body_4 text-signal-warning-text"
            : "flex items-center gap-2 font_body_4 text-foreground-secondary"
      }
      role="status"
      aria-live="polite"
    >
      {isActive ? (
        <>
          <Icon
            className={
              isUpdating && !hasBackgroundError ? "animate-spin" : undefined
            }
            decorative
            icon={hasBackgroundError ? "alert" : "clock"}
          />
          <span>
            {hasBackgroundError
              ? "Unable to refresh. Showing previously loaded data."
              : `Updating${rangeLabel ? ` to ${rangeLabel}` : ""}`}
          </span>
        </>
      ) : null}
    </div>
  );
}
