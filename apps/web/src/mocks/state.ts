import {
  DEFAULT_MOCK_RUNTIME_STATE,
  MOCK_CGM_BACKFILL_MAX_DAYS,
  MOCK_CGM_BACKFILL_MIN_DAYS,
  MOCK_CGM_OPTIONS,
  MOCK_GLUCOSE_EVENT_OPTIONS,
  MOCK_PUMP_OPTIONS,
  type MockCgmSource,
  type MockGlucoseEvent,
  type MockPumpSource,
  type MockRuntimeState,
} from "./types";

const STORAGE_KEY = "glycemicgpt:mock-runtime";
const STATE_EVENT = "glycemicgpt:mock-state-change";
let memoryState: MockRuntimeState = DEFAULT_MOCK_RUNTIME_STATE;

const cgmValues = new Set<MockCgmSource>(
  MOCK_CGM_OPTIONS.map((option) => option.value)
);
const pumpValues = new Set<MockPumpSource>(
  MOCK_PUMP_OPTIONS.map((option) => option.value)
);
const glucoseEventValues = new Set<MockGlucoseEvent>(
  MOCK_GLUCOSE_EVENT_OPTIONS.map((option) => option.value)
);

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function isGlucoseUnit(value: unknown): value is MockRuntimeState["glucoseUnit"] {
  return value === "mgdl" || value === "mmol";
}

function normalizeDisplayName(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return DEFAULT_MOCK_RUNTIME_STATE.displayName;
  }

  return value.trim().slice(0, 100) || null;
}

function normalizeState(input: unknown): MockRuntimeState {
  if (!input || typeof input !== "object") {
    return DEFAULT_MOCK_RUNTIME_STATE;
  }

  const candidate = input as Partial<MockRuntimeState>;
  const cgmSource = cgmValues.has(candidate.cgmSource as MockCgmSource)
    ? (candidate.cgmSource as MockCgmSource)
    : DEFAULT_MOCK_RUNTIME_STATE.cgmSource;
  const pumpSource = pumpValues.has(candidate.pumpSource as MockPumpSource)
    ? (candidate.pumpSource as MockPumpSource)
    : DEFAULT_MOCK_RUNTIME_STATE.pumpSource;
  const glucoseEvent = glucoseEventValues.has(
    candidate.glucoseEvent as MockGlucoseEvent
  )
    ? (candidate.glucoseEvent as MockGlucoseEvent)
    : DEFAULT_MOCK_RUNTIME_STATE.glucoseEvent;
  const glucoseUnit = isGlucoseUnit(candidate.glucoseUnit)
    ? candidate.glucoseUnit
    : DEFAULT_MOCK_RUNTIME_STATE.glucoseUnit;
  const backfillDays =
    typeof candidate.cgmBackfillDays === "number" &&
    Number.isFinite(candidate.cgmBackfillDays)
      ? Math.max(
          MOCK_CGM_BACKFILL_MIN_DAYS,
          Math.min(
            MOCK_CGM_BACKFILL_MAX_DAYS,
            Math.round(candidate.cgmBackfillDays)
          )
        )
      : DEFAULT_MOCK_RUNTIME_STATE.cgmBackfillDays;

  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : DEFAULT_MOCK_RUNTIME_STATE.enabled,
    cgmSource,
    pumpSource,
    cgmBackfillDays: backfillDays,
    liveMode:
      typeof candidate.liveMode === "boolean"
        ? candidate.liveMode
        : DEFAULT_MOCK_RUNTIME_STATE.liveMode,
    glucoseEvent,
    glucoseUnit,
    displayName: normalizeDisplayName(candidate.displayName),
    updatedAt:
      typeof candidate.updatedAt === "string" ? candidate.updatedAt : null,
  };
}

export function getMockRuntimeState(): MockRuntimeState {
  if (!hasWindow()) {
    return memoryState;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_MOCK_RUNTIME_STATE;
  }

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return DEFAULT_MOCK_RUNTIME_STATE;
  }
}

export function setMockRuntimeState(
  patch: Partial<MockRuntimeState>
): MockRuntimeState {
  if (!hasWindow()) {
    memoryState = normalizeState({ ...memoryState, ...patch });
    return memoryState;
  }

  const next = normalizeState({
    ...getMockRuntimeState(),
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(STATE_EVENT, { detail: next }));
  return next;
}

export function subscribeToMockRuntimeState(
  listener: (state: MockRuntimeState) => void
): () => void {
  if (!hasWindow()) {
    return () => {};
  }

  const handleStateEvent = (event: Event) => {
    const customEvent = event as CustomEvent<MockRuntimeState>;
    listener(customEvent.detail ?? getMockRuntimeState());
  };

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      listener(getMockRuntimeState());
    }
  };

  window.addEventListener(STATE_EVENT, handleStateEvent);
  window.addEventListener("storage", handleStorageEvent);

  return () => {
    window.removeEventListener(STATE_EVENT, handleStateEvent);
    window.removeEventListener("storage", handleStorageEvent);
  };
}
