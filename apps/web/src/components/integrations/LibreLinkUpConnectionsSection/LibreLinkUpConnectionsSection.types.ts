import type { IntegrationResponse } from "@/lib/api";

export interface LibreLinkUpConnectionsSectionProps {
  librelinkup: IntegrationResponse | null;
  librelinkupEmail: string;
  librelinkupPassword: string;
  librelinkupRegion: string;
  embedded?: boolean;
  loadFailed?: boolean;
  onRetry?: () => Promise<void>;
  isLibreLinkUpConnecting: boolean;
  isOffline: boolean;
  onLibreLinkUpEmailChange: (value: string) => void;
  onLibreLinkUpPasswordChange: (value: string) => void;
  onLibreLinkUpRegionChange: (value: string) => void;
  onConnectLibreLinkUp: () => Promise<void>;
  onDisconnectLibreLinkUp: () => Promise<void>;
}
