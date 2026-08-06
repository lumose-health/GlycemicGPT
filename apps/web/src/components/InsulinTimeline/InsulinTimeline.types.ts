export type InsulinEventKind =
  | "basal"
  | "bolus"
  | "correction"
  | "automated";

export interface InsulinTimelineEvent {
  timestamp: number;
  units: number;
  kind: InsulinEventKind;
  label: string;
}

export interface InsulinTimelineHover {
  timestamp: number;
  event: InsulinTimelineEvent | null;
}

export interface InsulinTimelineProps {
  cursorSyncKey: string;
  data: InsulinTimelineEvent[];
  error: string | null;
  isLoading: boolean;
  multiDay: boolean;
  onHoverChange: (hover: InsulinTimelineHover | null) => void;
  onRetry: () => void;
  xDomain: [number, number];
}
