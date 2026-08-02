"use client";

import { useState, useEffect, useCallback, useRef } from "react";

import { Button, Icon } from "@/base";

/**
 * Safety Limits Configuration
 *
 * Allows users to configure platform-enforced safety guardrails for
 * sensor data validation and delivery rate constraints. These limits
 * are synced to the mobile app where they gate data processing.
 */

import { twMerge } from "@/lib/ui/twMerge";
import {
  getSafetyLimits,
  getSafetyLimitsDefaults,
  updateSafetyLimits,
  type SafetyLimitsResponse,
  type SafetyLimitsDefaults,
} from "@/lib/api";
import {
  toDisplayNumber,
  clampMgdl,
  toStoredMgdl,
  formatGlucose,
  unitLabel,
  stepFor,
} from "@/lib/glucose-units";
import { useGlucoseUnit } from "@/hooks/use-glucose-unit";
import { SettingsOfflineNotice } from "@/components/settings/SettingsOfflineNotice";
import { TextInput } from "@/components/TextInput";
import { LoadingState } from "@/components/LoadingState";

import { useUserContext } from "@/providers/user-provider";
import {
  createSafetyLimitsSchema,
  getSafetyLimitsFieldErrors,
} from "./safetyLimits.schema";

// The glucose validation bounds are a medical-safety invariant: they are ALWAYS
// stored, validated, and sent to the API as integer mg/dL.
// mmol users see/enter the bounds in mmol/L; conversion happens only at the
// edges. min_glucose accepts 20-499 mg/dL, max_glucose 21-500 mg/dL.
const MIN_GLUCOSE_BOUNDS = { min: 20, max: 499 };
const MAX_GLUCOSE_BOUNDS = { min: 21, max: 500 };

function getSafetySchemaOptions(unit: ReturnType<typeof useGlucoseUnit>) {
  return {
    allowGlucoseDecimals: unit === "mmol",
    minGlucoseBound: {
      min: toDisplayNumber(MIN_GLUCOSE_BOUNDS.min, unit),
      max: toDisplayNumber(MIN_GLUCOSE_BOUNDS.max, unit),
    },
    maxGlucoseBound: {
      min: toDisplayNumber(MAX_GLUCOSE_BOUNDS.min, unit),
      max: toDisplayNumber(MAX_GLUCOSE_BOUNDS.max, unit),
    },
  };
}

// Hardcoded fallback if the defaults endpoint is unreachable
const FALLBACK_DEFAULTS: SafetyLimitsDefaults = {
  min_glucose_mgdl: 20,
  max_glucose_mgdl: 500,
  max_basal_rate_milliunits: 15000,
  max_bolus_dose_milliunits: 25000,
};

/** Convert milliunits to units for display (3 decimal places to avoid precision loss) */
function milliunitsToUnits(mu: number): string {
  return (mu / 1000).toFixed(3).replace(/\.?0+$/, "");
}

/** Format a display string for the preview (3 decimal places max) */
function formatUnits(raw: string): string {
  const n = parseFloat(raw);
  if (isNaN(n)) return raw;
  return n.toFixed(3).replace(/\.?0+$/, "");
}

/** Convert units to milliunits for API */
function unitsToMilliunits(u: number): number {
  return Math.round(u * 1000);
}

