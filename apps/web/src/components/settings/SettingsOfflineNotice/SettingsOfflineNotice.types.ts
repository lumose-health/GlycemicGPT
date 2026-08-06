export interface SettingsOfflineNoticeProps {
  isRetrying?: boolean;
  message?: string;
  onRetry: () => void;
}
