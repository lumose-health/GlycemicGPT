"use client";

import { useState, useEffect, useCallback } from "react";

import { Button, Icon } from "@/base";

/**
 * Insulin Configuration Page
 *
 * Allows users to select their insulin type and configure DIA (Duration of
 * Insulin Action) used for IoB decay calculations.
 */

import { twMerge } from "@/lib/ui/twMerge";
import {
  getInsulinConfig,
  updateInsulinConfig,
  getInsulinConfigDefaults,
  type InsulinConfigResponse,
  type InsulinPresets,
} from "@/lib/api";
import {
  FALLBACK_PRESETS,
  INSULIN_LABELS,
  INSULIN_LIMITS,
} from "@/lib/insulin";
import { SettingsOfflineNotice } from "@/components/settings/SettingsOfflineNotice";
import { TextInput } from "@/components/TextInput";

type SavedConfig = Pick<
  InsulinConfigResponse,
  "insulin_type" | "dia_hours" | "onset_minutes"
>;

const DEFAULTS = {
  insulin_type: "humalog",
  dia_hours: 4.0,
  onset_minutes: 15.0,
};

export default function InsulinConfigPage() {
  const [config, setConfig] = useState<SavedConfig | null>(null);
  const [presets, setPresets] = useState<InsulinPresets>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Form state
  const [insulinType, setInsulinType] = useState<string>("humalog");
  const [diaHours, setDiaHours] = useState<string>("4.0");
  const [onsetMinutes, setOnsetMinutes] = useState<string>("15");

  const fetchConfig = useCallback(async () => {
    try {
      setError(null);
      const [configData, defaults] = await Promise.all([
        getInsulinConfig(),
        getInsulinConfigDefaults(),
      ]);
      setConfig(configData);
      setPresets(defaults.presets);
      setInsulinType(configData.insulin_type);
      setDiaHours(String(configData.dia_hours));
      setOnsetMinutes(String(configData.onset_minutes));
      setIsOffline(false);
    } catch (err) {
      if (!(err instanceof Error && err.message.includes("401"))) {
        setIsOffline(true);
      }
      setPresets(FALLBACK_PRESETS);
      setConfig({
        insulin_type: DEFAULTS.insulin_type,
        dia_hours: DEFAULTS.dia_hours,
        onset_minutes: DEFAULTS.onset_minutes,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Auto-clear success message after 5 seconds
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  // When insulin type changes (and it's a preset), auto-populate DIA/onset
  const handleInsulinTypeChange = (newType: string) => {
    setInsulinType(newType);
    const preset = presets[newType];
    if (preset) {
      setDiaHours(String(preset.dia_hours));
      setOnsetMinutes(String(preset.onset_minutes));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const dia = parseFloat(diaHours);
    const onset = parseFloat(onsetMinutes);

    if (isNaN(dia) || isNaN(onset)) {
      setError("Please enter valid numbers");
      setIsSaving(false);
      return;
    }

    try {
      const updated = await updateInsulinConfig({
        insulin_type: insulinType,
        dia_hours: dia,
        onset_minutes: onset,
      });
      setConfig(updated);
      setSuccess("Insulin configuration updated successfully");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update insulin config",
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
      const updated = await updateInsulinConfig({
        insulin_type: DEFAULTS.insulin_type,
        dia_hours: DEFAULTS.dia_hours,
        onset_minutes: DEFAULTS.onset_minutes,
      });
      setConfig(updated);
      setInsulinType(DEFAULTS.insulin_type);
      setDiaHours(String(DEFAULTS.dia_hours));
      setOnsetMinutes(String(DEFAULTS.onset_minutes));
      setSuccess("Insulin configuration reset to defaults");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reset insulin config",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const diaNum = parseFloat(diaHours);
  const onsetNum = parseFloat(onsetMinutes);
  const hasChanges =
    config &&
    (insulinType !== config.insulin_type ||
      parseFloat(diaHours) !== config.dia_hours ||
      parseFloat(onsetMinutes) !== config.onset_minutes);
  const isValid =
    !isNaN(diaNum) &&
    !isNaN(onsetNum) &&
    diaNum >= INSULIN_LIMITS.diaMinHours &&
    diaNum <= INSULIN_LIMITS.diaMaxHours &&
    onsetNum >= INSULIN_LIMITS.onsetMinMinutes &&
    onsetNum <= INSULIN_LIMITS.onsetMaxMinutes;
  const isCustom =
    insulinType === "custom" || !(insulinType in (presets || {}));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div data-settings-page-header>
        <h1 className="font_poppins font_header_2">Insulin Configuration</h1>
        <p className="text-foreground-secondary">
          Select your insulin type to configure IoB (Insulin on Board)
          calculations
        </p>
      </div>

      {/* Offline banner */}
      {isOffline && (
        <SettingsOfflineNotice onRetry={fetchConfig} isRetrying={isLoading} />
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
        <div
          className="bg-surface-primary rounded-panel p-12 border border-border-default text-center"
          role="status"
          aria-label="Loading insulin configuration"
        >
          <Icon
            decorative
            icon="clock"
            className="h-8 w-8 text-accent animate-spin mx-auto mb-3"
          />
          <p className="text-foreground-secondary">
            Loading insulin configuration...
          </p>
        </div>
      )}

      {/* Configuration form */}
      {!isLoading && (
        <div className="bg-surface-primary rounded-panel border border-border-default p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-accent/10 rounded-panel">
              <Icon decorative icon="glucose" className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="font_poppins font_header_4">Insulin Settings</h2>
              <p className="font_body_3 text-foreground-secondary">
                Used for IoB decay calculations on the dashboard
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Insulin type selector */}
            <div>
              <label
                htmlFor="insulin-type"
                className="block font_ui_label text-foreground-secondary mb-1"
              >
                Insulin Type
              </label>
              <select
                id="insulin-type"
                value={insulinType}
                onChange={(e) => handleInsulinTypeChange(e.target.value)}
                disabled={isSaving}
                className={twMerge(
                  "w-full rounded-panel border px-3 py-2 font_body_2",
                  "bg-surface-secondary border-border-default text-foreground-primary",
                  "focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {Object.entries(INSULIN_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="font_body_3 text-foreground-secondary mt-1">
                Select your bolus (mealtime) insulin
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* DIA */}
              <TextInput
                disabled={isSaving || (!isCustom && insulinType !== "custom")}
                helperText={
                  isCustom
                    ? "Range: 2-8 hours"
                    : "Auto-set from insulin type. Select Custom to override."
                }
                id="dia-hours"
                label="Duration of Insulin Action (hours)"
                max={INSULIN_LIMITS.diaMaxHours}
                min={INSULIN_LIMITS.diaMinHours}
                onChange={(e) => setDiaHours(e.target.value)}
                step={0.5}
                type="number"
                value={diaHours}
              />

              {/* Onset */}
              <TextInput
                disabled={isSaving || (!isCustom && insulinType !== "custom")}
                helperText={
                  isCustom
                    ? "Range: 1-60 minutes"
                    : "Auto-set from insulin type. Select Custom to override."
                }
                id="onset-minutes"
                label="Onset Time (minutes)"
                max={INSULIN_LIMITS.onsetMaxMinutes}
                min={INSULIN_LIMITS.onsetMinMinutes}
                onChange={(e) => setOnsetMinutes(e.target.value)}
                step={1}
                type="number"
                value={onsetMinutes}
              />
            </div>

            {/* Preview */}
            {isValid && (
              <div className="bg-surface-secondary rounded-panel p-4 border border-border-default">
                <p className="font_body_3 text-foreground-secondary mb-2">
                  Active Configuration
                </p>
                <p className="font_poppins font_header_4 text-accent text-accent">
                  {INSULIN_LABELS[insulinType] || insulinType} - {diaNum}h DIA,{" "}
                  {onsetNum}min onset
                </p>
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
                  (config?.insulin_type === DEFAULTS.insulin_type &&
                    config?.dia_hours === DEFAULTS.dia_hours &&
                    config?.onset_minutes === DEFAULTS.onset_minutes)
                }
                className={twMerge(
                  "flex items-center gap-1.5 px-4 py-2 rounded-panel font_ui_label",
                  "bg-surface-secondary text-foreground-secondary hover:bg-surface-secondary",
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
        <p className="font_body_3 text-foreground-secondary">
          Your insulin type determines the Duration of Insulin Action (DIA) used
          to calculate how much active insulin remains in your body (IoB). This
          affects the IoB display on your dashboard and in AI analysis. Most
          rapid-acting insulins have a DIA of 3.5-4 hours. Consult your
          healthcare provider if unsure about your insulin settings.
        </p>
      </div>
    </div>
  );
}
