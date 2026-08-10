import type { IntegrationResponse } from "@/lib/api";

export interface CgmConnectionsSectionProps {
  dexcom: IntegrationResponse | null;
  dexcomEmail: string;
  dexcomPassword: string;
  dexcomRegion: string;
  embedded?: boolean;
  isDexcomConnecting: boolean;
  isOffline: boolean;
  onDexcomEmailChange: (value: string) => void;
  onDexcomPasswordChange: (value: string) => void;
  onDexcomRegionChange: (value: string) => void;
  onConnectDexcom: () => Promise<void>;
  onDisconnectDexcom: () => Promise<void>;
}
