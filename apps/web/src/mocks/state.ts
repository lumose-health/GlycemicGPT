import {
  DEFAULT_MOCK_RUNTIME_STATE,
  MOCK_AI_CHAT_OPTIONS,
  MOCK_CGM_BACKFILL_MAX_DAYS,
  MOCK_CGM_BACKFILL_MIN_DAYS,
  MOCK_CGM_OPTIONS,
  MOCK_FORECAST_SOURCE_PREFERENCES,
  MOCK_GLUCOSE_EVENT_OPTIONS,
  MOCK_GLUCOSE_FRESHNESS_OPTIONS,
  MOCK_KNOWLEDGE_DOCUMENT_MAX_COUNT,
  MOCK_KNOWLEDGE_DOCUMENT_MIN_COUNT,
  MOCK_PUMP_OPTIONS,
  type MockAIChatScenario,
  type MockCgmSource,
  type MockGlucoseEvent,
  type MockGlucoseFreshness,
  type MockPumpSource,
  type MockRuntimeState,
  type MockUserRole,
} from "./types";

const STORAGE_KEY = "glycemicgpt:mock-runtime";
const STATE_EVENT = "glycemicgpt:mock-state-change";
let memoryState: MockRuntimeState = DEFAULT_MOCK_RUNTIME_STATE;

const cgmValues = new Set<MockCgmSource>(
  MOCK_CGM_OPTIONS.map((option) => option.value),
);
const aiChatScenarioValues = new Set<MockAIChatScenario>(
  MOCK_AI_CHAT_OPTIONS.map((option) => option.value),
);
const pumpValues = new Set<MockPumpSource>(
  MOCK_PUMP_OPTIONS.map((option) => option.value),
);
const glucoseEventValues = new Set<MockGlucoseEvent>(
  MOCK_GLUCOSE_EVENT_OPTIONS.map((option) => option.value),
);
const glucoseFreshnessValues = new Set<MockGlucoseFreshness>(
  MOCK_GLUCOSE_FRESHNESS_OPTIONS.map((option) => option.value),
);
const forecastSourcePreferenceValues = new Set(
  MOCK_FORECAST_SOURCE_PREFERENCES,
);

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function isGlucoseUnit(
  value: unknown,
): value is MockRuntimeState["glucoseUnit"] {
  return value === "mgdl" || value === "mmol";
}

