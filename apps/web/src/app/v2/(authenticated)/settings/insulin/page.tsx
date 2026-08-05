"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";

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
import { SelectField } from "@/components/SelectField";
import { LoadingState } from "@/components/LoadingState";
import { TextInput } from "@/components/TextInput";
import {
  insulinConfigSchema,
  type InsulinConfigFields,
} from "./insulinConfig.schema";

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
  const pathname = usePathname();
  const router = useRouter();
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
  const [validationErrors, setValidationErrors] = useState<
    Partial<Record<keyof InsulinConfigFields, string>>
  >({});

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const [configResult, defaultsResult] = await Promise.allSettled([
        getInsulinConfig(),
        getInsulinConfigDefaults(),
      ]);
      const hasAuthError = [configResult, defaultsResult].some(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof Error &&
          result.reason.message.includes("401"),
      );

      if (hasAuthError) {
        router.replace(
          `/login?expired=true&redirect=${encodeURIComponent(pathname)}`,
        );
        return;
      }

      if (configResult.status === "rejected") {
        throw configResult.reason;
      }

      const configData = configResult.value;
      setConfig(configData);
      setPresets(
        defaultsResult.status === "fulfilled"
          ? defaultsResult.value.presets
          : FALLBACK_PRESETS,
      );
      setInsulinType(configData.insulin_type);
      setDiaHours(String(configData.dia_hours));
      setOnsetMinutes(String(configData.onset_minutes));
      setIsOffline(false);
    } catch (err) {
      setConfig(null);
      setError(
        err instanceof Error
          ? err.message
          : "Could not load insulin configuration",
      );
      setIsOffline(true);
      setPresets(FALLBACK_PRESETS);
    } finally {
      setIsLoading(false);
    }
  }, [pathname, router]);

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
    setValidationErrors((errors) => ({
      ...errors,
      insulinType: undefined,
    }));
    const preset = presets[newType];
    if (preset) {
      setDiaHours(String(preset.dia_hours));
      setOnsetMinutes(String(preset.onset_minutes));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const parsedFields = insulinConfigSchema.safeParse({
      diaHours,
      insulinType,
      onsetMinutes,
    });
    if (!parsedFields.success) {
      const fieldErrors = parsedFields.error.flatten().fieldErrors;
      setValidationErrors({
        diaHours: fieldErrors.diaHours?.[0],
        insulinType: fieldErrors.insulinType?.[0],
        onsetMinutes: fieldErrors.onsetMinutes?.[0],
      });
      return;
    }
    setValidationErrors({});
    setIsSaving(true);

    try {
      const updated = await updateInsulinConfig({
        insulin_type: parsedFields.data.insulinType,
        dia_hours: parsedFields.data.diaHours,
        onset_minutes: parsedFields.data.onsetMinutes,
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
        <LoadingState
          className="min-h-0 rounded-panel border border-border-default bg-surface-primary p-12"
          label="Loading insulin configuration..."
        />
      )}

      {/* Configuration form */}
      {!isLoading && config && (
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
            <SelectField
              disabled={isSaving}
              errorMessage={validationErrors.insulinType}
              helperText="Select your bolus (mealtime) insulin"
              id="insulin-type"
              label="Insulin Type"
              onChange={(event) => handleInsulinTypeChange(event.target.value)}
              options={Object.entries(INSULIN_LABELS).map(([value, label]) => ({
                label,
                value,
              }))}
              value={insulinType}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* DIA */}
              <TextInput
                disabled={isSaving || (!isCustom && insulinType !== "custom")}
                errorMessage={validationErrors.diaHours}
                helperText={
                  isCustom
                    ? `Range: ${INSULIN_LIMITS.diaMinHours}-${INSULIN_LIMITS.diaMaxHours} hours`
                    : "Auto-set from insulin type. Select Custom to override."
                }
                id="dia-hours"
                label="Duration of Insulin Action (hours)"
                max={INSULIN_LIMITS.diaMaxHours}
                min={INSULIN_LIMITS.diaMinHours}
                onChange={(e) => {
                  setDiaHours(e.target.value);
                  setValidationErrors((errors) => ({
                    ...errors,
                    diaHours: undefined,
                  }));
                }}
                step={0.5}
                type="number"
                value={diaHours}
              />

              {/* Onset */}
              <TextInput
                disabled={isSaving || (!isCustom && insulinType !== "custom")}
                errorMessage={validationErrors.onsetMinutes}
                helperText={
                  isCustom
                    ? `Range: ${INSULIN_LIMITS.onsetMinMinutes}-${INSULIN_LIMITS.onsetMaxMinutes} minutes`
                    : "Auto-set from insulin type. Select Custom to override."
                }
                id="onset-minutes"
                label="Onset Time (minutes)"
                max={INSULIN_LIMITS.onsetMaxMinutes}
                min={INSULIN_LIMITS.onsetMinMinutes}
                onChange={(e) => {
                  setOnsetMinutes(e.target.value);
                  setValidationErrors((errors) => ({
                    ...errors,
                    onsetMinutes: undefined,
                  }));
                }}
                step={1}
                type="number"
                value={onsetMinutes}
              />
            </div>

            {/* Preview */}
            {isValid && (
              <div className="bg-surface-secondary rounded-panel p-4 border border-border-default">
                <p className="font_body_3 text-foreground-primary mb-2">
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