export default function SafetyLimitsPage() {
  const { user } = useUserContext();
  const unit = useGlucoseUnit();
  // Display a stored mg/dL glucose bound as the active-unit string for an input.
  const toDisplay = useCallback(
    (mgdl: number) => formatGlucose(mgdl, unit),
    [unit],
  );
  const [defaults, setDefaults] =
    useState<SafetyLimitsDefaults>(FALLBACK_DEFAULTS);
  const [limits, setLimits] = useState<SafetyLimitsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "reset" | null>(
    null,
  );

  // Form state -- glucose in mg/dL, insulin in units (displayed) backed by milliunits
  const [minGlucose, setMinGlucose] = useState<string>("20");
  const [maxGlucose, setMaxGlucose] = useState<string>("500");
  const [maxBasal, setMaxBasal] = useState<string>("15");
  const [maxBolus, setMaxBolus] = useState<string>("25");

  const fetchLimits = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [data, serverDefaults] = await Promise.all([
        getSafetyLimits(),
        getSafetyLimitsDefaults().catch(() => FALLBACK_DEFAULTS),
      ]);
      setLimits(data);
      setDefaults(serverDefaults);
      setMinGlucose(toDisplay(data.min_glucose_mgdl));
      setMaxGlucose(toDisplay(data.max_glucose_mgdl));
      setMaxBasal(milliunitsToUnits(data.max_basal_rate_milliunits));
      setMaxBolus(milliunitsToUnits(data.max_bolus_dose_milliunits));
      setIsOffline(false);
    } catch (err) {
      if (!(err instanceof Error && err.message.includes("401"))) {
        setIsOffline(true);
      }
      setLimits({
        id: "",
        min_glucose_mgdl: FALLBACK_DEFAULTS.min_glucose_mgdl,
        max_glucose_mgdl: FALLBACK_DEFAULTS.max_glucose_mgdl,
        max_basal_rate_milliunits: FALLBACK_DEFAULTS.max_basal_rate_milliunits,
        max_bolus_dose_milliunits: FALLBACK_DEFAULTS.max_bolus_dose_milliunits,
        updated_at: "",
      });
      setMinGlucose(toDisplay(FALLBACK_DEFAULTS.min_glucose_mgdl));
      setMaxGlucose(toDisplay(FALLBACK_DEFAULTS.max_glucose_mgdl));
      setMaxBasal(
        milliunitsToUnits(FALLBACK_DEFAULTS.max_basal_rate_milliunits),
      );
      setMaxBolus(
        milliunitsToUnits(FALLBACK_DEFAULTS.max_bolus_dose_milliunits),
      );
    } finally {
      setIsLoading(false);
    }
  }, [toDisplay]);

  useEffect(() => {
    fetchLimits();
  }, [fetchLimits]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  const cancelAction = useCallback(() => {
    setShowConfirm(false);
    setPendingAction(null);
  }, []);

  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the Cancel button when the confirmation dialog appears
  useEffect(() => {
    if (showConfirm) {
      cancelButtonRef.current?.focus();
    }
  }, [showConfirm]);

  // Dismiss confirmation dialog on Escape key
  useEffect(() => {
    if (!showConfirm) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelAction();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showConfirm, cancelAction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const validation = createSafetyLimitsSchema(
      getSafetySchemaOptions(unit),
    ).safeParse({ minGlucose, maxGlucose, maxBasal, maxBolus });
    if (!validation.success) {
      setError("Correct the highlighted safety limits before continuing.");
      return;
    }

    // Show confirmation dialog
    setPendingAction("save");
    setShowConfirm(true);
  };

  const executeSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const validation = createSafetyLimitsSchema(
      getSafetySchemaOptions(unit),
    ).safeParse({ minGlucose, maxGlucose, maxBasal, maxBolus });
    if (!validation.success) {
      setError("Correct the highlighted safety limits before saving.");
      setIsSaving(false);
      return;
    }

    const minG = clampMgdl(
      toStoredMgdl(validation.data.minGlucose, unit),
      MIN_GLUCOSE_BOUNDS.min,
      MIN_GLUCOSE_BOUNDS.max,
    );
    const maxG = clampMgdl(
      toStoredMgdl(validation.data.maxGlucose, unit),
      MAX_GLUCOSE_BOUNDS.min,
      MAX_GLUCOSE_BOUNDS.max,
    );
    const basalMu = unitsToMilliunits(validation.data.maxBasal);
    const bolusMu = unitsToMilliunits(validation.data.maxBolus);

    try {
      const updated = await updateSafetyLimits({
        min_glucose_mgdl: minG,
        max_glucose_mgdl: maxG,
        max_basal_rate_milliunits: basalMu,
        max_bolus_dose_milliunits: bolusMu,
      });
      setLimits(updated);
      setMinGlucose(toDisplay(updated.min_glucose_mgdl));
      setMaxGlucose(toDisplay(updated.max_glucose_mgdl));
      setMaxBasal(milliunitsToUnits(updated.max_basal_rate_milliunits));
      setMaxBolus(milliunitsToUnits(updated.max_bolus_dose_milliunits));
      setSuccess("Safety limits updated successfully");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update safety limits",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (isSaving) return;
    setPendingAction("reset");
    setShowConfirm(true);
  };

  const executeReset = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateSafetyLimits({
        min_glucose_mgdl: defaults.min_glucose_mgdl,
        max_glucose_mgdl: defaults.max_glucose_mgdl,
        max_basal_rate_milliunits: defaults.max_basal_rate_milliunits,
        max_bolus_dose_milliunits: defaults.max_bolus_dose_milliunits,
      });
      setLimits(updated);
      setMinGlucose(toDisplay(updated.min_glucose_mgdl));
      setMaxGlucose(toDisplay(updated.max_glucose_mgdl));
      setMaxBasal(milliunitsToUnits(updated.max_basal_rate_milliunits));
      setMaxBolus(milliunitsToUnits(updated.max_bolus_dose_milliunits));
      setSuccess("Safety limits reset to defaults");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reset safety limits",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const confirmAction = async () => {
    setShowConfirm(false);
    if (pendingAction === "save") {
      await executeSave();
    } else if (pendingAction === "reset") {
      await executeReset();
    }
    setPendingAction(null);
  };

  const formValues = { minGlucose, maxGlucose, maxBasal, maxBolus };
  const schemaOptions = getSafetySchemaOptions(unit);
  const validation = createSafetyLimitsSchema(schemaOptions).safeParse(formValues);
  const validationErrors = getSafetyLimitsFieldErrors(formValues, schemaOptions);
  const minGInput = validation.success
    ? validation.data.minGlucose
    : Number(minGlucose);
  const maxGInput = validation.success
    ? validation.data.maxGlucose
    : Number(maxGlucose);
  const basalNum = validation.success ? validation.data.maxBasal : Number(maxBasal);
  const bolusNum = validation.success ? validation.data.maxBolus : Number(maxBolus);
  const basalMuNum = Number.isFinite(basalNum) ? unitsToMilliunits(basalNum) : NaN;
  const bolusMuNum = Number.isFinite(bolusNum) ? unitsToMilliunits(bolusNum) : NaN;
  // Compare glucose in display space so the load-time round-trip "snap"
  // doesn't read as an unsaved change; insulin compares in milliunits.
  const hasChanges =
    limits &&
    (minGlucose !== toDisplay(limits.min_glucose_mgdl) ||
      maxGlucose !== toDisplay(limits.max_glucose_mgdl) ||
      basalMuNum !== limits.max_basal_rate_milliunits ||
      bolusMuNum !== limits.max_bolus_dose_milliunits);
  const isValid = validation.success;

  // Auth guard: wait for user context to resolve
  if (!user) return null;

  // Role guard: only diabetic users and admins should access this page
  if (user.role === "caregiver") {
    return (
      <div className="space-y-6">
        <div data-settings-page-header>
          <h1 className="font_poppins font_header_2">Safety Limits</h1>
        </div>
        <div className="bg-surface-primary rounded-panel p-6 border border-border-default text-center">
          <p className="text-foreground-secondary">
            Safety limits can only be configured by the account owner.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div data-settings-page-header>
        <h1 className="font_poppins font_header_2">Safety Limits</h1>
        <p className="text-foreground-secondary">
          Platform-enforced bounds for data validation and delivery rates
        </p>
      </div>

      {/* About Safety Limits */}
      <div className="bg-surface-elevated rounded-panel p-5 border border-border-default">
        <div className="flex items-start gap-3">
          <Icon
            decorative
            icon="lightbulb"
            className="h-5 w-5 text-signal-warning-text shrink-0 mt-0.5"
          />
          <div className="space-y-2">
            <h2 className="font_ui_label text-foreground-primary">
              About Safety Limits
            </h2>
            <p className="font_body_3 text-foreground-primary">
              Safety limits define the platform-enforced bounds that constrain
              all data processing. These guardrails operate at the platform
              level {"\u2014"} sensor readings outside the configured glucose
              range are flagged as implausible, and delivery rate parameters are
              capped at the configured maximums. These bounds are also enforced
              on any user-compiled extension modules installed into the mobile
              app (e.g., custom data sources or device integrations built using
              the Lumose plugin SDK).
            </p>
            <p className="font_body_3 text-foreground-primary">
              Lumose is an open-source data monitoring and analysis platform. It
              does not provide medical advice, diagnosis, or treatment.
              Configuration of appropriate values and any use of user-compiled
              extensions is solely the responsibility of the end user. The
              platform enforces these bounds as engineering constraints but
              makes no clinical safety guarantees. Consult your healthcare
              provider before adjusting these values. Changes sync to connected
              devices within one hour or on next app launch.
            </p>
          </div>
        </div>
      </div>

      {isOffline && (
        <SettingsOfflineNotice onRetry={fetchLimits} isRetrying={isLoading} />
      )}

      {error && (
        <div
          className="bg-signal-error-fill/10 rounded-panel p-4 border border-signal-error-text"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <Icon
              decorative
              icon="circle-slash"
              className="h-4 w-4 text-signal-error-text shrink-0"
            />
            <p className="font_body_2 text-signal-error-text">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div
          className="bg-signal-check-fill/10 rounded-panel p-4 border border-signal-check-text"
          role="status"
        >
          <div className="flex items-center gap-2">
            <Icon
              decorative
              icon="check"
              className="h-4 w-4 text-signal-check-text shrink-0"
            />
            <p className="font_body_2 text-signal-check-text">{success}</p>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div
          className="bg-signal-warning-fill/10 rounded-panel p-4 border border-signal-warning-text"
          role="alertdialog"
          aria-modal="true"
          aria-label="Confirm safety limits change"
        >
          <div className="flex items-start gap-3">
            <Icon
              decorative
              icon="circle-slash"
              className="h-5 w-5 text-signal-warning-text shrink-0 mt-0.5"
            />
            <div className="flex-1">
              <p className="font_ui_label text-signal-warning-text">
                {pendingAction === "reset"
                  ? "Reset safety limits to defaults?"
                  : "Update safety limits?"}
              </p>
              <p className="font_body_3 text-foreground-secondary mt-1">
                These values control data validation bounds and delivery rate
                constraints enforced across the platform. Changes sync to
                connected devices. Confirm to proceed.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Button
                  type="button"
                  onClick={confirmAction}
                  className={twMerge(
                    "px-3 py-1.5 rounded-panel font_ui_label",
                    "bg-accent text-accent-foreground hover:bg-accent-hover",
                    "transition-colors",
                  )}
                >
                  Confirm
                </Button>
                <Button
                  ref={cancelButtonRef}
                  type="button"
                  onClick={cancelAction}
                  className={twMerge(
                    "px-3 py-1.5 rounded-panel font_ui_label",
                    "bg-surface-secondary text-foreground-primary hover:bg-surface-primary",
                    "transition-colors",
                  )}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <LoadingState
          className="min-h-0 rounded-panel border border-border-default bg-surface-primary p-12"
          label="Loading safety limits..."
        />
      )}

      {!isLoading && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Glucose bounds */}
          <div className="bg-surface-primary rounded-panel border border-border-default p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-signal-warning-fill/10 rounded-panel">
                <Icon
                  decorative
                  icon="key"
                  className="h-5 w-5 text-signal-warning-text"
                />
              </div>
              <div>
                <h2 className="font_poppins font_header_4">
                  Glucose Validation Bounds
                </h2>
                <p className="font_body_3 text-foreground-secondary">
                  Readings outside these bounds are rejected as sensor errors
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Min Glucose */}
                <TextInput
                  disabled={isSaving || showConfirm}
                  errorMessages={validationErrors.minGlucose}
                  helperText={
                    <>
                      Range: {toDisplayNumber(MIN_GLUCOSE_BOUNDS.min, unit)}-
                      {toDisplayNumber(MIN_GLUCOSE_BOUNDS.max, unit)}{" "}
                      {unitLabel(unit)}. Default:{" "}
                      {toDisplay(defaults.min_glucose_mgdl)} {unitLabel(unit)}
                    </>
                  }
                  id="min-glucose"
                  label={`Minimum Glucose (${unitLabel(unit)})`}
                  max={toDisplayNumber(MIN_GLUCOSE_BOUNDS.max, unit)}
                  min={toDisplayNumber(MIN_GLUCOSE_BOUNDS.min, unit)}
                  onChange={(e) => setMinGlucose(e.target.value)}
                  step={stepFor(unit)}
                  type="number"
                  value={minGlucose}
                />

                {/* Max Glucose */}
                <TextInput
                  disabled={isSaving || showConfirm}
                  errorMessages={validationErrors.maxGlucose}
                  helperText={
                    <>
                      Range: {toDisplayNumber(MAX_GLUCOSE_BOUNDS.min, unit)}-
                      {toDisplayNumber(MAX_GLUCOSE_BOUNDS.max, unit)}{" "}
                      {unitLabel(unit)}. Default:{" "}
                      {toDisplay(defaults.max_glucose_mgdl)} {unitLabel(unit)}
                    </>
                  }
                  id="max-glucose"
                  label={`Maximum Glucose (${unitLabel(unit)})`}
                  max={toDisplayNumber(MAX_GLUCOSE_BOUNDS.max, unit)}
                  min={toDisplayNumber(MAX_GLUCOSE_BOUNDS.min, unit)}
                  onChange={(e) => setMaxGlucose(e.target.value)}
                  step={stepFor(unit)}
                  type="number"
                  value={maxGlucose}
                />
              </div>

              {/* Visual preview for glucose bounds */}
              {isValid && minGInput < maxGInput && (
                <div className="bg-surface-secondary rounded-panel p-4 border border-border-default">
                  <p className="font_body_3 text-foreground-primary mb-2">
                    Valid Glucose Range
                  </p>
                  <p className="font_poppins font_header_4 text-signal-warning-text text-signal-warning-text">
                    {minGInput} - {maxGInput} {unitLabel(unit)}
                  </p>
                  <p className="font_body_3 text-foreground-primary mt-1">
                    Readings below {minGInput} or above {maxGInput}{" "}
                    {unitLabel(unit)} will be rejected as sensor errors
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Delivery rate constraints */}
          <div className="bg-surface-primary rounded-panel border border-border-default p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-signal-warning-fill/10 rounded-panel">
                <Icon
                  decorative
                  icon="key"
                  className="h-5 w-5 text-signal-warning-text"
                />
              </div>
              <div>
                <h2 className="font_poppins font_header_4">
                  Delivery Rate Constraints
                </h2>
                <p className="font_body_3 text-foreground-secondary">
                  Maximum delivery rates enforced by the platform
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Max Basal Rate */}
              <TextInput
                disabled={isSaving || showConfirm}
                errorMessages={validationErrors.maxBasal}
                helperText={
                  <>
                    Range: 0.001-15.0 u/hr. Default:{" "}
                    {milliunitsToUnits(defaults.max_basal_rate_milliunits)} u/hr
                  </>
                }
                id="max-basal"
                label="Max Basal Rate (u/hr)"
                max={15}
                min={0.001}
                onChange={(e) => setMaxBasal(e.target.value)}
                step="any"
                type="number"
                value={maxBasal}
              />

              {/* Max Bolus Dose */}
              <TextInput
                disabled={isSaving || showConfirm}
                errorMessages={validationErrors.maxBolus}
                helperText={
                  <>
                    Range: 0.001-25.0 units. Default:{" "}
                    {milliunitsToUnits(defaults.max_bolus_dose_milliunits)}{" "}
                    units
                  </>
                }
                id="max-bolus"
                label="Max Bolus Dose (units)"
                max={25}
                min={0.001}
                onChange={(e) => setMaxBolus(e.target.value)}
                step="any"
                type="number"
                value={maxBolus}
              />
            </div>

            {/* Visual preview for insulin limits */}
            {isValid && (
              <div className="bg-surface-secondary rounded-panel p-4 border border-border-default mt-6">
                <p className="font_body_3 text-foreground-primary mb-2">
                  Active Limits
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                  <p className="font_body_2 text-signal-warning-text text-signal-warning-text">
                    <span className="font_ui_label">
                      {formatUnits(maxBasal)}
                    </span>{" "}
                    u/hr max basal
                  </p>
                  <p className="font_body_2 text-signal-warning-text text-signal-warning-text">
                    <span className="font_ui_label">
                      {formatUnits(maxBolus)}
                    </span>{" "}
                    units max bolus
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={isSaving || !hasChanges || !isValid || isOffline}
              title={isOffline ? "Cannot save while disconnected" : undefined}
              className={twMerge(
                "flex items-center gap-1.5 px-4 py-2 rounded-panel font_ui_label",
                "bg-accent text-accent-foreground hover:bg-accent-hover",
                "transition-colors",
                "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isSaving ? (
                <Icon
                  decorative
                  icon="clock"
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Icon
                  decorative
                  icon="check"
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              )}
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>

            <Button
              type="button"
              onClick={handleReset}
              disabled={
                isSaving ||
                isOffline ||
                (limits?.min_glucose_mgdl === defaults.min_glucose_mgdl &&
                  limits?.max_glucose_mgdl === defaults.max_glucose_mgdl &&
                  limits?.max_basal_rate_milliunits ===
                    defaults.max_basal_rate_milliunits &&
                  limits?.max_bolus_dose_milliunits ===
                    defaults.max_bolus_dose_milliunits)
              }
              className={twMerge(
                "flex items-center gap-1.5 px-4 py-2 rounded-panel font_ui_label",
                "bg-surface-secondary text-foreground-primary hover:bg-surface-primary",
                "transition-colors",
                "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <Icon
                decorative
                icon="clock"
                className="h-4 w-4"
                aria-hidden="true"
              />
              Reset to Defaults
            </Button>
          </div>
        </form>
      )}

      {/* Platform disclaimer */}
      <div className="bg-surface-elevated rounded-panel p-4 border border-border-default">
        <p className="font_body_3 text-foreground-primary">
          Always consult a qualified healthcare professional regarding diabetes
          management decisions. Lumose is not a medical device and makes no
          clinical safety guarantees.
        </p>
      </div>
    </div>
  );
}
