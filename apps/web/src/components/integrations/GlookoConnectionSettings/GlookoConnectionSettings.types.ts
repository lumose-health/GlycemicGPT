import type { GlookoStatus } from "@/lib/api";

export interface GlookoConnectionSettingsProps {
  isOffline: boolean;
  onStatusChange?: (status: GlookoStatus | null, loadFailed?: boolean) => void;
}
