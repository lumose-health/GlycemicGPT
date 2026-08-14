import { FeedbackMessage } from "@/components/FeedbackMessage";
import type { SettingsOfflineNoticeProps } from "./SettingsOfflineNotice.types";

const DEFAULT_MESSAGE =
  "Unable to connect to the server. Showing locally available values.";

export function SettingsOfflineNotice({
  isRetrying = false,
  message = DEFAULT_MESSAGE,
  onRetry,
}: SettingsOfflineNoticeProps) {
  return (
    <FeedbackMessage
      actionDisabled={isRetrying}
      actionLabel={isRetrying ? "Retrying..." : "Retry connection"}
      message={message}
      onAction={onRetry}
      title="Connection unavailable"
      variant="offline"
    />
  );
}
