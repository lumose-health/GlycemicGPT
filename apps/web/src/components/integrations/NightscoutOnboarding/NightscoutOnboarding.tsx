"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/base/Button";
import { Icon } from "@/base/Icon";
import { Checkbox } from "@/components/Checkbox";
import { twMerge } from "@/lib/ui/twMerge";
import { LumoseLoadingLogo } from "@/components/LumoseLoadingLogo";
import { PasswordTextInput } from "@/components/PasswordTextInput";
import { SelectField } from "@/components/SelectField";
import { TextInput } from "@/components/TextInput";
import {
  applyNightscoutOnboarding,
  createNightscoutConnection,
  evaluateNightscoutConnection,
  getNightscoutOnboardingDerivation,
  syncNightscoutConnection,
  type NightscoutApiVersion,
  type NightscoutApplyOnboardingRequest,
  type NightscoutApplyOnboardingResponse,
  type NightscoutAuthType,
  type NightscoutDiscoveryReport,
  type OnboardingDerivation,
  type OnboardingScheduleFieldDerivation,
  type OnboardingScheduleSegment,
} from "@/lib/api";
import {
  getNightscoutOnboardingCredentialErrors,
  nightscoutOnboardingCredentialsSchema,
  nightscoutOverrideSchema,
  type NightscoutOnboardingCredentialErrors,
  type NightscoutOnboardingCredentialField,
} from "./nightscoutOnboarding.schema";
import type { NightscoutOnboardingProps } from "./NightscoutOnboarding.types";

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

// Mirrors the backend `INITIAL_SYNC_WINDOW_DAYS_OPTIONS`. 0 means
// "All available history" (the connection's existing default-window
// behavior applies). Wizard default: 7d -- a sensible first-look
// window. Power users can pick 90d / All.
const SYNC_WINDOW_OPTIONS: readonly { days: number; label: string }[] = [
  { days: 1, label: "1 day" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 0, label: "All" },
];

const DEFAULT_SYNC_WINDOW_DAYS = 7;
const AUTH_TYPE_OPTIONS = [
  { label: "Auto-detect", value: "auto" },
  { label: "API_SECRET", value: "secret" },
  { label: "Bearer token", value: "token" },
];
const API_VERSION_OPTIONS = [
  { label: "Auto-detect", value: "auto" },
  { label: "v1", value: "v1" },
  { label: "v3", value: "v3" },
];

