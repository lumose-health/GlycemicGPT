import type { MedtronicConnectStatus } from "@/lib/api";

export interface MedtronicConnectSettingsProps {
  isOffline: boolean;
  onStatusChange?: (
    status: MedtronicConnectStatus | null,
    loadFailed?: boolean,
  ) => void;
}
