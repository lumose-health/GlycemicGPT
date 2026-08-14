import type { ReactNode } from "react";
import type {
  HistorySelection,
  HistoryWindow,
} from "@/lib/glucose/history-selection";
import type { QuickRangeOption } from "@/lib/glucose/time-range-expressions";
import type { TimeRange } from "@/lib/glucose/time-ranges";

export type QuickTimeRange = TimeRange | "90d";

export interface DashboardTimeRangePickerProps {
  selection: HistorySelection;
  currentWindow: HistoryWindow | null;
  timeZone: string;
  onChange: (selection: HistorySelection) => void;
  disabled?: boolean;
  maxRangeDays?: number;
  panelMode?: "inline" | "popover";
  presetOnly?: boolean;
  presetRanges?: readonly TimeRange[];
  quickRangeOptions?: readonly QuickRangeOption[];
  showNavigationControls?: boolean;
  toolbarControls?: ReactNode;
}

export interface DashboardTimeRangeQuickSelectProps {
  ranges?: QuickTimeRange[];
  selection: HistorySelection;
  timeZone: string;
  onChange: (selection: HistorySelection) => void;
}
