import type { GlucoseUnit } from "@/lib/glucose-units";

export type MockCgmSource =
  | "dexcom"
  | "nightscout-loop"
  | "nightscout-aaps"
  | "nightscout-trio"
  | "nightscout-oref0"
  | "xdrip"
  | "librelink"
  | "share2nightscout"
  | "glooko";

export type MockPumpSource =
  | "none"
  | "mdi"
  | "tandem"
  | "medtronic-connect"
  | "medtronic-carelink"
  | "omnipod-glooko"
  | "loop-nightscout"
  | "aaps-nightscout"
  | "trio-nightscout"
  | "oref0-nightscout"
  | "mobile-plugin";

export type MockGlucoseEvent =
  | "baseline"
  | "low"
  | "urgent-low"
  | "high"
  | "urgent-high";

export interface MockRuntimeState {
  enabled: boolean;
  cgmSource: MockCgmSource;
  pumpSource: MockPumpSource;
  cgmBackfillDays: number;
  liveMode: boolean;
  glucoseEvent: MockGlucoseEvent;
  glucoseUnit: GlucoseUnit;
  updatedAt: string | null;
}

export interface MockDailyBriefResponse {
  id: string;
  period_start: string;
  period_end: string;
  time_in_range_pct: number;
  average_glucose: number;
  low_count: number;
  high_count: number;
  readings_count: number;
  correction_count: number;
  total_insulin: number | null;
  ai_summary: string;
  ai_model: string;
  ai_provider: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export interface MockOption<TValue extends string> {
  value: TValue;
  label: string;
  description: string;
}

export const MOCK_CGM_BACKFILL_MIN_DAYS = 1;
export const MOCK_CGM_BACKFILL_DEFAULT_DAYS = 30;
export const MOCK_CGM_BACKFILL_MAX_DAYS = 365;

export const MOCK_CGM_OPTIONS: MockOption<MockCgmSource>[] = [
  {
    value: "dexcom",
    label: "Dexcom Share",
    description: "Direct CGM cloud connection",
  },
  {
    value: "nightscout-loop",
    label: "Nightscout Loop",
    description: "Loop uploader through Nightscout",
  },
  {
    value: "nightscout-aaps",
    label: "Nightscout AAPS",
    description: "AndroidAPS uploader through Nightscout",
  },
  {
    value: "nightscout-trio",
    label: "Nightscout Trio",
    description: "Trio uploader through Nightscout",
  },
  {
    value: "nightscout-oref0",
    label: "Nightscout oref0",
    description: "OpenAPS uploader through Nightscout",
  },
  {
    value: "xdrip",
    label: "xDrip",
    description: "xDrip bridge data",
  },
  {
    value: "librelink",
    label: "LibreLinkUp",
    description: "LibreLinkUp bridge data",
  },
  {
    value: "share2nightscout",
    label: "share2nightscout",
    description: "Dexcom Share mirrored into Nightscout",
  },
  {
    value: "glooko",
    label: "Glooko CGM",
    description: "CGM data pulled from Glooko",
  },
];

export const MOCK_PUMP_OPTIONS: MockOption<MockPumpSource>[] = [
  {
    value: "none",
    label: "No pump",
    description: "CGM only, no pump telemetry",
  },
  {
    value: "mdi",
    label: "Insulin pens (MDI)",
    description: "Manual rapid and long acting insulin injections",
  },
  {
    value: "tandem",
    label: "Tandem t:connect",
    description: "Tandem cloud sync and Control IQ events",
  },
  {
    value: "medtronic-connect",
    label: "Medtronic Connect",
    description: "Autonomous CarePartner sync",
  },
  {
    value: "medtronic-carelink",
    label: "Medtronic CareLink import",
    description: "Manual CareLink import flow",
  },
  {
    value: "omnipod-glooko",
    label: "Omnipod via Glooko",
    description: "Omnipod 5 data through Glooko",
  },
  {
    value: "loop-nightscout",
    label: "Loop Nightscout",
    description: "Loop pump data from Nightscout",
  },
  {
    value: "aaps-nightscout",
    label: "AAPS Nightscout",
    description: "AndroidAPS pump data from Nightscout",
  },
  {
    value: "trio-nightscout",
    label: "Trio Nightscout",
    description: "Trio pump data from Nightscout",
  },
  {
    value: "oref0-nightscout",
    label: "oref0 Nightscout",
    description: "OpenAPS pump data from Nightscout",
  },
  {
    value: "mobile-plugin",
    label: "Mobile plugin",
    description: "Local plugin pushed pump events",
  },
];

export const MOCK_GLUCOSE_EVENT_OPTIONS: MockOption<MockGlucoseEvent>[] = [
  {
    value: "baseline",
    label: "Baseline",
    description: "Return to generated CGM pattern",
  },
  {
    value: "low",
    label: "Low",
    description: "Recent CGM trends toward 62 mg/dL",
  },
  {
    value: "urgent-low",
    label: "Urgent low",
    description: "Recent CGM trends toward 48 mg/dL",
  },
  {
    value: "high",
    label: "High",
    description: "Recent CGM trends toward 215 mg/dL",
  },
  {
    value: "urgent-high",
    label: "Urgent high",
    description: "Recent CGM trends toward 285 mg/dL",
  },
];

export const DEFAULT_MOCK_RUNTIME_STATE: MockRuntimeState = {
  enabled: false,
  cgmSource: "dexcom",
  pumpSource: "tandem",
  cgmBackfillDays: MOCK_CGM_BACKFILL_DEFAULT_DAYS,
  liveMode: true,
  glucoseEvent: "baseline",
  glucoseUnit: "mgdl",
  updatedAt: null,
};
