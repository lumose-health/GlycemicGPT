"use client";
/**
 * ConnectionStatusBanner Component
 *
 * Story 4.5: Real-Time Updates via SSE
 * Displays a warning banner when the SSE connection is lost
 * and reconnection attempts are in progress.
 */
import { AlertCircle, RefreshCw, WifiOff, X } from"lucide-react";
import clsx from"clsx";
import { useState } from"react";
export interface ConnectionStatusBannerProps {
  /** Whether the stream is attempting to reconnect */
  isReconnecting: boolean;
  /** Whether there's a connection error */
  hasError?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Callback to trigger manual reconnection */
  onReconnect?: () => void;
  /** Whether the banner can be dismissed */
  dismissible?: boolean;
  /** Additional CSS classes */
  className?: string;
}
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
  const bgColor = isError ?"bg-signal-error-fill/20" :"bg-signal-warning-fill/20";
  const borderColor = isError ?"border-signal-error-fill" :"border-signal-warning-fill";
  const textColor = isError ?"text-signal-error-text" :"text-signal-warning-text";
  const iconColor = isError ?"text-signal-error-text" :"text-signal-warning-text";
  return (
    <div
      className={clsx("rounded-lg border px-4 py-3 flex items-center justify-between gap-3",
        bgColor,
        borderColor,
        className
      )}
      role="alert"
      aria-live="polite"
      data-testid="connection-status-banner"
    >
      <div className="flex items-center gap-3">
        {isReconnecting ? (
          <RefreshCw
            className={clsx("h-5 w-5 motion-safe:animate-spin", iconColor)}
            aria-hidden="true"
          />
        ) : isError ? (
          <WifiOff className={clsx("h-5 w-5", iconColor)} aria-hidden="true" />
        ) : (
          <AlertCircle
            className={clsx("h-5 w-5", iconColor)}
            aria-hidden="true"
          />
        )}
        <span className={clsx("font_body_3", textColor)}>
          {isReconnecting
            ?"Live updates paused. Reconnecting..."
            : errorMessage ||"Connection lost. Unable to receive live updates."}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {onReconnect && isError && (
          <button
            onClick={handleReconnect}
            className={clsx("font_body_3 px-3 py-1 rounded-md transition-colors","bg-signal-error-fill/30 hover:bg-signal-error-fill/50","text-signal-error-text hover:text-signal-error-text"
            )}
            type="button"
          >
            Retry
          </button>
        )}
        {dismissible && (
          <button
            onClick={handleDismiss}
            className={clsx("p-1 rounded-md transition-colors","hover:bg-surface-tertiary/50",
              textColor
            )}
            type="button"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
export default ConnectionStatusBanner;