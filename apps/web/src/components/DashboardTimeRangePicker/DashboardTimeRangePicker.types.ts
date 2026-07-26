import type { ReactNode } from "react";
import type {
  HistorySelection,
  HistoryWindow,
} from "@/lib/glucose/history-selection";
import type { TimeRange } from "@/lib/glucose/time-ranges";

export type QuickTimeRange = TimeRange | "90d";

export interface DashboardTimeRangePickerProps {
  selection: HistorySelection;
  currentWindow: HistoryWindow | null;
  timeZone: string;
  onChange: (selection: HistorySelection) => void;
  presetOnly?: boolean;
  toolbarControls?: ReactNode;
}

export interface DashboardTimeRangeQuickSelectProps {
  ranges?: QuickTimeRange[];
  selection: HistorySelection;
  timeZone: string;
  onChange: (selection: HistorySelection) => void;
}
