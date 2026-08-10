import type { RawTimeRangeInput } from "./time-range-expressions";
import type { TimeRange } from "./time-ranges";

export interface HistoryWindow {
  from: string;
  to: string;
}

export type HistorySelection =
  | { kind: "preset"; range: TimeRange }
  | { kind: "custom"; window: HistoryWindow; raw?: RawTimeRangeInput; label?: string };

export function getSelectionKey(selection: HistorySelection): string {
  if (selection.kind === "preset") {
    return `preset:${selection.range}`;
  }

  return `custom:${selection.window.from}:${selection.window.to}`;
}

export function getWindowDurationMs(window: HistoryWindow): number {
  const durationMs =
    new Date(window.to).getTime() - new Date(window.from).getTime();
  return Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
}
