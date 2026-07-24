import { SecondaryButton } from "@/components/SecondaryButton";
import { twMerge } from "@/lib/ui/twMerge";
import type {
  FeedbackMessageProps,
  FeedbackMessageVariant,
} from "./FeedbackMessage.types";

const VARIANT_CLASS: Record<FeedbackMessageVariant, string> = {
  error: "border-signal-error-text",
  offline: "border-signal-warning-text",
  success: "border-signal-check-text",
  warning: "border-signal-warning-text",
};

const TITLE_CLASS: Record<FeedbackMessageVariant, string> = {
  error: "text-signal-error-text",
  offline: "text-signal-warning-text",
  success: "text-signal-check-text",
  warning: "text-signal-warning-text",
};

export function FeedbackMessage({
  actionDisabled,
  actionLabel,
  className,
  message,
  onAction,
  title,
  variant,
  ...props
}: FeedbackMessageProps) {
  const role = variant === "success" ? "status" : "alert";

  return (
    <div
      {...props}
      aria-live="polite"
      className={twMerge(
        "rounded-panel border bg-surface-primary p-4 text-foreground-primary",
        VARIANT_CLASS[variant],
        className,
      )}
      role={role}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          {title ? (
            <p
              className={twMerge(
                "font_metric_label",
                TITLE_CLASS[variant],
              )}
            >
              {title}
            </p>
          ) : null}
          <p className="font_body_3 text-foreground-primary">{message}</p>
        </div>
        {actionLabel && onAction ? (
          <SecondaryButton disabled={actionDisabled} onClick={onAction}>
            {actionLabel}
          </SecondaryButton>
        ) : null}
      </div>
    </div>
  );
}
