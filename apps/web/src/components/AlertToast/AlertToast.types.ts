import type { AlertEventData } from "@/hooks/use-glucose-stream";
import type { GlucoseUnit } from "@/lib/glucose-units";

export interface AlertToastProps {
  alert: AlertEventData;
  onDismiss: (id: string) => void;
  unit?: GlucoseUnit;
}
