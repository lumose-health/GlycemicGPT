"use client";
/**
 * ConnectionStatusBanner Component
 *
 * Story 4.5: Real-Time Updates via SSE
 * Displays a warning banner when the SSE connection is lost
 * and reconnection attempts are in progress.
 */
import { Button, Icon } from "@/base";
import { twMerge } from "@/lib/ui/twMerge";
import { useState } from "react";
import type { ConnectionStatusBannerProps } from "./ConnectionStatusBanner.types";
/**
 * Banner component that displays connection status for real-time updates.
 * Shows when SSE connection is lost or reconnecting.
 */
export function ConnectionStatusBanner({
  isReconnecting,
  hasError = false,
  errorMessage,
  onReconnect,
  dismissible = false,
  className,
}: ConnectionStatusBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  // Don't render if connection is good or banner was dismissed
  if ((!isReconnecting && !hasError) || isDismissed) {
    return null;
  }
  const handleDismiss = () => {
    setIsDismissed(true);
  };
  const handleReconnect = () => {
    setIsDismissed(false);
    onReconnect?.();
  };
  // Determine banner styling based on state
  const isError = hasError && !isReconnecting;
  const bgColor = isError
    ? "bg-signal-error-fill/20"
    : "bg-signal-warning-fill/20";
  const borderColor = isError
    ? "border-signal-error-fill"
    : "border-signal-warning-fill";
  const textColor = isError
    ? "text-signal-error-text"
    : "text-signal-warning-text";
  const iconColor = isError
    ? "text-signal-error-text"
    : "text-signal-warning-text";
  return (
    <div
      className={twMerge(
        "rounded-panel border px-4 py-3 flex items-center justify-between gap-3",
        bgColor,
        borderColor,
        className,
      )}
      role="alert"
      aria-live="polite"
      data-testid="connection-status-banner"
    >
      <div className="flex items-center gap-3">
        {isReconnecting ? (
          <Icon
            decorative
            icon="sync"
            className={twMerge("h-5 w-5", iconColor)}
          />
        ) : isError ? (
          <Icon
            decorative
            icon="wifi-off"
            className={twMerge("h-5 w-5", iconColor)}
          />
        ) : (
          <Icon
            decorative
            icon="alert"
            className={twMerge("h-5 w-5", iconColor)}
          />
        )}
        <span className={twMerge("font_body_3", textColor)}>
          {isReconnecting
            ? "Live updates paused. Reconnecting..."
            : errorMessage ||
              "Connection lost. Unable to receive live updates."}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {onReconnect && isError && (
          <Button
            onClick={handleReconnect}
            className={twMerge(
              "font_body_3 px-3 py-1 rounded-panel transition-colors",
              "bg-signal-error-fill/30 hover:bg-signal-error-fill/50",
              "text-signal-error-text hover:text-signal-error-text",
            )}
            type="button"
          >
            Retry
          </Button>
        )}
        {dismissible && (
          <Button
            onClick={handleDismiss}
            className={twMerge(
              "p-1 rounded-panel transition-colors",
              "hover:bg-surface-tertiary/50",
              textColor,
            )}
            type="button"
            aria-label="Dismiss notification"
          >
            <Icon decorative icon="x" className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
export default ConnectionStatusBanner;
