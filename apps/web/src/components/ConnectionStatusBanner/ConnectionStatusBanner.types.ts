export interface ConnectionStatusBannerProps {
  isReconnecting: boolean;
  hasError?: boolean;
  errorMessage?: string;
  onReconnect?: () => void;
  dismissible?: boolean;
  className?: string;
}