// Step labels used in the progress stepper. Order is load-bearing.
const STEPS = [
  { id: "credentials", label: "Credentials" },
  { id: "evaluating", label: "Reading" },
  { id: "review", label: "Review" },
  { id: "applying", label: "Importing" },
  { id: "done", label: "Done" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

const GLUCOSE_DOMAIN_IMPORT_FIELDS = [
  "target_low",
  "target_high",
  "isf_schedule",
] as const;

// ----------------------------------------------------------------------------
// Reducer state
// ----------------------------------------------------------------------------

interface ImportFlags {
  target_low: boolean;
  target_high: boolean;
  dia_hours: boolean;
  basal_schedule: boolean;
  carb_ratio_schedule: boolean;
  isf_schedule: boolean;
}

interface OverrideValues {
  // Strings so the input controls behave naturally; parsed at submit.
  target_low: string;
  target_high: string;
  dia_hours: string;
}

interface CredentialForm {
  name: string;
  base_url: string;
  credential: string;
  auth_type: NightscoutAuthType;
  api_version: NightscoutApiVersion;
}

interface WizardState {
  step: StepId;
  form: CredentialForm;
  formError: string | null;
  isCreating: boolean;
  // True when the wizard was entered via the re-import deep link
  // (`/connect?connection=<id>`). Skips Step 1; the credentials
  // form is unused. Used by the header / cancel UX to hint at
  // the different intent.
  isReimport: boolean;
  // Step 2
  connectionId: string | null;
  derivation: OnboardingDerivation | null;
  discovery: NightscoutDiscoveryReport | null;
  evaluateError: string | null;
  isEvaluating: boolean;
  evaluatePhase: "idle" | "evaluating" | "syncing" | "deriving";
  // Step 3
  imports: ImportFlags;
  overrides: OverrideValues;
  initialSyncWindowDays: number;
  confirmUnitsUnknown: boolean;
  // Step 4
  isApplying: boolean;
  applyError: string | null;
  applyResult: NightscoutApplyOnboardingResponse | null;
  // Bumped on retry. Effect's dep list includes this so a retry
  // re-fires the same evaluate() chain without needing to clear /
  // re-set `connectionId`.
  evaluateAttempt: number;
}

const INITIAL_STATE: WizardState = {
  step: "credentials",
  form: {
    name: "",
    base_url: "",
    credential: "",
    auth_type: "auto",
    api_version: "auto",
  },
  formError: null,
  isCreating: false,
  isReimport: false,
  connectionId: null,
  derivation: null,
  discovery: null,
  evaluateError: null,
  isEvaluating: false,
  evaluatePhase: "idle",
  imports: {
    target_low: false,
    target_high: false,
    dia_hours: false,
    basal_schedule: false,
    carb_ratio_schedule: false,
    isf_schedule: false,
  },
  overrides: { target_low: "", target_high: "", dia_hours: "" },
  initialSyncWindowDays: DEFAULT_SYNC_WINDOW_DAYS,
  confirmUnitsUnknown: false,
  isApplying: false,
  applyError: null,
  applyResult: null,
  evaluateAttempt: 0,
};

type Action =
  | { type: "form/update"; patch: Partial<CredentialForm> }
  | { type: "form/submitStart" }
  | { type: "form/submitError"; message: string }
  | { type: "form/submitSuccess"; connectionId: string }
  | { type: "evaluate/start"; phase: "evaluating" | "syncing" | "deriving" }
  | { type: "evaluate/retry" }
  | {
      type: "evaluate/success";
      derivation: OnboardingDerivation;
      discovery: NightscoutDiscoveryReport;
    }
  | { type: "evaluate/error"; message: string }
  | { type: "imports/toggle"; field: keyof ImportFlags }
  | { type: "overrides/update"; field: keyof OverrideValues; value: string }
  | { type: "syncWindow/set"; days: number }
  | { type: "unitsConfirm/toggle" }
  | { type: "apply/start" }
  | { type: "apply/success"; result: NightscoutApplyOnboardingResponse }
  | { type: "apply/error"; message: string };

function seedImportsFromDerivation(d: OnboardingDerivation): ImportFlags {
  // Per AC: a field's "Use this?" checkbox defaults to its
  // `default_checked` -- which is true iff the user is at platform
  // default OR the proposal matches current (a no-op). Customized
  // users see the row off by default.
  //
  // When `units_unknown=true`, force glucose-domain rows (target_low,
  // target_high, isf_schedule) OFF regardless of `default_checked`.
  // The user must explicitly opt in AND tick the units-confirm
  // checkbox -- the consequence of importing mmol/L values into a
  // mg/dL canonical store is corrupt targets and ISFs.
  const glucoseSafe = !d.units_unknown;
  return {
    target_low:
      glucoseSafe &&
      d.target_low.default_checked &&
      d.target_low.proposed_value !== null,
    target_high:
      glucoseSafe &&
      d.target_high.default_checked &&
      d.target_high.proposed_value !== null,
    dia_hours:
      d.dia_hours.default_checked && d.dia_hours.proposed_value !== null,
    basal_schedule:
      d.basal_schedule.default_checked &&
      (d.basal_schedule.proposed_segments?.length ?? 0) > 0,
    carb_ratio_schedule:
      d.carb_ratio_schedule.default_checked &&
      (d.carb_ratio_schedule.proposed_segments?.length ?? 0) > 0,
    isf_schedule:
      glucoseSafe &&
      d.isf_schedule.default_checked &&
      (d.isf_schedule.proposed_segments?.length ?? 0) > 0,
  };
}

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case "form/update":
      return {
        ...state,
        form: { ...state.form, ...action.patch },
        formError: null,
      };
    case "form/submitStart":
      return { ...state, isCreating: true, formError: null };
    case "form/submitError":
      return { ...state, isCreating: false, formError: action.message };
    case "form/submitSuccess":
      return {
        ...state,
        isCreating: false,
        connectionId: action.connectionId,
        step: "evaluating",
      };
    case "evaluate/start":
      return {
        ...state,
        isEvaluating: true,
        evaluateError: null,
        evaluatePhase: action.phase,
      };
    case "evaluate/retry":
      return {
        ...state,
        evaluateError: null,
        evaluateAttempt: state.evaluateAttempt + 1,
      };
    case "evaluate/success":
      return {
        ...state,
        isEvaluating: false,
        evaluatePhase: "idle",
        derivation: action.derivation,
        discovery: action.discovery,
        imports: seedImportsFromDerivation(action.derivation),
        step: "review",
      };
    case "evaluate/error":
      return {
        ...state,
        isEvaluating: false,
        evaluatePhase: "idle",
        evaluateError: action.message,
      };
    case "imports/toggle":
      return {
        ...state,
        imports: {
          ...state.imports,
          [action.field]: !state.imports[action.field],
        },
      };
    case "overrides/update":
      return {
        ...state,
        overrides: { ...state.overrides, [action.field]: action.value },
      };
    case "syncWindow/set":
      return { ...state, initialSyncWindowDays: action.days };
    case "unitsConfirm/toggle":
      return { ...state, confirmUnitsUnknown: !state.confirmUnitsUnknown };
    case "apply/start":
      return { ...state, isApplying: true, applyError: null, step: "applying" };
    case "apply/success":
      return {
        ...state,
        isApplying: false,
        applyResult: action.result,
        step: "done",
      };
    case "apply/error":
      // Stay on the review step so the user can correct + retry.
      return {
        ...state,
        isApplying: false,
        applyError: action.message,
        step: "review",
      };
    default:
      return state;
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function formatTime(startMinutes: number): string {
  const h = Math.floor(startMinutes / 60);
  const m = startMinutes % 60;
  const period = h < 12 ? "AM" : "PM";
  const displayHour = h % 12 || 12;
  return `${displayHour}:${m.toString().padStart(2, "0")} ${period}`;
}

function parseOverride(raw: string): number | null {
  const result = nightscoutOverrideSchema.safeParse(raw);
  return result.success ? result.data : null;
}

function anyGlucoseDomainImported(imports: ImportFlags): boolean {
  return GLUCOSE_DOMAIN_IMPORT_FIELDS.some((f) => imports[f]);
}

// ----------------------------------------------------------------------------
// Wizard
// ----------------------------------------------------------------------------

// 36 hex chars + 4 hyphens. Cheap shape-check before we trust an
// untrusted query-param value enough to seed wizard state with it.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deriveInitialState(connectionParam: string | null): WizardState {
  if (connectionParam && UUID_RE.test(connectionParam)) {
    // Re-import deep link: skip Step 1 (credentials already exist on
    // the connection), seed the connection id, jump straight to the
    // evaluating step. The effect that fires on `step === "evaluating"`
    // picks it up from there.
    return {
      ...INITIAL_STATE,
      isReimport: true,
      connectionId: connectionParam,
      step: "evaluating",
    };
  }
  return INITIAL_STATE;
}

export function NightscoutOnboarding(_props: NightscoutOnboardingProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read once at mount. Changing the URL mid-wizard doesn't re-seed
  // (intentional: avoids state thrash if the user copy-pastes a link
  // into the same tab while the wizard is in flight).
  const initialConnection = useMemo(
    () => searchParams?.get("connection") ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [state, dispatch] = useReducer(
    reducer,
    initialConnection,
    deriveInitialState,
  );
  const [credentialErrors, setCredentialErrors] =
    useState<NightscoutOnboardingCredentialErrors>({
      baseUrl: [],
      credential: [],
      name: [],
    });

  // Kick the evaluate + derive chain when we enter step 2. Using
  // ref-as-cache-key so React-strict-mode double-mount in dev
  // doesn't fire two identical evaluate POSTs back-to-back, while
  // a Retry click (which bumps `evaluateAttempt`) still re-fires.
  const evaluateStartedFor = useRef<string | null>(null);
  useEffect(() => {
    if (state.step !== "evaluating") return;
    if (!state.connectionId) return;
    const key = `${state.connectionId}#${state.evaluateAttempt}`;
    if (evaluateStartedFor.current === key) return;
    evaluateStartedFor.current = key;

    // Staleness gate: instead of a closure flag flipped in cleanup
    // (which strict-mode dev unmounts immediately, cancelling the
    // only chain that runs), key the gate to the active attempt.
    // A run is stale iff `evaluateStartedFor.current` has moved on
    // to a different attempt -- which only happens on real Retry,
    // not on a strict-mode double-mount where the same key re-wins.
    const myKey = key;
    const isStale = () => evaluateStartedFor.current !== myKey;

    const run = async () => {
      try {
        dispatch({ type: "evaluate/start", phase: "evaluating" });
        const discovery = await evaluateNightscoutConnection(
          state.connectionId!,
        );
        if (isStale()) return;
        if (!discovery.status_ok) {
          dispatch({
            type: "evaluate/error",
            message:
              discovery.error ||
              "Couldn't read your Nightscout instance. Check the URL and credential.",
          });
          return;
        }
        // The derivation read pulls from `nightscout_profile_snapshots`,
        // which the discovery report does NOT populate. Kick a manual
        // sync after evaluate so the snapshot (and the connection's
        // initial entries) land before we ask the backend to derive
        // proposals. Apply-onboarding's first sync will then be near-
        // idempotent because the cursor has already advanced.
        dispatch({ type: "evaluate/start", phase: "syncing" });
        try {
          await syncNightscoutConnection(state.connectionId!);
        } catch (syncErr) {
          // Don't abort the wizard if sync fails -- derive can still
          // return `has_profile=False` and the review step renders
          // banners for that case. Log to console for triage.
          console.warn(
            "wizard: initial sync failed (continuing to derive)",
            syncErr,
          );
        }
        if (isStale()) return;
        dispatch({ type: "evaluate/start", phase: "deriving" });
        const derivation = await getNightscoutOnboardingDerivation(
          state.connectionId!,
        );
        if (isStale()) return;
        dispatch({ type: "evaluate/success", derivation, discovery });
      } catch (err) {
        if (isStale()) return;
        dispatch({
          type: "evaluate/error",
          message:
            err instanceof Error
              ? err.message
              : "Failed to evaluate connection",
        });
      }
    };
    void run();
  }, [state.step, state.connectionId, state.evaluateAttempt]);

  // Step 1 submit
  const onCreate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (state.isCreating) return;
      const validation = nightscoutOnboardingCredentialsSchema.safeParse({
        apiVersion: state.form.api_version,
        authType: state.form.auth_type,
        baseUrl: state.form.base_url,
        credential: state.form.credential,
        name: state.form.name,
      });
      if (!validation.success) {
        setCredentialErrors(
          getNightscoutOnboardingCredentialErrors({
            apiVersion: state.form.api_version,
            authType: state.form.auth_type,
            baseUrl: state.form.base_url,
            credential: state.form.credential,
            name: state.form.name,
          }),
        );
        return;
      }
      setCredentialErrors({ baseUrl: [], credential: [], name: [] });
      dispatch({ type: "form/submitStart" });
      try {
        const created = await createNightscoutConnection({
          name: validation.data.name,
          base_url: validation.data.baseUrl,
          credential: validation.data.credential || undefined,
          auth_type: validation.data.authType,
          api_version: validation.data.apiVersion,
        });
        if (!created.test.ok) {
          dispatch({
            type: "form/submitError",
            message:
              created.test.error ||
              "Connection saved but the test request failed. Double-check the URL and credential.",
          });
          return;
        }
        dispatch({
          type: "form/submitSuccess",
          connectionId: created.connection.id,
        });
      } catch (err) {
        dispatch({
          type: "form/submitError",
          message:
            err instanceof Error ? err.message : "Failed to create connection.",
        });
      }
    },
    [state.form, state.isCreating],
  );

  // Step 3 → 4 submit
  const onApply = useCallback(async () => {
    if (!state.connectionId || !state.derivation) return;
    if (state.isApplying) return;

    // Server-side validation duplicates this -- we gate client-side
    // for instant feedback rather than waiting on a 409 round-trip.
    if (state.derivation.units_unknown) {
      if (
        anyGlucoseDomainImported(state.imports) &&
        !state.confirmUnitsUnknown
      ) {
        dispatch({
          type: "apply/error",
          message:
            "Confirm your Nightscout units before importing glucose-domain values.",
        });
        return;
      }
    }

    const overrideTargetLow = state.imports.target_low
      ? parseOverride(state.overrides.target_low)
      : null;
    const overrideTargetHigh = state.imports.target_high
      ? parseOverride(state.overrides.target_high)
      : null;
    const overrideDia = state.imports.dia_hours
      ? parseOverride(state.overrides.dia_hours)
      : null;

    const body: NightscoutApplyOnboardingRequest = {
      import_target_low: state.imports.target_low,
      import_target_high: state.imports.target_high,
      import_dia_hours: state.imports.dia_hours,
      import_basal_schedule: state.imports.basal_schedule,
      import_carb_ratio_schedule: state.imports.carb_ratio_schedule,
      import_isf_schedule: state.imports.isf_schedule,
      override_target_low: overrideTargetLow,
      override_target_high: overrideTargetHigh,
      override_dia_hours: overrideDia,
      initial_sync_window_days: state.initialSyncWindowDays,
      confirm_units_unknown: state.confirmUnitsUnknown,
    };

    dispatch({ type: "apply/start" });
    try {
      const result = await applyNightscoutOnboarding(state.connectionId, body);
      dispatch({ type: "apply/success", result });
    } catch (err) {
      dispatch({
        type: "apply/error",
        message: err instanceof Error ? err.message : "Apply failed.",
      });
    }
  }, [
    state.connectionId,
    state.derivation,
    state.imports,
    state.overrides,
    state.initialSyncWindowDays,
    state.confirmUnitsUnknown,
    state.isApplying,
  ]);

  return (
    <div className="bg-surface-page" data-testid="nightscout-wizard">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <WizardHeader currentStep={state.step} isReimport={state.isReimport} />
        <div className="mt-6">
          {state.step === "credentials" && (
            <CredentialsStep
              form={state.form}
              fieldErrors={credentialErrors}
              error={state.formError}
              isCreating={state.isCreating}
              onUpdate={(patch) => {
                dispatch({ type: "form/update", patch });
                const fieldMap: Partial<
                  Record<
                    keyof CredentialForm,
                    NightscoutOnboardingCredentialField
                  >
                > = {
                  base_url: "baseUrl",
                  credential: "credential",
                  name: "name",
                };
                const field =
                  fieldMap[Object.keys(patch)[0] as keyof CredentialForm];
                if (field) {
                  setCredentialErrors((current) => ({
                    ...current,
                    [field]: [],
                  }));
                }
              }}
              onSubmit={onCreate}
            />
          )}
          {state.step === "evaluating" && (
            <EvaluatingStep
              phase={state.evaluatePhase}
              error={state.evaluateError}
              onRetry={() => dispatch({ type: "evaluate/retry" })}
              onCancel={() => router.push("/settings/connections")}
            />
          )}
          {state.step === "review" && state.derivation && (
            <ReviewStep
              derivation={state.derivation}
              discovery={state.discovery}
              imports={state.imports}
              overrides={state.overrides}
              initialSyncWindowDays={state.initialSyncWindowDays}
              confirmUnitsUnknown={state.confirmUnitsUnknown}
              applyError={state.applyError}
              onToggleImport={(field) =>
                dispatch({ type: "imports/toggle", field })
              }
              onUpdateOverride={(field, value) =>
                dispatch({ type: "overrides/update", field, value })
              }
              onSyncWindowChange={(days) =>
                dispatch({ type: "syncWindow/set", days })
              }
              onConfirmUnitsToggle={() =>
                dispatch({ type: "unitsConfirm/toggle" })
              }
              onApply={onApply}
              isApplying={state.isApplying}
            />
          )}
          {state.step === "applying" && <ApplyingStep />}
          {state.step === "done" && state.applyResult && (
            <DoneStep
              result={state.applyResult}
              isReimport={state.isReimport}
              onGoToIntegrations={() => router.push("/settings/connections")}
              onGoToDashboard={() => router.push("/dashboard")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Header / stepper
// ----------------------------------------------------------------------------

function WizardHeader({
  currentStep,
  isReimport,
}: {
  currentStep: StepId;
  isReimport: boolean;
}) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);
  return (
    <div>
      <div className="flex items-center gap-3 text-foreground-primary">
        <Icon decorative icon="cloud" className="h-5 w-5 text-accent" />
        <h1 className="font_header_3">
          {isReimport ? "Re-import from Nightscout" : "Connect Nightscout"}
        </h1>
      </div>
      <p className="font_body_2 text-foreground-secondary mt-1">
        {isReimport
          ? "Re-read your Nightscout profile and pick which updated values to bring into GlycemicGPT. Your existing connection isn't recreated."
          : "Read your existing Nightscout profile and pre-fill your GlycemicGPT settings so you don't start from a blank dashboard."}
      </p>
      <ol
        className="mt-5 flex items-center gap-2 font_body_3"
        aria-label="Wizard progress"
      >
        {STEPS.map((step, idx) => {
          const reached = idx <= currentIndex;
          const isCurrent = idx === currentIndex;
          return (
            <li
              key={step.id}
              className="flex items-center gap-2"
              aria-current={isCurrent ? "step" : undefined}
            >
              <span
                className={twMerge(
                  "inline-flex h-6 w-6 items-center justify-center rounded-pill font_header_4",
                  reached
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface-secondary text-foreground-primary",
                )}
              >
                {idx + 1}
              </span>
              <span
                className={twMerge(
                  "font_ui_label",
                  isCurrent
                    ? "text-foreground-primary"
                    : "text-foreground-secondary",
                )}
              >
                {step.label}
              </span>
              {idx < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="h-px w-6 bg-surface-secondary"
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Step 1 — credentials
// ----------------------------------------------------------------------------

interface CredentialsStepProps {
  form: CredentialForm;
  fieldErrors: NightscoutOnboardingCredentialErrors;
  error: string | null;
  isCreating: boolean;
  onUpdate: (patch: Partial<CredentialForm>) => void;
  onSubmit: (e: FormEvent) => void;
}

function CredentialsStep({
  form,
  fieldErrors,
  error,
  isCreating,
  onUpdate,
  onSubmit,
}: CredentialsStepProps) {
  // useId so this form can theoretically render twice on the same
  // page without colliding `for`/`id` pairs (e.g. if the wizard is
  // ever portaled into a "preview" pane or rendered in a dev story).
  const reactId = useId();
  const nameId = `${reactId}-name`;
  const urlId = `${reactId}-url`;
  const credId = `${reactId}-cred`;
  const authTypeId = `${reactId}-auth`;
  const apiVerId = `${reactId}-apiver`;
  return (
    <form
      onSubmit={onSubmit}
      className="bg-surface-primary rounded-panel p-5 border border-border-default"
      aria-label="Nightscout credentials"
      data-testid="wizard-step-credentials"
    >
      <h2 className="font_header_4 text-foreground-primary">
        Your Nightscout instance
      </h2>
      <p className="font_body_3 text-foreground-secondary mt-1">
        We&apos;ll test the connection before reading your profile.
      </p>
      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextInput
            data-testid="wizard-ns-name"
            disabled={isCreating}
            id={nameId}
            label="Name"
            errorMessages={fieldErrors.name}
            onChange={(event) => onUpdate({ name: event.target.value })}
            placeholder="e.g. Home Loop"
            type="text"
            value={form.name}
          />
          <TextInput
            autoComplete="off"
            data-testid="wizard-ns-url"
            disabled={isCreating}
            id={urlId}
            label="Nightscout URL"
            errorMessages={fieldErrors.baseUrl}
            onChange={(event) => onUpdate({ base_url: event.target.value })}
            placeholder="https://my-ns.example.com"
            type="url"
            value={form.base_url}
          />
        </div>
        <PasswordTextInput
          autoComplete="off"
          data-1p-ignore=""
          data-lpignore="true"
          data-testid="wizard-ns-credential"
          disabled={isCreating}
          helperText="Leave blank for a public read-only instance. Otherwise, use your Nightscout API_SECRET or a bearer token."
          id={credId}
          label="API_SECRET or bearer token"
          errorMessages={fieldErrors.credential}
          onChange={(event) => onUpdate({ credential: event.target.value })}
          optionalText="Optional"
          spellCheck={false}
          value={form.credential}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField
            disabled={isCreating}
            id={authTypeId}
            label="Credential type"
            onChange={(event) =>
              onUpdate({
                auth_type: event.target.value as NightscoutAuthType,
              })
            }
            options={AUTH_TYPE_OPTIONS}
            value={form.auth_type}
          />
          <SelectField
            disabled={isCreating}
            id={apiVerId}
            label="API version"
            onChange={(event) =>
              onUpdate({
                api_version: event.target.value as NightscoutApiVersion,
              })
            }
            options={API_VERSION_OPTIONS}
            value={form.api_version}
          />
        </div>
      </div>
      {error && (
        <div
          className="mt-3 bg-signal-error-fill/10 rounded-panel p-2 px-3 font_body_3 text-signal-error-text flex items-center gap-2"
          role="alert"
          data-testid="wizard-credentials-error"
        >
          <Icon decorative icon="alert" className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}
      <div className="mt-5 flex items-center justify-between">
        <Link
          href="/settings/connections"
          className="font_body_3 text-foreground-secondary hover:text-foreground-primary inline-flex items-center gap-1"
        >
          <Icon decorative icon="chevron" className="h-3 w-3 rotate-180" />{" "}
          Cancel
        </Link>
        <Button
          type="submit"
          disabled={isCreating}
          data-testid="wizard-credentials-submit"
          className={twMerge(
            "px-4 py-2 rounded-panel font_ui_label",
            "bg-accent text-accent-foreground hover:bg-accent-hover",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors flex items-center gap-2",
          )}
        >
          {isCreating ? (
            <Icon decorative icon="sync" className="h-4 w-4 animate-spin" />
          ) : (
            <Icon decorative icon="link" className="h-4 w-4" />
          )}
          Connect &amp; continue
        </Button>
      </div>
    </form>
  );
}

// ----------------------------------------------------------------------------
// Step 2 — evaluating
// ----------------------------------------------------------------------------

interface EvaluatingStepProps {
  phase: "idle" | "evaluating" | "syncing" | "deriving";
  error: string | null;
  onRetry: () => void;
  onCancel: () => void;
}

function EvaluatingStep({
  phase,
  error,
  onRetry,
  onCancel,
}: EvaluatingStepProps) {
  if (error) {
    return (
      <div
        className="bg-surface-primary rounded-panel p-5 border border-signal-error-text"
        data-testid="wizard-step-evaluating"
      >
        <div className="flex items-start gap-3">
          <Icon
            decorative
            icon="alert"
            className="h-5 w-5 text-signal-error-text shrink-0 mt-0.5"
          />
          <div className="flex-1">
            <h2 className="font_header_4 text-foreground-primary">
              We couldn&apos;t read your Nightscout instance
            </h2>
            <p
              className="font_body_2 text-signal-error-text mt-1"
              data-testid="wizard-eval-error"
            >
              {error}
            </p>
            <p className="font_body_3 text-foreground-secondary mt-3">
              Your connection was saved -- you can fix the URL/credential from
              the integrations page, or retry this step.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <Button
            type="button"
            onClick={onCancel}
            className="font_body_3 text-foreground-secondary hover:text-foreground-primary inline-flex items-center gap-1"
          >
            <Icon decorative icon="chevron" className="h-3 w-3 rotate-180" />{" "}
            Back to integrations
          </Button>
          <Button
            type="button"
            onClick={onRetry}
            data-testid="wizard-eval-retry"
            className="px-3 py-1.5 rounded-panel font_metric_label border border-border-default text-foreground-primary hover:bg-surface-secondary"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const label =
    phase === "deriving"
      ? "Building proposals…"
      : phase === "syncing"
        ? "Importing your initial profile…"
        : "Reading your Nightscout profile…";
  return (
    <div
      className="flex flex-col items-center justify-center rounded-panel border border-border-default bg-surface-primary p-8 text-center"
      data-testid="wizard-step-evaluating"
    >
      <LumoseLoadingLogo className="h-8 w-8" label={label} />
      <p className="font_body_2 mt-3 text-foreground-primary">{label}</p>
      <p className="font_body_4 mt-1 text-foreground-secondary">
        This usually takes a few seconds.
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Step 3 — review
// ----------------------------------------------------------------------------

interface ReviewStepProps {
  derivation: OnboardingDerivation;
  discovery: NightscoutDiscoveryReport | null;
  imports: ImportFlags;
  overrides: OverrideValues;
  initialSyncWindowDays: number;
  confirmUnitsUnknown: boolean;
  applyError: string | null;
  onToggleImport: (field: keyof ImportFlags) => void;
  onUpdateOverride: (field: keyof OverrideValues, value: string) => void;
  onSyncWindowChange: (days: number) => void;
  onConfirmUnitsToggle: () => void;
  onApply: () => void;
  isApplying: boolean;
}

function ReviewStep({
  derivation,
  discovery,
  imports,
  overrides,
  initialSyncWindowDays,
  confirmUnitsUnknown,
  applyError,
  onToggleImport,
  onUpdateOverride,
  onSyncWindowChange,
  onConfirmUnitsToggle,
  onApply,
  isApplying,
}: ReviewStepProps) {
  const needsUnitsConfirm = useMemo(
    () => derivation.units_unknown && anyGlucoseDomainImported(imports),
    [derivation.units_unknown, imports],
  );
  const anyImportChecked = useMemo(
    () =>
      imports.target_low ||
      imports.target_high ||
      imports.dia_hours ||
      imports.basal_schedule ||
      imports.carb_ratio_schedule ||
      imports.isf_schedule,
    [imports],
  );
  // Mirror the per-row "did the user type something that won't
  // parse?" check at the top level so Apply can't be clicked while
  // any active override is invalid. Schedules don't take overrides
  // so they're not part of this check.
  const hasInvalidOverride = useMemo(() => {
    const check = (
      flag: boolean,
      proposed: number | null,
      raw: string,
    ): boolean =>
      flag &&
      proposed !== null &&
      raw.trim() !== "" &&
      parseOverride(raw) === null;
    return (
      check(
        imports.target_low,
        derivation.target_low.proposed_value,
        overrides.target_low,
      ) ||
      check(
        imports.target_high,
        derivation.target_high.proposed_value,
        overrides.target_high,
      ) ||
      check(
        imports.dia_hours,
        derivation.dia_hours.proposed_value,
        overrides.dia_hours,
      )
    );
  }, [imports, overrides, derivation]);

  const applyBlocked =
    !anyImportChecked ||
    hasInvalidOverride ||
    (needsUnitsConfirm && !confirmUnitsUnknown);

  return (
    <div
      className="bg-surface-primary rounded-panel p-5 border border-border-default"
      data-testid="wizard-step-review"
    >
      <h2 className="font_header_4 text-foreground-primary">
        Review what we found
      </h2>
      <p className="font_body_3 text-foreground-secondary mt-1">
        Uncheck anything you don&apos;t want to import. Overrides replace the
        Nightscout value with what you type.
      </p>

      {discovery && (
        <div className="mt-3 font_body_3 text-foreground-secondary flex flex-wrap gap-x-4 gap-y-1">
          {discovery.entry_count_estimate > 0 && (
            <span>
              ~{discovery.entry_count_estimate.toLocaleString()} entries
            </span>
          )}
          {discovery.uploaders_detected.length > 0 && (
            <span>
              Uploader{discovery.uploaders_detected.length === 1 ? "" : "s"}:{" "}
              {discovery.uploaders_detected.join(", ")}
            </span>
          )}
          {discovery.server_version && (
            <span>Server {discovery.server_version}</span>
          )}
          {discovery.active_pump_loop && (
            <span>Loop: {discovery.active_pump_loop}</span>
          )}
        </div>
      )}

      {derivation.units_converted && (
        <Banner
          tone="info"
          title="Units converted from mmol/L"
          body="Your Nightscout profile uses mmol/L. We've converted glucose values to mg/dL for storage."
          testId="wizard-banner-units-converted"
        />
      )}

      {derivation.units_unknown && (
        <Banner
          tone="warn"
          title="Couldn't detect glucose units"
          body="Your Nightscout profile didn't report units we recognize. Confirm below before importing target ranges or ISF."
          testId="wizard-banner-units-unknown"
        />
      )}

      {!derivation.has_profile && (
        <Banner
          tone="warn"
          title="No profile detected"
          body="Your Nightscout doesn't have a default profile we can read. You can still import the connection's first sync; settings stay at platform defaults."
          testId="wizard-banner-no-profile"
        />
      )}

      <div className="mt-5 space-y-2">
        <NumericRow
          label="Target low"
          unitsHint="mg/dL"
          checked={imports.target_low}
          onToggle={() => onToggleImport("target_low")}
          current={derivation.target_low.current_value}
          proposed={derivation.target_low.proposed_value}
          override={overrides.target_low}
          onOverrideChange={(v) => onUpdateOverride("target_low", v)}
          field="target_low"
        />
        <NumericRow
          label="Target high"
          unitsHint="mg/dL"
          checked={imports.target_high}
          onToggle={() => onToggleImport("target_high")}
          current={derivation.target_high.current_value}
          proposed={derivation.target_high.proposed_value}
          override={overrides.target_high}
          onOverrideChange={(v) => onUpdateOverride("target_high", v)}
          field="target_high"
        />
        <NumericRow
          label="DIA"
          unitsHint="hours"
          checked={imports.dia_hours}
          onToggle={() => onToggleImport("dia_hours")}
          current={derivation.dia_hours.current_value}
          proposed={derivation.dia_hours.proposed_value}
          override={overrides.dia_hours}
          onOverrideChange={(v) => onUpdateOverride("dia_hours", v)}
          field="dia_hours"
        />
        <ScheduleRow
          label="Basal schedule"
          unitsHint="U/hr"
          checked={imports.basal_schedule}
          onToggle={() => onToggleImport("basal_schedule")}
          derivation={derivation.basal_schedule}
          field="basal_schedule"
        />
        <ScheduleRow
          label="Carb ratio schedule"
          unitsHint="g/U"
          checked={imports.carb_ratio_schedule}
          onToggle={() => onToggleImport("carb_ratio_schedule")}
          derivation={derivation.carb_ratio_schedule}
          field="carb_ratio_schedule"
        />
        <ScheduleRow
          label="ISF schedule"
          unitsHint="mg/dL per U"
          checked={imports.isf_schedule}
          onToggle={() => onToggleImport("isf_schedule")}
          derivation={derivation.isf_schedule}
          field="isf_schedule"
        />
      </div>

      <div className="mt-5">
        <span className="font_ui_label text-foreground-primary">
          Import history for
        </span>
        <p className="font_body_3 text-foreground-secondary mt-0.5">
          How far back to pull your first sync.
        </p>
        <SyncWindowRadioGroup
          value={initialSyncWindowDays}
          onChange={onSyncWindowChange}
        />
      </div>

      {needsUnitsConfirm && (
        <Checkbox
          checked={confirmUnitsUnknown}
          data-testid="wizard-confirm-units-unknown"
          label={
            <span>
              I confirm my Nightscout glucose values are in{" "}
              <strong>mg/dL</strong>. If they&apos;re actually mmol/L, importing
              them will corrupt my targets and ISF.
            </span>
          }
          labelClassName="mt-4"
          onCheckedChange={onConfirmUnitsToggle}
        />
      )}

      {applyError && (
        <div
          className="mt-4 bg-signal-error-fill/10 rounded-panel p-2 px-3 font_body_3 text-signal-error-text flex items-center gap-2"
          role="alert"
          data-testid="wizard-apply-error"
        >
          <Icon decorative icon="alert" className="h-3 w-3 shrink-0" />
          {applyError}
        </div>
      )}

      {applyBlocked && !applyError && (
        <p
          className="mt-3 font_body_3 text-foreground-secondary"
          data-testid="wizard-apply-blocked-hint"
        >
          {!anyImportChecked
            ? "Check at least one setting above to enable Apply."
            : hasInvalidOverride
              ? "Fix the highlighted override before continuing."
              : "Confirm your Nightscout units before continuing."}
        </p>
      )}

      <div className="mt-5 flex items-center justify-between">
        <Link
          href="/settings/connections"
          className="font_body_3 text-foreground-secondary hover:text-foreground-primary inline-flex items-center gap-1"
        >
          <Icon decorative icon="chevron" className="h-3 w-3 rotate-180" />{" "}
          Cancel
        </Link>
        <Button
          type="button"
          onClick={onApply}
          disabled={applyBlocked || isApplying}
          data-testid="wizard-apply"
          className={twMerge(
            "px-4 py-2 rounded-panel font_ui_label",
            "bg-accent text-accent-foreground hover:bg-accent-hover",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors flex items-center gap-2",
          )}
        >
          {isApplying ? (
            <Icon decorative icon="sync" className="h-4 w-4 animate-spin" />
          ) : (
            <Icon decorative icon="check" className="h-4 w-4" />
          )}
          Apply &amp; import
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sync-window radio group (roving tabindex + arrow-key nav per ARIA APG)
// ----------------------------------------------------------------------------

interface SyncWindowRadioGroupProps {
  value: number;
  onChange: (days: number) => void;
}

function SyncWindowRadioGroup({ value, onChange }: SyncWindowRadioGroupProps) {
  // Roving tabindex: only the selected (or first) option is tab-able;
  // arrow keys move focus + selection per WAI-ARIA Authoring Practices
  // for radio groups. Without this, keyboard users tab through every
  // chip individually (and screen readers don't announce them as a
  // grouped choice).
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const currentIndex = Math.max(
    0,
    SYNC_WINDOW_OPTIONS.findIndex((o) => o.days === value),
  );

  const moveTo = (idx: number) => {
    const len = SYNC_WINDOW_OPTIONS.length;
    const next = ((idx % len) + len) % len;
    onChange(SYNC_WINDOW_OPTIONS[next].days);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        moveTo(idx + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        moveTo(idx - 1);
        break;
      case "Home":
        e.preventDefault();
        moveTo(0);
        break;
      case "End":
        e.preventDefault();
        moveTo(SYNC_WINDOW_OPTIONS.length - 1);
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Initial sync window"
      className="mt-2 flex flex-wrap gap-2"
    >
      {SYNC_WINDOW_OPTIONS.map((opt, idx) => {
        const selected = opt.days === value;
        return (
          <Button
            key={opt.days}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={idx === currentIndex ? 0 : -1}
            onClick={() => onChange(opt.days)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            data-testid={`wizard-sync-window-${opt.days}`}
            className={twMerge(
              "px-3 py-1 rounded-pill font_metric_label border transition-colors",
              selected
                ? "border-accent bg-accent/10 text-accent"
                : "border-border-default text-foreground-secondary hover:bg-surface-secondary",
            )}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Diff-table rows
// ----------------------------------------------------------------------------

interface NumericRowProps {
  label: string;
  unitsHint: string;
  checked: boolean;
  onToggle: () => void;
  current: number | null;
  proposed: number | null;
  override: string;
  onOverrideChange: (value: string) => void;
  field: string;
}

function NumericRow({
  label,
  unitsHint,
  checked,
  onToggle,
  current,
  proposed,
  override,
  onOverrideChange,
  field,
}: NumericRowProps) {
  const noProposal = proposed === null;
  // Empty override = "use the Nightscout proposal". Non-empty
  // override that doesn't parse to a positive number is a real
  // user-entered value the wizard would silently drop (parseOverride
  // returns null) -- flag it visibly so the user doesn't end up with
  // the NS proposal believing their typed value won.
  const overrideValidation = nightscoutOverrideSchema.safeParse(override);
  const overrideInvalid =
    checked &&
    !noProposal &&
    override.trim() !== "" &&
    !overrideValidation.success;
  const overrideErrors = overrideInvalid
    ? overrideValidation.error.issues.map((issue) => issue.message)
    : [];
  return (
    <div
      className={twMerge(
        "rounded-panel border p-3 flex flex-wrap items-center gap-3",
        noProposal
          ? "border-border-default opacity-60"
          : overrideInvalid
            ? "border-signal-error-text"
            : "border-border-default",
      )}
      data-testid={`wizard-row-${field}`}
    >
      <Checkbox
        checked={checked}
        disabled={noProposal}
        data-testid={`wizard-import-${field}`}
        label={
          <span className="font_ui_label text-foreground-primary">{label}</span>
        }
        labelClassName="flex-1 min-w-0"
        onCheckedChange={onToggle}
      />
      <div className="font_body_3 text-foreground-secondary flex items-center gap-3">
        <span>
          Currently: <strong>{formatNumber(current)}</strong>
        </span>
        <span aria-hidden="true">→</span>
        <span>
          Nightscout:{" "}
          <strong data-testid={`wizard-proposed-${field}`}>
            {noProposal ? "—" : formatNumber(proposed)}
          </strong>
        </span>
      </div>
      <div className="flex items-end gap-1">
        <TextInput
          containerClassName="w-28"
          data-testid={`wizard-override-${field}`}
          disabled={!checked || noProposal}
          id={`wiz-${field}-override`}
          inputMode="decimal"
          errorMessages={overrideErrors}
          label={`Override ${label}`}
          labelClassName="sr-only"
          min="0"
          onChange={(event) => onOverrideChange(event.target.value)}
          placeholder={
            proposed !== null ? `Use ${formatNumber(proposed).toString()}` : ""
          }
          step="any"
          type="number"
          value={override}
        />
        <span className="font_body_3 text-foreground-secondary">
          {unitsHint}
        </span>
      </div>
    </div>
  );
}

interface ScheduleRowProps {
  label: string;
  unitsHint: string;
  checked: boolean;
  onToggle: () => void;
  derivation: OnboardingScheduleFieldDerivation;
  field: string;
}

function ScheduleRow({
  label,
  unitsHint,
  checked,
  onToggle,
  derivation,
  field,
}: ScheduleRowProps) {
  const proposed = derivation.proposed_segments;
  const current = derivation.current_segments;
  const noProposal = !proposed || proposed.length === 0;
  // Disclosure state is managed by us (not a native <details>)
  // because putting a checkbox inside <summary> caused the segment
  // preview to toggle on every checkbox click in Safari -- the
  // input click target is part of <summary>'s click region and
  // bubbling control isn't reliable across engines. A plain
  // <Button> for the disclosure trigger keeps the checkbox click
  // strictly local.
  const [isOpen, setIsOpen] = useState(false);
  const panelId = `wiz-${field}-segments-panel`;

  return (
    <div
      className={twMerge(
        "rounded-panel border",
        noProposal
          ? "border-border-default opacity-60"
          : "border-border-default",
      )}
      data-testid={`wizard-row-${field}`}
    >
      <div className="flex flex-wrap items-center gap-3 p-3">
        <Checkbox
          checked={checked}
          disabled={noProposal}
          data-testid={`wizard-import-${field}`}
          label={
            <span className="font_ui_label text-foreground-primary">
              {label}
            </span>
          }
          onCheckedChange={onToggle}
        />
        <div className="font_body_3 text-foreground-secondary flex items-center gap-3 flex-1 min-w-0">
          <span>
            Currently:{" "}
            <strong>
              {current && current.length > 0
                ? `${current.length} segment${current.length === 1 ? "" : "s"}`
                : "—"}
            </strong>
          </span>
          <span aria-hidden="true">→</span>
          <span>
            Nightscout:{" "}
            <strong data-testid={`wizard-proposed-${field}`}>
              {noProposal
                ? "—"
                : `${proposed!.length} segment${proposed!.length === 1 ? "" : "s"}`}
            </strong>
          </span>
        </div>
        {!noProposal && (
          <Button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            aria-expanded={isOpen}
            aria-controls={panelId}
            data-testid={`wizard-toggle-segments-${field}`}
            className="font_body_3 text-foreground-secondary hover:text-foreground-primary inline-flex items-center gap-0.5"
          >
            {isOpen ? "Hide" : "Preview"}
            <Icon
              decorative
              icon="chevron"
              className={twMerge(
                "h-3 w-3 transition-transform",
                isOpen && "rotate-90",
              )}
            />
          </Button>
        )}
      </div>
      {!noProposal && isOpen && (
        <div id={panelId} className="px-3 pb-3 -mt-1">
          <div className="rounded-panel bg-surface-page border border-border-default overflow-hidden">
            <table className="w-full font_body_3">
              <thead className="text-foreground-secondary">
                <tr>
                  <th className="text-left px-3 py-1 font_ui_label">Time</th>
                  <th className="text-right px-3 py-1 font_ui_label">
                    Value ({unitsHint})
                  </th>
                </tr>
              </thead>
              <tbody className="text-foreground-primary">
                {proposed!.map((seg: OnboardingScheduleSegment) => (
                  <tr
                    key={seg.start_minutes}
                    className="border-t border-border-default"
                  >
                    <td className="font_ui_mono_value px-3 py-1">
                      {formatTime(seg.start_minutes)}
                    </td>
                    <td className="font_ui_mono_value px-3 py-1 text-right">
                      {formatNumber(seg.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatNumber(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (Number.isInteger(v)) return String(v);
  // Trim trailing zeros only after the decimal point. The previous
  // pattern `/\.?0+$/` is also safe (since `0+` can't cross `.`) but
  // this form is unambiguous on inspection.
  return v.toFixed(2).replace(/\.0+$|(\.\d*?)0+$/, "$1");
}

// ----------------------------------------------------------------------------
// Step 4 — applying
// ----------------------------------------------------------------------------

function ApplyingStep() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-panel border border-border-default bg-surface-primary p-8 text-center"
      data-testid="wizard-step-applying"
    >
      <LumoseLoadingLogo
        className="h-8 w-8"
        label="Saving settings and importing your first sync"
      />
      <p className="font_body_2 mt-3 text-foreground-primary">
        Saving settings and importing your first sync…
      </p>
      <p className="font_body_4 mt-1 text-foreground-secondary">
        This can take up to 20 seconds.
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Step 5 — done
// ----------------------------------------------------------------------------

interface DoneStepProps {
  result: NightscoutApplyOnboardingResponse;
  isReimport: boolean;
  onGoToIntegrations: () => void;
  onGoToDashboard: () => void;
}

function DoneStep({
  result,
  isReimport,
  onGoToIntegrations,
  onGoToDashboard,
}: DoneStepProps) {
  // Only render setting-domain fields. The backend's `applied` map
  // also surfaces non-setting flags like `initial_sync_window_days`
  // (which is a connection-level config, not a settings import);
  // listing it under "We imported:" would mislead the user into
  // thinking it's a glucose / insulin setting.
  const appliedFields = useMemo(
    () =>
      Object.entries(result.applied).filter(
        ([k, v]) => v === true && SETTING_FIELD_LABELS[k] !== undefined,
      ),
    [result.applied],
  );
  const syncOk = result.first_sync_status === "ok";
  const syncTimeout = result.first_sync_status === "timeout";

  return (
    <div
      className="bg-surface-primary rounded-panel p-5 border border-border-default"
      data-testid="wizard-step-done"
    >
      <div className="flex items-center gap-2 text-signal-check-text">
        <Icon decorative icon="check" className="h-5 w-5" />
        <h2 className="font_header_4 text-foreground-primary">
          {isReimport ? "Settings updated" : "Connected"}
        </h2>
      </div>

      {appliedFields.length > 0 ? (
        <div className="mt-3">
          <p className="font_body_2 text-foreground-secondary">
            {isReimport ? "We refreshed:" : "We imported:"}
          </p>
          <ul className="mt-1 space-y-1" data-testid="wizard-done-applied-list">
            {appliedFields.map(([field]) => (
              <li
                key={field}
                className="flex items-center gap-2 font_body_2 text-foreground-primary"
              >
                <Icon
                  decorative
                  icon="check"
                  className="h-3 w-3 text-signal-check-text"
                />
                <span>{labelForField(field)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 font_body_2 text-foreground-secondary">
          {isReimport
            ? "No setting changes were applied. Your existing settings are unchanged."
            : "No settings were imported. Your connection is saved -- you can sync data without changing any settings."}
        </p>
      )}

      <div className="mt-4">
        {syncOk && result.sync_result && <SyncStatusLine result={result} />}
        {syncTimeout && (
          <p
            className="font_body_3 text-signal-warning-text flex items-center gap-1"
            data-testid="wizard-sync-timeout"
          >
            <Icon decorative icon="alert" className="h-3 w-3" /> Your first sync
            is still running -- check the integrations page in a moment.
          </p>
        )}
        {result.first_sync_status === "error" && (
          <p
            className="font_body_3 text-signal-error-text flex items-center gap-1"
            data-testid="wizard-sync-error"
          >
            <Icon decorative icon="x" className="h-3 w-3" /> Settings saved, but
            the first sync hit an error:{" "}
            {result.first_sync_error || "unknown error"}
          </p>
        )}
        {result.first_sync_status === "skipped" && (
          <p className="font_body_3 text-foreground-secondary">
            First sync was skipped.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2 justify-end">
        <Button
          type="button"
          onClick={onGoToIntegrations}
          className="px-3 py-1.5 rounded-panel font_metric_label border border-border-default text-foreground-primary hover:bg-surface-secondary"
          data-testid="wizard-done-back-integrations"
        >
          Back to integrations
        </Button>
        <Button
          type="button"
          onClick={onGoToDashboard}
          className="px-4 py-2 rounded-panel font_ui_label bg-accent text-accent-foreground hover:bg-accent-hover"
          data-testid="wizard-done-dashboard"
        >
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}

function SyncStatusLine({
  result,
}: {
  result: NightscoutApplyOnboardingResponse;
}) {
  if (!result.sync_result) return null;
  const sr = result.sync_result;
  const inserted =
    sr.entries_inserted +
    sr.treatments_inserted_pump +
    sr.treatments_inserted_glucose +
    sr.devicestatuses_inserted;
  return (
    <p
      className="font_body_3 text-signal-check-text flex items-center gap-1"
      data-testid="wizard-sync-ok"
    >
      <Icon decorative icon="check" className="h-3 w-3" /> Imported{" "}
      {inserted.toLocaleString()} record
      {inserted === 1 ? "" : "s"} in {sr.duration_ms}ms.
    </p>
  );
}

const SETTING_FIELD_LABELS: Record<string, string> = {
  target_low: "Target low",
  target_high: "Target high",
  dia_hours: "DIA",
  basal_schedule: "Basal schedule",
  carb_ratio_schedule: "Carb ratio schedule",
  isf_schedule: "ISF schedule",
};

function labelForField(field: string): string {
  return SETTING_FIELD_LABELS[field] ?? field;
}

function Banner({
  tone,
  title,
  body,
  testId,
}: {
  tone: "info" | "warn";
  title: string;
  body: string;
  testId: string;
}) {
  return (
    <div
      className={twMerge(
        "mt-4 rounded-panel p-3 font_body_3 border",
        tone === "info"
          ? "bg-accent/10 border-accent text-accent"
          : "bg-signal-warning-fill/10 border-signal-warning-text text-signal-warning-text",
      )}
      // Warning banners are safety-critical (units-unknown corrupts
      // glucose targets if user picks wrong); promote to `alert` so
      // assistive tech interrupts. Info banners stay `status`.
      role={tone === "warn" ? "alert" : "status"}
      data-testid={testId}
    >
      <p className="font_ui_label font_body_2">{title}</p>
      <p className="mt-1 opacity-90">{body}</p>
    </div>
  );
}
