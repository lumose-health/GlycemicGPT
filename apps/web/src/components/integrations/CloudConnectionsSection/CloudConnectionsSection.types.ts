import type { IntegrationResponse } from "@/lib/api";
import type { ConnectionTarget } from "@/lib/connections/connection-target";

export interface CloudConnectionsSectionProps {
  category?: "all" | "insulin-pumps" | "third-party";
  embedded?: boolean;
  tandem: IntegrationResponse | null;
  tandemEmail: string;
  tandemPassword: string;
  tandemCountry: string;
  isTandemConnecting: boolean;
  isOffline: boolean;
  openConnection?: ConnectionTarget;
  onTandemEmailChange: (value: string) => void;
  onTandemPasswordChange: (value: string) => void;
  onTandemCountryChange: (value: string) => void;
  onConnectTandem: () => Promise<void>;
  onDisconnectTandem: () => Promise<void>;
}
