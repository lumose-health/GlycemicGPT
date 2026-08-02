"use client";

import { useState, useEffect, useCallback } from "react";

import { Button, Icon } from "@/base";

/**
 * Target Glucose Range Configuration
 *
 * Allows users to set all four glucose thresholds:
 * urgent_low, low_target, high_target, urgent_high.
 */

import { twMerge } from "@/lib/ui/twMerge";
import {
  getTargetGlucoseRange,
  updateTargetGlucoseRange,
  type TargetGlucoseRangeResponse,
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
import {
  createGlucoseRangeSchema,
  getGlucoseRangeFieldErrors,
} from "./glucoseRange.schema";

// All thresholds are stored and validated in canonical mg/dL (locked decision
// 6). The form displays/accepts the active unit and converts on the edges.
const DEFAULTS = {
  urgent_low: 55,
  low_target: 70,
  high_target: 180,
  urgent_high: 250,
};

// mg/dL validation bounds per field (never converted).
const BOUNDS = {
  urgentLow: { min: 30, max: 70 },
  lowTarget: { min: 40, max: 200 },
  highTarget: { min: 80, max: 400 },
  urgentHigh: { min: 200, max: 500 },
};

function getDisplayBounds(unit: ReturnType<typeof useGlucoseUnit>) {
  return {
    urgentLow: {
      min: toDisplayNumber(BOUNDS.urgentLow.min, unit),
      max: toDisplayNumber(BOUNDS.urgentLow.max, unit),
    },
    lowTarget: {
      min: toDisplayNumber(BOUNDS.lowTarget.min, unit),
      max: toDisplayNumber(BOUNDS.lowTarget.max, unit),
    },
    highTarget: {
      min: toDisplayNumber(BOUNDS.highTarget.min, unit),
      max: toDisplayNumber(BOUNDS.highTarget.max, unit),
    },
    urgentHigh: {
      min: toDisplayNumber(BOUNDS.urgentHigh.min, unit),
      max: toDisplayNumber(BOUNDS.urgentHigh.max, unit),
    },
  };
}

export default function GlucoseRangePage() {
  const [range, setRange] = useState<TargetGlucoseRangeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const unit = useGlucoseUnit();
  // Display a stored mg/dL threshold as the active-unit string for an input.
  const toDisplay = useCallback(
    (mgdl: number) => formatGlucose(mgdl, unit),
    [unit],
  );

  // Form state (holds DISPLAY-unit strings; converted to mg/dL on save).
  const [urgentLow, setUrgentLow] = useState<string>("55");
  const [lowTarget, setLowTarget] = useState<string>("70");
  const [highTarget, setHighTarget] = useState<string>("180");
  const [urgentHigh, setUrgentHigh] = useState<string>("250");

  const fetchRange = useCallback(async () => {
    try {
      setError(null);
      const data = await getTargetGlucoseRange();
      setRange(data);
      setUrgentLow(toDisplay(data.urgent_low));
      setLowTarget(toDisplay(data.low_target));
      setHighTarget(toDisplay(data.high_target));
      setUrgentHigh(toDisplay(data.urgent_high));
      setIsOffline(false);
    } catch (err) {
      if (!(err instanceof Error && err.message.includes("401"))) {
        setIsOffline(true);
      }
      setRange({
        urgent_low: DEFAULTS.urgent_low,
        low_target: DEFAULTS.low_target,
        high_target: DEFAULTS.high_target,
        urgent_high: DEFAULTS.urgent_high,
      } as TargetGlucoseRangeResponse);
    } finally {
      setIsLoading(false);
    }
  }, [toDisplay]);

  useEffect(() => {
    fetchRange();
  }, [fetchRange]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const validation = createGlucoseRangeSchema(getDisplayBounds(unit)).safeParse({
      urgentLow,
      lowTarget,
      highTarget,
      urgentHigh,
    });

    if (!validation.success) {
      setError("Correct the highlighted glucose thresholds before saving.");
      setIsSaving(false);
      return;
    }

    const {
      urgentLow: ulInput,
      lowTarget: lowInput,
      highTarget: highInput,
      urgentHigh: uhInput,
    } = validation.data;

    // Convert the entered display values back to canonical integer mg/dL,
    // CLAMPED to each field's bound so a boundary
    // unit-rounding overshoot (e.g. 27.8 mmol -> 501) never crosses the bound.
    const ul = clampMgdl(
      toStoredMgdl(ulInput, unit),
      BOUNDS.urgentLow.min,
      BOUNDS.urgentLow.max,
    );
    const low = clampMgdl(
      toStoredMgdl(lowInput, unit),
      BOUNDS.lowTarget.min,
      BOUNDS.lowTarget.max,
    );
    const high = clampMgdl(
      toStoredMgdl(highInput, unit),
      BOUNDS.highTarget.min,
      BOUNDS.highTarget.max,
    );
    const uh = clampMgdl(
      toStoredMgdl(uhInput, unit),
      BOUNDS.urgentHigh.min,
      BOUNDS.urgentHigh.max,
    );

    try {
      const updated = await updateTargetGlucoseRange({
        urgent_low: ul,
        low_target: low,
        high_target: high,
        urgent_high: uh,
      });
      setRange(updated);
      // Re-sync inputs to the canonical-converted display values; a saved mmol
      // value may visibly "snap" (e.g. 5.5 -> 99 mg/dL -> 5.5). Expected.
      setUrgentLow(toDisplay(updated.urgent_low));
      setLowTarget(toDisplay(updated.low_target));
      setHighTarget(toDisplay(updated.high_target));
      setUrgentHigh(toDisplay(updated.urgent_high));
      setSuccess("Glucose thresholds updated successfully");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update thresholds",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateTargetGlucoseRange({
        urgent_low: DEFAULTS.urgent_low,
        low_target: DEFAULTS.low_target,
        high_target: DEFAULTS.high_target,
        urgent_high: DEFAULTS.urgent_high,
      });
      setRange(updated);
      setUrgentLow(toDisplay(DEFAULTS.urgent_low));
      setLowTarget(toDisplay(DEFAULTS.low_target));
      setHighTarget(toDisplay(DEFAULTS.high_target));
      setUrgentHigh(toDisplay(DEFAULTS.urgent_high));
      setSuccess("Glucose thresholds reset to defaults");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reset thresholds",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Display-unit values (what the user typed / sees in the inputs + preview).
  const ulNum = parseFloat(urgentLow);
  const lowNum = parseFloat(lowTarget);
  const highNum = parseFloat(highTarget);
  const uhNum = parseFloat(urgentHigh);
  const displayBounds = getDisplayBounds(unit);
  const formValues = { urgentLow, lowTarget, highTarget, urgentHigh };
  const validation = createGlucoseRangeSchema(displayBounds).safeParse(formValues);
  const validationErrors = getGlucoseRangeFieldErrors(formValues, displayBounds);
  // Compare in display space so the load-time round-trip "snap" doesn't read
  // as an unsaved change.
  const hasChanges =
    range &&
    (urgentLow !== toDisplay(range.urgent_low) ||
      lowTarget !== toDisplay(range.low_target) ||
      highTarget !== toDisplay(range.high_target) ||
      urgentHigh !== toDisplay(range.urgent_high));
  const isValid = validation.success;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div data-settings-page-header>
        <h1 className="font_poppins font_header_2">Glucose Thresholds</h1>
        <p className="text-foreground-secondary">
          Configure your glucose range thresholds for charts, alerts, and AI
          analysis
        </p>
      </div>

      {isOffline && (
        <SettingsOfflineNotice onRetry={fetchRange} isRetrying={isLoading} />
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

      {isLoading && (
        <LoadingState
          className="min-h-0 rounded-panel border border-border-default bg-surface-primary p-12"
          label="Loading thresholds..."
        />
      )}

      {!isLoading && (
        <div className="bg-surface-primary rounded-panel border border-border-default p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-signal-check-fill/10 rounded-panel">
              <Icon
                decorative
                icon="glucose"
                className="h-5 w-5 text-signal-check-text"
              />
            </div>
            <div>
              <h2 className="font_poppins font_header_4">Threshold Settings</h2>
              <p className="font_body_3 text-foreground-secondary">
                Used by Time in Range, glucose charts, color coding, and alerts
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Urgent Low */}
              <TextInput
                disabled={isSaving}
                errorMessages={validationErrors.urgentLow}
                helperText={
                  <>
                    Range: {toDisplayNumber(BOUNDS.urgentLow.min, unit)}-
                    {toDisplayNumber(BOUNDS.urgentLow.max, unit)}{" "}
                    {unitLabel(unit)}. Default: {toDisplay(DEFAULTS.urgent_low)}{" "}
                    {unitLabel(unit)}
                  </>
                }
                id="urgent-low"
                inputClassName="focus-visible:border-signal-error-text focus-visible:ring-signal-error-text"
                label={`Urgent Low (${unitLabel(unit)})`}
                labelClassName="text-signal-error-text"
                max={toDisplayNumber(BOUNDS.urgentLow.max, unit)}
                min={toDisplayNumber(BOUNDS.urgentLow.min, unit)}
                onChange={(e) => setUrgentLow(e.target.value)}
                step={stepFor(unit)}
                type="number"
                value={urgentLow}
              />

              {/* Low Target */}
              <TextInput
                disabled={isSaving}
                errorMessages={validationErrors.lowTarget}
                helperText={
                  <>
                    Range: {toDisplayNumber(BOUNDS.lowTarget.min, unit)}-
                    {toDisplayNumber(BOUNDS.lowTarget.max, unit)}{" "}
                    {unitLabel(unit)}. Default: {toDisplay(DEFAULTS.low_target)}{" "}
                    {unitLabel(unit)}
                  </>
                }
                id="low-target"
                label={`Low Target (${unitLabel(unit)})`}
                labelClassName="text-signal-warning-text"
                max={toDisplayNumber(BOUNDS.lowTarget.max, unit)}
                min={toDisplayNumber(BOUNDS.lowTarget.min, unit)}
                onChange={(e) => setLowTarget(e.target.value)}
                step={stepFor(unit)}
                type="number"
                value={lowTarget}
              />

              {/* High Target */}
              <TextInput
                disabled={isSaving}
                errorMessages={validationErrors.highTarget}
                helperText={
                  <>
                    Range: {toDisplayNumber(BOUNDS.highTarget.min, unit)}-
                    {toDisplayNumber(BOUNDS.highTarget.max, unit)}{" "}
                    {unitLabel(unit)}. Default:{" "}
                    {toDisplay(DEFAULTS.high_target)} {unitLabel(unit)}
                  </>
                }
                id="high-target"
                label={`High Target (${unitLabel(unit)})`}
                labelClassName="text-signal-warning-text"
                max={toDisplayNumber(BOUNDS.highTarget.max, unit)}
                min={toDisplayNumber(BOUNDS.highTarget.min, unit)}
                onChange={(e) => setHighTarget(e.target.value)}
                step={stepFor(unit)}
                type="number"
                value={highTarget}
              />

              {/* Urgent High */}
              <TextInput
                disabled={isSaving}
                errorMessages={validationErrors.urgentHigh}
                helperText={
                  <>
                    Range: {toDisplayNumber(BOUNDS.urgentHigh.min, unit)}-
                    {toDisplayNumber(BOUNDS.urgentHigh.max, unit)}{" "}
                    {unitLabel(unit)}. Default:{" "}
                    {toDisplay(DEFAULTS.urgent_high)} {unitLabel(unit)}
                  </>
                }
                id="urgent-high"
                inputClassName="focus-visible:border-signal-error-text focus-visible:ring-signal-error-text"
                label={`Urgent High (${unitLabel(unit)})`}
                labelClassName="text-signal-error-text"
                max={toDisplayNumber(BOUNDS.urgentHigh.max, unit)}
                min={toDisplayNumber(BOUNDS.urgentHigh.min, unit)}
                onChange={(e) => setUrgentHigh(e.target.value)}
                step={stepFor(unit)}
                type="number"
                value={urgentHigh}
              />
            </div>

            {/* Visual preview */}
            {isValid && (
              <div className="bg-surface-secondary rounded-panel p-4 border border-border-default">
                <p className="font_body_3 text-foreground-primary mb-2">
                  Preview
                </p>
                <div className="flex items-center gap-2 font_body_2">
                  <span className="text-signal-error-text font_ui_label">
                    {ulNum}
                  </span>
                  <span className="text-foreground-primary">|</span>
                  <span className="text-signal-warning-text font_ui_label">
                    {lowNum}
                  </span>
                  <span className="text-foreground-primary">---</span>
                  <span className="font_poppins font_header_4 text-signal-check-text">
                    Target: {lowNum}-{highNum} {unitLabel(unit)}
                  </span>
                  <span className="text-foreground-primary">---</span>
                  <span className="text-signal-warning-text font_ui_label">
                    {highNum}
                  </span>
                  <span className="text-foreground-primary">|</span>
                  <span className="text-signal-error-text font_ui_label">
                    {uhNum}
                  </span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
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
                  (range?.urgent_low === DEFAULTS.urgent_low &&
                    range?.low_target === DEFAULTS.low_target &&
                    range?.high_target === DEFAULTS.high_target &&
                    range?.urgent_high === DEFAULTS.urgent_high)
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
        </div>
      )}

      {/* Info card */}
      <div className="bg-surface-elevated rounded-panel p-4 border border-border-default">
        <p className="font_body_3 text-foreground-primary">
          These thresholds control how glucose values are color-coded on your
          dashboard, where the target range band appears on charts, and what
          counts as &quot;in range&quot; for the Time in Range bar. They also
          influence AI-generated suggestions and alert triggers. The standard
          target range for most people with diabetes is {toDisplay(70)}-
          {toDisplay(180)} {unitLabel(unit)} with urgent thresholds at{" "}
          {toDisplay(55)} and {toDisplay(250)} {unitLabel(unit)}. Consult your
          healthcare provider before changing these values.
        </p>
      </div>
    </div>
  );
}
