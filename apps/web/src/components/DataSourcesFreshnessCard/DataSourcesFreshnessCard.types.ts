import type {
  CgmSourcesResponse,
  GlookoStatus,
  IntegrationResponse,
  MedtronicConnectStatus,
  NightscoutConnectionResponse,
} from "@/lib/api";

export interface DataSourcesFreshnessCardProps {
  cgmSources?: CgmSourcesResponse | null;
  cgmUpdatedAt?: string | null;
  nightscoutConnections: NightscoutConnectionResponse[];
  dexcom: IntegrationResponse | null;
  embedded?: boolean;
  glooko?: GlookoStatus | null;
  medtronic?: MedtronicConnectStatus | null;
  tandem: IntegrationResponse | null;
  now: number;
}
