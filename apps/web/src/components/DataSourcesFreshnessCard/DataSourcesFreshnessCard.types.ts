import type {
  IntegrationResponse,
  NightscoutConnectionResponse,
} from "@/lib/api";

export interface DataSourcesFreshnessCardProps {
  nightscoutConnections: NightscoutConnectionResponse[];
  dexcom: IntegrationResponse | null;
  embedded?: boolean;
  tandem: IntegrationResponse | null;
  now: number;
}
