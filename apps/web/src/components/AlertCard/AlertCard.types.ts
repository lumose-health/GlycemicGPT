import type { PredictiveAlert } from "@/lib/api";
import type { GlucoseUnit } from "@/lib/glucose-units";

export interface AlertCardProps {
  alert: PredictiveAlert;
  onAcknowledge: (alertId: string) => Promise<void>;
  isAcknowledging?: boolean;
  unit?: GlucoseUnit;
}