function isUserRole(value: unknown): value is MockUserRole {
  return value === "diabetic" || value === "caregiver";
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

function normalizeSources<TSource extends string>(
  value: unknown,
  validValues: Set<TSource>,
  fallback: TSource[],
): TSource[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return [
    ...new Set(
      value.filter(
        (source): source is TSource =>
          typeof source === "string" && validValues.has(source as TSource),
      ),
    ),
  ];
}

function normalizeState(input: unknown): MockRuntimeState {
  if (!input || typeof input !== "object") {
    return DEFAULT_MOCK_RUNTIME_STATE;
  }

  const candidate = input as Partial<MockRuntimeState> & {
    cgmSource?: unknown;
    pumpSource?: unknown;
  };
  const legacyCgmSources = cgmValues.has(candidate.cgmSource as MockCgmSource)
    ? [candidate.cgmSource as MockCgmSource]
    : DEFAULT_MOCK_RUNTIME_STATE.cgmSources;
  const legacyPumpSources = pumpValues.has(
    candidate.pumpSource as MockPumpSource,
  )
    ? candidate.pumpSource === "none"
      ? []
      : [candidate.pumpSource as MockPumpSource]
    : DEFAULT_MOCK_RUNTIME_STATE.pumpSources;
  const cgmSources = normalizeSources(
    candidate.cgmSources,
    cgmValues,
    legacyCgmSources,
  );
  const pumpSources = normalizeSources(
    candidate.pumpSources,
    pumpValues,
    legacyPumpSources,
  ).filter((source) => source !== "none");
  const glucoseEvent = glucoseEventValues.has(
    candidate.glucoseEvent as MockGlucoseEvent,
  )
    ? (candidate.glucoseEvent as MockGlucoseEvent)
    : DEFAULT_MOCK_RUNTIME_STATE.glucoseEvent;
  const glucoseFreshness = glucoseFreshnessValues.has(
    candidate.glucoseFreshness as MockGlucoseFreshness,
  )
    ? (candidate.glucoseFreshness as MockGlucoseFreshness)
    : DEFAULT_MOCK_RUNTIME_STATE.glucoseFreshness;
  const glucoseUnit = isGlucoseUnit(candidate.glucoseUnit)
    ? candidate.glucoseUnit
    : DEFAULT_MOCK_RUNTIME_STATE.glucoseUnit;
  const aiChatScenario = aiChatScenarioValues.has(
    candidate.aiChatScenario as MockAIChatScenario,
  )
    ? (candidate.aiChatScenario as MockAIChatScenario)
    : DEFAULT_MOCK_RUNTIME_STATE.aiChatScenario;
  const forecastSourcePreference = forecastSourcePreferenceValues.has(
    candidate.forecastSourcePreference as MockRuntimeState["forecastSourcePreference"],
  )
    ? (candidate.forecastSourcePreference as MockRuntimeState["forecastSourcePreference"])
    : DEFAULT_MOCK_RUNTIME_STATE.forecastSourcePreference;
  const backfillDays =
    typeof candidate.cgmBackfillDays === "number" &&
    Number.isFinite(candidate.cgmBackfillDays)
      ? Math.max(
          MOCK_CGM_BACKFILL_MIN_DAYS,
          Math.min(
            MOCK_CGM_BACKFILL_MAX_DAYS,
            Math.round(candidate.cgmBackfillDays),
          ),
        )
      : DEFAULT_MOCK_RUNTIME_STATE.cgmBackfillDays;
  const tandemSyncIntervalMinutes =
    typeof candidate.tandemSyncIntervalMinutes === "number" &&
    Number.isFinite(candidate.tandemSyncIntervalMinutes)
      ? Math.max(
          15,
          Math.min(1440, Math.round(candidate.tandemSyncIntervalMinutes)),
        )
      : DEFAULT_MOCK_RUNTIME_STATE.tandemSyncIntervalMinutes;
  const knowledgeDocumentCount =
    typeof candidate.knowledgeDocumentCount === "number" &&
    Number.isFinite(candidate.knowledgeDocumentCount)
      ? Math.max(
          MOCK_KNOWLEDGE_DOCUMENT_MIN_COUNT,
          Math.min(
            MOCK_KNOWLEDGE_DOCUMENT_MAX_COUNT,
            Math.round(candidate.knowledgeDocumentCount),
          ),
        )
      : DEFAULT_MOCK_RUNTIME_STATE.knowledgeDocumentCount;

  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : DEFAULT_MOCK_RUNTIME_STATE.enabled,
    userRole: isUserRole(candidate.userRole)
      ? candidate.userRole
      : DEFAULT_MOCK_RUNTIME_STATE.userRole,
    apiUnavailable:
      typeof candidate.apiUnavailable === "boolean"
        ? candidate.apiUnavailable
        : DEFAULT_MOCK_RUNTIME_STATE.apiUnavailable,
    aiChatScenario,
    cgmSources,
    pumpSources,
    forecastSourcePreference,
    tandemSyncEnabled:
      typeof candidate.tandemSyncEnabled === "boolean"
        ? candidate.tandemSyncEnabled
        : DEFAULT_MOCK_RUNTIME_STATE.tandemSyncEnabled,
    tandemSyncIntervalMinutes,
    tandemAutomaticSyncShouldFail:
      typeof candidate.tandemAutomaticSyncShouldFail === "boolean"
        ? candidate.tandemAutomaticSyncShouldFail
        : DEFAULT_MOCK_RUNTIME_STATE.tandemAutomaticSyncShouldFail,
    tandemSyncShouldFail:
      typeof candidate.tandemSyncShouldFail === "boolean"
        ? candidate.tandemSyncShouldFail
        : DEFAULT_MOCK_RUNTIME_STATE.tandemSyncShouldFail,
    cgmBackfillDays: backfillDays,
    knowledgeDocumentCount,
    liveMode:
      typeof candidate.liveMode === "boolean"
        ? candidate.liveMode
        : DEFAULT_MOCK_RUNTIME_STATE.liveMode,
    glucoseEvent,
    glucoseFreshness,
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
  patch: Partial<MockRuntimeState>,
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
  listener: (state: MockRuntimeState) => void,
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
