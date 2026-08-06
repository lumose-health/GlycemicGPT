import type {
  NightscoutConnectionCreate,
  NightscoutConnectionCreatedResponse,
  NightscoutConnectionResponse,
  NightscoutConnectionTestResult,
  NightscoutConnectionUpdate,
  NightscoutManualSyncResponse,
} from "@/lib/api";

export interface NightscoutConnectionSettingsProps {
  connections: NightscoutConnectionResponse[];
  embedded?: boolean;
  isOffline: boolean;
  onCreate: (body: NightscoutConnectionCreate) => Promise<void>;
  onDelete: (connectionId: string) => Promise<void>;
  onTest: (connectionId: string) => Promise<NightscoutConnectionTestResult>;
  onSync: (connectionId: string) => Promise<NightscoutManualSyncResponse>;
  onUpdate: (
    connectionId: string,
    patch: NightscoutConnectionUpdate,
  ) => Promise<NightscoutConnectionCreatedResponse>;
}
