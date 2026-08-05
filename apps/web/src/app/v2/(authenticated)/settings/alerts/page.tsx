"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button, Icon } from "@/base";

import { twMerge } from "@/lib/ui/twMerge";
import {
  getAlertThresholds,
  updateAlertThresholds,
  getEscalationConfig,
  updateEscalationConfig,
  type AlertThresholdResponse,
  type EscalationConfigResponse,
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
import {
  ALERT_THRESHOLD_DEFAULTS,
  GLUCOSE_THRESHOLD_BOUNDS,
} from "@/lib/alert-thresholds";
import { SettingsOfflineNotice } from "@/components/settings/SettingsOfflineNotice";
import { TextInput } from "@/components/TextInput";
import { LoadingState } from "@/components/LoadingState";
import {
  createAlertSettingsSchema,
  getAlertSettingsFieldErrors,
} from "./alertSettings.schema";

// Defaults + canonical mg/dL glucose bounds come from one shared source so this
// page and the dashboard alerts page cannot drift.
const THRESHOLD_DEFAULTS = ALERT_THRESHOLD_DEFAULTS;
const GLUCOSE_BOUNDS = GLUCOSE_THRESHOLD_BOUNDS;

const ESCALATION_DEFAULTS = {
  reminder_delay_minutes: 5,
  primary_contact_delay_minutes: 10,
  all_contacts_delay_minutes: 20,
};

function getAlertDisplayBounds(unit: ReturnType<typeof useGlucoseUnit>) {
  return {
    urgentLow: {
      min: toDisplayNumber(GLUCOSE_BOUNDS.urgentLow.min, unit),
      max: toDisplayNumber(GLUCOSE_BOUNDS.urgentLow.max, unit),
    },
    lowWarning: {
      min: toDisplayNumber(GLUCOSE_BOUNDS.lowWarning.min, unit),
      max: toDisplayNumber(GLUCOSE_BOUNDS.lowWarning.max, unit),
    },
    highWarning: {
      min: toDisplayNumber(GLUCOSE_BOUNDS.highWarning.min, unit),
      max: toDisplayNumber(GLUCOSE_BOUNDS.highWarning.max, unit),
    },
    urgentHigh: {
      min: toDisplayNumber(GLUCOSE_BOUNDS.urgentHigh.min, unit),
      max: toDisplayNumber(GLUCOSE_BOUNDS.urgentHigh.max, unit),
    },
  };
}

export default function AlertSettingsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const unit = useGlucoseUnit();
  // Display a stored mg/dL glucose threshold as the active-unit input string.
  const toDisplay = useCallback(
    (mgdl: number) => formatGlucose(mgdl, unit),
    [unit],
  );
  const [thresholds, setThresholds] = useState<AlertThresholdResponse | null>(
    null,
  );
  const [escalation, setEscalation] = useState<EscalationConfigResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Threshold form state
  const [lowWarning, setLowWarning] = useState("70");
  const [urgentLow, setUrgentLow] = useState("55");
  const [highWarning, setHighWarning] = useState("180");
  const [urgentHigh, setUrgentHigh] = useState("250");
  const [iobWarning, setIobWarning] = useState("3.0");

  // Escalation form state
  const [reminderDelay, setReminderDelay] = useState("5");
  const [primaryDelay, setPrimaryDelay] = useState("10");
  const [allContactsDelay, setAllContactsDelay] = useState("20");

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [thresholdData, escalationData] = await Promise.all([
        getAlertThresholds(),
        getEscalationConfig(),
      ]);

      setThresholds(thresholdData);
      setLowWarning(toDisplay(thresholdData.low_warning));
      setUrgentLow(toDisplay(thresholdData.urgent_low));
      setHighWarning(toDisplay(thresholdData.high_warning));
      setUrgentHigh(toDisplay(thresholdData.urgent_high));
      setIobWarning(String(thresholdData.iob_warning));

      setEscalation(escalationData);
      setReminderDelay(String(escalationData.reminder_delay_minutes));
      setPrimaryDelay(String(escalationData.primary_contact_delay_minutes));
      setAllContactsDelay(String(escalationData.all_contacts_delay_minutes));
      setIsOffline(false);
    } catch (err) {
      if (err instanceof Error && err.message.includes("401")) {
        router.replace(
          `/login?expired=true&redirect=${encodeURIComponent(pathname)}`,
        );
        return;
      }
      setIsOffline(true);
      // Use defaults as baseline so the form is still functional
      setThresholds({
        ...THRESHOLD_DEFAULTS,
      } as AlertThresholdResponse);
      setLowWarning(toDisplay(THRESHOLD_DEFAULTS.low_warning));
      setUrgentLow(toDisplay(THRESHOLD_DEFAULTS.urgent_low));
      setHighWarning(toDisplay(THRESHOLD_DEFAULTS.high_warning));
      setUrgentHigh(toDisplay(THRESHOLD_DEFAULTS.urgent_high));
      setIobWarning(String(THRESHOLD_DEFAULTS.iob_warning));

      setEscalation({
        ...ESCALATION_DEFAULTS,
      } as EscalationConfigResponse);
      setReminderDelay(String(ESCALATION_DEFAULTS.reminder_delay_minutes));
      setPrimaryDelay(
        String(ESCALATION_DEFAULTS.primary_contact_delay_minutes),
      );
      setAllContactsDelay(
        String(ESCALATION_DEFAULTS.all_contacts_delay_minutes),
      );
    } finally {
      setIsLoading(false);
    }
  }, [pathname, router, toDisplay]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-clear success message after 5 seconds
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  const formValues = {
    urgentLow,
    lowWarning,
    highWarning,
    urgentHigh,
    iobWarning,
    reminderDelay,
    primaryDelay,
    allContactsDelay,
  };
  const displayBounds = getAlertDisplayBounds(unit);
  const validation = createAlertSettingsSchema(displayBounds).safeParse(formValues);
  const validationErrors = getAlertSettingsFieldErrors(formValues, displayBounds);
  const lowWarn = validation.success ? validation.data.lowWarning : Number(lowWarning);
  const urgLow = validation.success ? validation.data.urgentLow : Number(urgentLow);
  const highWarn = validation.success ? validation.data.highWarning : Number(highWarning);
  const urgHigh = validation.success ? validation.data.urgentHigh : Number(urgentHigh);
  const iobWarn = validation.success ? validation.data.iobWarning : Number(iobWarning);
  const remDelay = validation.success ? validation.data.reminderDelay : Number(reminderDelay);
  const priDelay = validation.success ? validation.data.primaryDelay : Number(primaryDelay);
  const allDelay = validation.success
    ? validation.data.allContactsDelay
    : Number(allContactsDelay);
  const thresholdsValid = [
    "urgentLow",
    "lowWarning",
    "highWarning",
    "urgentHigh",
    "iobWarning",
  ].every((field) => validationErrors[field as keyof typeof validationErrors].length === 0);
  const escalationValid = [
    "reminderDelay",
    "primaryDelay",
    "allContactsDelay",
  ].every((field) => validationErrors[field as keyof typeof validationErrors].length === 0);
  const isValid = validation.success;

  // Compare glucose in display space so the load-time round-trip "snap" doesn't
  // read as an unsaved change; IoB compares numerically.
  const thresholdsChanged =
    thresholds !== null &&
    (lowWarning !== toDisplay(thresholds.low_warning) ||
      urgentLow !== toDisplay(thresholds.urgent_low) ||
      highWarning !== toDisplay(thresholds.high_warning) ||
      urgentHigh !== toDisplay(thresholds.urgent_high) ||
      parseFloat(iobWarning) !== thresholds.iob_warning);

  const escalationChanged =
    escalation !== null &&
    (parseInt(reminderDelay, 10) !== escalation.reminder_delay_minutes ||
      parseInt(primaryDelay, 10) !== escalation.primary_contact_delay_minutes ||
      parseInt(allContactsDelay, 10) !== escalation.all_contacts_delay_minutes);

  const hasChanges = thresholdsChanged || escalationChanged;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitValidation = createAlertSettingsSchema(displayBounds).safeParse(formValues);
    if (!submitValidation.success) {
      setError("Correct the highlighted alert settings before saving.");
      return;
    }
    if (!hasChanges) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const results = await Promise.allSettled([
      thresholdsChanged
        ? updateAlertThresholds({
            // Glucose thresholds convert back to integer mg/dL, clamped to each
            // bound; IoB stays units.
            low_warning: clampMgdl(
              toStoredMgdl(lowWarn, unit),
              GLUCOSE_BOUNDS.lowWarning.min,
              GLUCOSE_BOUNDS.lowWarning.max,
            ),
            urgent_low: clampMgdl(
              toStoredMgdl(urgLow, unit),
              GLUCOSE_BOUNDS.urgentLow.min,
              GLUCOSE_BOUNDS.urgentLow.max,
            ),
            high_warning: clampMgdl(
              toStoredMgdl(highWarn, unit),
              GLUCOSE_BOUNDS.highWarning.min,
              GLUCOSE_BOUNDS.highWarning.max,
            ),
            urgent_high: clampMgdl(
              toStoredMgdl(urgHigh, unit),
              GLUCOSE_BOUNDS.urgentHigh.min,
              GLUCOSE_BOUNDS.urgentHigh.max,
            ),
            iob_warning: iobWarn,
          })
        : Promise.resolve(thresholds!),
      escalationChanged
        ? updateEscalationConfig({
            reminder_delay_minutes: remDelay,
            primary_contact_delay_minutes: priDelay,
            all_contacts_delay_minutes: allDelay,
          })
        : Promise.resolve(escalation!),
    ]);

    // Update state for whichever calls succeeded
    if (results[0].status === "fulfilled") {
      const t = results[0].value;
      setThresholds(t);
      // Re-sync glucose inputs to the canonical-converted display (snap).
      setLowWarning(toDisplay(t.low_warning));
      setUrgentLow(toDisplay(t.urgent_low));
      setHighWarning(toDisplay(t.high_warning));
      setUrgentHigh(toDisplay(t.urgent_high));
      setIobWarning(String(t.iob_warning));
    }
    if (results[1].status === "fulfilled") {
      setEscalation(results[1].value);
    }

    // Report errors for any failures
    const errors: string[] = [];
    if (results[0].status === "rejected") {
      errors.push(
        results[0].reason instanceof Error
          ? results[0].reason.message
          : "Failed to update thresholds",
      );
    }
    if (results[1].status === "rejected") {
      errors.push(
        results[1].reason instanceof Error
          ? results[1].reason.message
          : "Failed to update escalation config",
      );
    }

    if (errors.length > 0) {
      setError(errors.join(". "));
    } else {
      setSuccess("Alert settings updated successfully");
    }

    setIsSaving(false);
  };

  const handleReset = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const [thresholdResult, escalationResult] = await Promise.allSettled([
      updateAlertThresholds({ ...THRESHOLD_DEFAULTS }),
      updateEscalationConfig({ ...ESCALATION_DEFAULTS }),
    ]);
    const errors: string[] = [];

    if (thresholdResult.status === "fulfilled") {
      const updatedThresholds = thresholdResult.value;
      setThresholds(updatedThresholds);
      setLowWarning(toDisplay(updatedThresholds.low_warning));
      setUrgentLow(toDisplay(updatedThresholds.urgent_low));
      setHighWarning(toDisplay(updatedThresholds.high_warning));
      setUrgentHigh(toDisplay(updatedThresholds.urgent_high));
      setIobWarning(String(updatedThresholds.iob_warning));
    } else {
      errors.push(
        thresholdResult.reason instanceof Error
          ? thresholdResult.reason.message
          : "Failed to reset alert thresholds",
      );
    }

    if (escalationResult.status === "fulfilled") {
      const updatedEscalation = escalationResult.value;
      setEscalation(updatedEscalation);
      setReminderDelay(String(updatedEscalation.reminder_delay_minutes));
      setPrimaryDelay(
        String(updatedEscalation.primary_contact_delay_minutes),
      );
      setAllContactsDelay(
        String(updatedEscalation.all_contacts_delay_minutes),
      );
    } else {
      errors.push(
        escalationResult.reason instanceof Error
          ? escalationResult.reason.message
          : "Failed to reset escalation timing",
      );
    }

    if (errors.length > 0) {
      setError(errors.join(". "));
    } else {
      setSuccess("Alert settings reset to defaults");
    }

    setIsSaving(false);
  };

  const isAtDefaults =
    thresholds?.low_warning === THRESHOLD_DEFAULTS.low_warning &&
    thresholds?.urgent_low === THRESHOLD_DEFAULTS.urgent_low &&
    thresholds?.high_warning === THRESHOLD_DEFAULTS.high_warning &&
    thresholds?.urgent_high === THRESHOLD_DEFAULTS.urgent_high &&
    thresholds?.iob_warning === THRESHOLD_DEFAULTS.iob_warning &&
    escalation?.reminder_delay_minutes ===
      ESCALATION_DEFAULTS.reminder_delay_minutes &&
    escalation?.primary_contact_delay_minutes ===
      ESCALATION_DEFAULTS.primary_contact_delay_minutes &&
    escalation?.all_contacts_delay_minutes ===
      ESCALATION_DEFAULTS.all_contacts_delay_minutes;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div data-settings-page-header>
        <h1 className="font_poppins font_header_2">Alert Settings</h1>
        <p className="text-foreground-secondary">
          Configure alert thresholds and escalation timing
        </p>
      </div>

      {/* Offline banner */}
      {isOffline && (
        <SettingsOfflineNotice onRetry={fetchData} isRetrying={isLoading} />
      )}

      {/* Error state */}
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

      {/* Success state */}
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

      {/* Loading state */}
      {isLoading && (
        <LoadingState
          className="min-h-0 rounded-panel border border-border-default bg-surface-primary p-12"
          label="Loading alert settings..."
        />
      )}

      {!isLoading && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Alert Thresholds Section */}
          <div className="bg-surface-primary rounded-panel border border-border-default p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-signal-error-fill/10 rounded-panel">
                <Icon
                  decorative
                  icon="glucose"
                  className="h-5 w-5 text-signal-error-text"
                />
              </div>
              <div>
                <h2 className="font_poppins font_header_4">Alert Thresholds</h2>
                <p className="font_body_3 text-foreground-secondary">
                  Set glucose and insulin thresholds that trigger alerts
                </p>
              </div>

            </div>

            {/* Low glucose thresholds */}
            <div className="space-y-4">
              <h3 className="font_ui_label text-foreground-secondary">
                Low Glucose Alerts
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  disabled={isSaving}
                  errorMessages={validationErrors.urgentLow}
                  helperText={
                    <>
                      Range:{" "}
                      {toDisplayNumber(GLUCOSE_BOUNDS.urgentLow.min, unit)}-
                      {toDisplayNumber(GLUCOSE_BOUNDS.urgentLow.max, unit)}{" "}
                      {unitLabel(unit)}. Default:{" "}
                      {toDisplay(THRESHOLD_DEFAULTS.urgent_low)}{" "}
                      {unitLabel(unit)}
                    </>
                  }
                  id="urgent-low"
                  label={`Urgent Low (${unitLabel(unit)})`}
                  max={toDisplayNumber(GLUCOSE_BOUNDS.urgentLow.max, unit)}
                  min={toDisplayNumber(GLUCOSE_BOUNDS.urgentLow.min, unit)}
                  onChange={(e) => setUrgentLow(e.target.value)}
                  step={stepFor(unit)}
                  type="number"
                  value={urgentLow}
                />

                <TextInput
                  disabled={isSaving}
                  errorMessages={validationErrors.lowWarning}
                  helperText={
                    <>
                      Range:{" "}
                      {toDisplayNumber(GLUCOSE_BOUNDS.lowWarning.min, unit)}-
                      {toDisplayNumber(GLUCOSE_BOUNDS.lowWarning.max, unit)}{" "}
                      {unitLabel(unit)}. Default:{" "}
                      {toDisplay(THRESHOLD_DEFAULTS.low_warning)}{" "}
                      {unitLabel(unit)}
                    </>
                  }
                  id="low-warning"
                  label={`Low Warning (${unitLabel(unit)})`}
                  max={toDisplayNumber(GLUCOSE_BOUNDS.lowWarning.max, unit)}
                  min={toDisplayNumber(GLUCOSE_BOUNDS.lowWarning.min, unit)}
                  onChange={(e) => setLowWarning(e.target.value)}
                  step={stepFor(unit)}
                  type="number"
                  value={lowWarning}
                />
              </div>

            </div>

            {/* High glucose thresholds */}
            <div className="space-y-4 mt-6">
              <h3 className="font_ui_label text-foreground-secondary">
                High Glucose Alerts
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  disabled={isSaving}
                  errorMessages={validationErrors.highWarning}
                  helperText={
                    <>
                      Range:{" "}
                      {toDisplayNumber(GLUCOSE_BOUNDS.highWarning.min, unit)}-
                      {toDisplayNumber(GLUCOSE_BOUNDS.highWarning.max, unit)}{" "}
                      {unitLabel(unit)}. Default:{" "}
                      {toDisplay(THRESHOLD_DEFAULTS.high_warning)}{" "}
                      {unitLabel(unit)}
                    </>
                  }
                  id="high-warning"
                  label={`High Warning (${unitLabel(unit)})`}
                  max={toDisplayNumber(GLUCOSE_BOUNDS.highWarning.max, unit)}
                  min={toDisplayNumber(GLUCOSE_BOUNDS.highWarning.min, unit)}
                  onChange={(e) => setHighWarning(e.target.value)}
                  step={stepFor(unit)}
                  type="number"
                  value={highWarning}
                />

                <TextInput
                  disabled={isSaving}
                  errorMessages={validationErrors.urgentHigh}
                  helperText={
                    <>
                      Range:{" "}
                      {toDisplayNumber(GLUCOSE_BOUNDS.urgentHigh.min, unit)}-
                      {toDisplayNumber(GLUCOSE_BOUNDS.urgentHigh.max, unit)}{" "}
                      {unitLabel(unit)}. Default:{" "}
                      {toDisplay(THRESHOLD_DEFAULTS.urgent_high)}{" "}
                      {unitLabel(unit)}
                    </>
                  }
                  id="urgent-high"
                  label={`Urgent High (${unitLabel(unit)})`}
                  max={toDisplayNumber(GLUCOSE_BOUNDS.urgentHigh.max, unit)}
                  min={toDisplayNumber(GLUCOSE_BOUNDS.urgentHigh.min, unit)}
                  onChange={(e) => setUrgentHigh(e.target.value)}
                  step={stepFor(unit)}
                  type="number"
                  value={urgentHigh}
                />
              </div>
            </div>

            {/* IoB threshold */}
            <div className="space-y-4 mt-6">
              <h3 className="font_ui_label text-foreground-secondary">
                Insulin on Board
              </h3>
              <TextInput
                containerClassName="max-w-xs"
                disabled={isSaving}
                errorMessages={validationErrors.iobWarning}
                helperText="Range: 0.5-20.0 units. Default: 3.0 units"
                id="iob-warning"
                label="IoB Warning (units)"
                max={20}
                min={0.5}
                onChange={(e) => setIobWarning(e.target.value)}
                step={0.1}
                type="number"
                value={iobWarning}
              />
            </div>

            {/* Threshold preview */}
            {thresholdsValid && (
              <div className="bg-surface-secondary rounded-panel p-4 border border-border-default mt-6">
                <p className="font_body_3 text-foreground-primary mb-2">
                  Threshold Preview
                </p>
                <div className="grid grid-cols-2 gap-2 font_body_2">
                  <div>
                    <span className="text-signal-error-text text-signal-error-text">
                      Urgent Low:
                    </span>{" "}
                    <span className="text-foreground-primary">
                      &lt; {urgLow} {unitLabel(unit)}
                    </span>
                  </div>
                  <div>
                    <span className="text-signal-warning-text text-signal-warning-text">
                      Low Warning:
                    </span>{" "}
                    <span className="text-foreground-primary">
                      &lt; {lowWarn} {unitLabel(unit)}
                    </span>
                  </div>
                  <div>
                    <span className="text-signal-warning-text text-signal-warning-text">
                      High Warning:
                    </span>{" "}
                    <span className="text-foreground-primary">
                      &gt; {highWarn} {unitLabel(unit)}
                    </span>
                  </div>
                  <div>
                    <span className="text-signal-error-text text-signal-error-text">
                      Urgent High:
                    </span>{" "}
                    <span className="text-foreground-primary">
                      &gt; {urgHigh} {unitLabel(unit)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-signal-warning-text text-signal-warning-text">
                      IoB Warning:
                    </span>{" "}
                    <span className="text-foreground-primary">
                      &gt; {iobWarn} units
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Escalation Timing Section */}
          <div className="bg-surface-primary rounded-panel border border-border-default p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-signal-warning-fill/10 rounded-panel">
                <Icon
                  decorative
                  icon="clock"
                  className="h-5 w-5 text-signal-warning-text"
                />
              </div>
              <div>
                <h2 className="font_poppins font_header_4">
                  Escalation Timing
                </h2>
                <p className="font_body_3 text-foreground-secondary">
                  Configure delays before alerts escalate to contacts
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <TextInput
                  disabled={isSaving}
                  errorMessages={validationErrors.reminderDelay}
                  helperText="2-60 min. Default: 5 min"
                  id="reminder-delay"
                  label="Reminder (minutes)"
                  max={60}
                  min={2}
                  onChange={(e) => setReminderDelay(e.target.value)}
                  step={1}
                  type="number"
                  value={reminderDelay}
                />

                <TextInput
                  disabled={isSaving}
                  errorMessages={validationErrors.primaryDelay}
                  helperText="2-120 min. Default: 10 min"
                  id="primary-delay"
                  label="Primary Contact (minutes)"
                  max={120}
                  min={2}
                  onChange={(e) => setPrimaryDelay(e.target.value)}
                  step={1}
                  type="number"
                  value={primaryDelay}
                />

                <TextInput
                  disabled={isSaving}
                  errorMessages={validationErrors.allContactsDelay}
                  helperText="2-240 min. Default: 20 min"
                  id="all-contacts-delay"
                  label="All Contacts (minutes)"
                  max={240}
                  min={2}
                  onChange={(e) => setAllContactsDelay(e.target.value)}
                  step={1}
                  type="number"
                  value={allContactsDelay}
                />
              </div>

              {/* Escalation preview */}
              {escalationValid && (
                <div className="bg-surface-secondary rounded-panel p-4 border border-border-default mt-2">
                  <p className="font_body_3 text-foreground-primary mb-2">
                    Escalation Flow
                  </p>
                  <div className="flex items-center gap-2 font_body_2 flex-wrap">
                    <span className="text-foreground-primary">
                      Alert triggered
                    </span>
                    <span className="text-foreground-primary">&rarr;</span>
                    <span className="text-accent">Reminder at {remDelay}m</span>
                    <span className="text-foreground-primary">&rarr;</span>
                    <span className="text-signal-warning-text">
                      Primary contact at {priDelay}m
                    </span>
                    <span className="text-foreground-primary">&rarr;</span>
                    <span className="text-signal-error-text">
                      All contacts at {allDelay}m
                    </span>
                  </div>
                </div>
              )}
            </div>
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
              disabled={isSaving || isAtDefaults || isOffline}
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

      {/* Info card */}
      <div className="bg-surface-elevated rounded-panel p-4 border border-border-default">
        <div className="flex items-start gap-2">
          <Icon
            decorative
            icon="bell"
            className="h-4 w-4 text-foreground-primary mt-0.5 shrink-0"
          />
          <p className="font_body_3 text-foreground-primary">
            Alert thresholds determine when you receive glucose and insulin
            warnings. Escalation timing controls how quickly unacknowledged
            alerts are forwarded to your emergency contacts. Consult your
            healthcare provider before adjusting these values.
          </p>
        </div>
      </div>
    </div>
  );
}
