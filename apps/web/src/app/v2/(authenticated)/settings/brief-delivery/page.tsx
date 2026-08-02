"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

import { Button, Icon } from "@/base";

import { twMerge } from "@/lib/ui/twMerge";
import {
  getBriefDeliveryConfig,
  updateBriefDeliveryConfig,
  type BriefDeliveryConfigResponse,
} from "@/lib/api";
import { SettingsOfflineNotice } from "@/components/settings/SettingsOfflineNotice";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { Switch } from "@/components/Switch";
import { TextInput } from "@/components/TextInput";
import { SelectField } from "@/components/SelectField";
import { LoadingState } from "@/components/LoadingState";
import {
  briefDeliverySchema,
  type BriefDeliveryFields,
} from "./briefDelivery.schema";

const DEFAULTS = {
  enabled: true,
  delivery_time: "07:00:00",
  timezone: "UTC",
  channel: "both" as const,
};

const CHANNEL_OPTIONS = [
  { value: "both", label: "Web + Telegram" },
  { value: "web_only", label: "Web Only" },
  { value: "telegram", label: "Telegram Only" },
] as const;

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

export default function BriefDeliveryPage() {
  const [config, setConfig] = useState<BriefDeliveryConfigResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Form state
  const [enabled, setEnabled] = useState(true);
  const [deliveryTime, setDeliveryTime] = useState("07:00");
  const [timezone, setTimezone] = useState("UTC");
  const [channel, setChannel] = useState<"web_only" | "telegram" | "both">(
    "both",
  );
  const [validationErrors, setValidationErrors] = useState<
    Partial<Record<keyof BriefDeliveryFields, string>>
  >({});

  // Build timezone options, including saved timezone if not in common list
  const timezoneOptions = useMemo(() => {
    if (timezone && !COMMON_TIMEZONES.includes(timezone)) {
      return [...COMMON_TIMEZONES, timezone].sort();
    }
    return COMMON_TIMEZONES;
  }, [timezone]);

  // Auto-clear success message after 5 seconds
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  const fetchConfig = useCallback(async () => {
    try {
      setError(null);
      const data = await getBriefDeliveryConfig();
      setConfig(data);
      setEnabled(data.enabled);
      // delivery_time comes as "HH:MM:SS"; the time control needs "HH:MM".
      setDeliveryTime(data.delivery_time.slice(0, 5));
      setTimezone(data.timezone);
      setChannel(data.channel);
      setIsOffline(false);
    } catch (err) {
      if (!(err instanceof Error && err.message.includes("401"))) {
        setIsOffline(true);
      }
      // Use defaults as baseline so the form is still functional
      setConfig({
        enabled: DEFAULTS.enabled,
        delivery_time: DEFAULTS.delivery_time,
        timezone: DEFAULTS.timezone,
        channel: DEFAULTS.channel,
      } as BriefDeliveryConfigResponse);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const parsedFields = briefDeliverySchema.safeParse({
      channel,
      deliveryTime,
      enabled,
      timezone,
    });
    if (!parsedFields.success) {
      const fieldErrors = parsedFields.error.flatten().fieldErrors;
      setValidationErrors({
        channel: fieldErrors.channel?.[0],
        deliveryTime: fieldErrors.deliveryTime?.[0],
        enabled: fieldErrors.enabled?.[0],
        timezone: fieldErrors.timezone?.[0],
      });
      return;
    }
    setValidationErrors({});
    setIsSaving(true);

    try {
      // Only send fields that actually changed
      const payload: Record<string, unknown> = {};
      if (config && parsedFields.data.enabled !== config.enabled)
        payload.enabled = parsedFields.data.enabled;
      if (
        config &&
        parsedFields.data.deliveryTime + ":00" !== config.delivery_time
      )
        payload.delivery_time = parsedFields.data.deliveryTime + ":00";
      if (config && parsedFields.data.timezone !== config.timezone)
        payload.timezone = parsedFields.data.timezone;
      if (config && parsedFields.data.channel !== config.channel)
        payload.channel = parsedFields.data.channel;

      const updated = await updateBriefDeliveryConfig(
        payload as Parameters<typeof updateBriefDeliveryConfig>[0],
      );
      setConfig(updated);
      setSuccess("Brief delivery configuration updated successfully");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update brief delivery configuration",
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
      const updated = await updateBriefDeliveryConfig({
        enabled: DEFAULTS.enabled,
        delivery_time: DEFAULTS.delivery_time,
        timezone: DEFAULTS.timezone,
        channel: DEFAULTS.channel,
      });
      setConfig(updated);
      setEnabled(DEFAULTS.enabled);
      setDeliveryTime(DEFAULTS.delivery_time.slice(0, 5));
      setTimezone(DEFAULTS.timezone);
      setChannel(DEFAULTS.channel);
      setSuccess("Brief delivery configuration reset to defaults");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to reset brief delivery configuration",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    config &&
    (enabled !== config.enabled ||
      deliveryTime + ":00" !== config.delivery_time ||
      timezone !== config.timezone ||
      channel !== config.channel);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div data-settings-page-header>
        <h1 className="font_poppins font_header_2">Daily Brief Delivery</h1>
        <p className="text-foreground-secondary">
          Configure when and how you receive your daily glucose briefs
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
          label="Loading delivery configuration..."
        />
      )}

      {/* Configuration form */}
      {!isLoading && (
        <div className="bg-surface-primary rounded-panel border border-border-default p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-accent/10 rounded-panel">
              <Icon decorative icon="clock" className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="font_poppins font_header_4">Delivery Settings</h2>
              <p className="font_body_3 text-foreground-secondary">
                Control your daily brief schedule and delivery channel
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <SettingsRow
              control={
                <Switch
                  checked={enabled}
                  disabled={isSaving}
                  label="Enable daily briefs"
                  onCheckedChange={setEnabled}
                  visuallyHideLabel
                />
              }
              description="Receive automated daily glucose analysis"
              label="Enable Daily Briefs"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Delivery time */}
              <TextInput
                disabled={isSaving}
                errorMessage={validationErrors.deliveryTime}
                helperText="Default: 07:00 AM"
                id="delivery-time"
                label="Delivery Time"
                onChange={(e) => {
                  setDeliveryTime(e.target.value);
                  setValidationErrors((errors) => ({
                    ...errors,
                    deliveryTime: undefined,
                  }));
                }}
                type="time"
                value={deliveryTime}
              />

              {/* Timezone */}
              <SelectField
                disabled={isSaving}
                errorMessage={validationErrors.timezone}
                helperText="Default: UTC"
                id="timezone"
                label="Timezone"
                onChange={(event) => {
                  setTimezone(event.target.value);
                  setValidationErrors((errors) => ({
                    ...errors,
                    timezone: undefined,
                  }));
                }}
                options={timezoneOptions.map((timezoneOption) => ({
                  label: timezoneOption.replace(/_/g, " "),
                  value: timezoneOption,
                }))}
                value={timezone}
              />
            </div>

            {/* Channel selection */}
            <div>
              <label className="block font_ui_label text-foreground-secondary mb-2">
                Delivery Channel
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {CHANNEL_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    aria-pressed={channel === opt.value}
                    onClick={() => setChannel(opt.value)}
                    disabled={isSaving}
                    className={twMerge(
                      "px-4 py-3 rounded-panel border font_ui_label text-center",
                      "transition-colors",
                      "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      channel === opt.value
                        ? "bg-surface-elevated border-accent text-accent"
                        : "bg-surface-secondary border-border-default text-foreground-primary hover:border-border-hover hover:border-border-hover",
                    )}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              <p className="font_body_3 text-foreground-secondary mt-1">
                Default: Web + Telegram
              </p>
            </div>

            {/* Preview */}
            {!isLoading && (
              <div className="bg-surface-secondary rounded-panel p-4 border border-border-default">
                <p className="font_body_3 text-foreground-primary mb-2">
                  Preview
                </p>
                <p className="font_poppins font_header_4 text-accent text-accent">
                  {enabled ? "Enabled" : "Disabled"} &middot; {deliveryTime}{" "}
                  {timezone.replace(/_/g, " ")} &middot;{" "}
                  {CHANNEL_OPTIONS.find((o) => o.value === channel)?.label}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                type="submit"
                disabled={isSaving || !hasChanges || isOffline}
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
                  !config ||
                  (config.enabled === DEFAULTS.enabled &&
                    config.delivery_time === DEFAULTS.delivery_time &&
                    config.timezone === DEFAULTS.timezone &&
                    config.channel === DEFAULTS.channel)
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
          Daily briefs provide an AI-generated summary of your glucose data from
          the previous 24 hours. They are delivered at the scheduled time in
          your selected timezone. Telegram delivery requires a linked Telegram
          account.
        </p>
      </div>
    </div>
  );
}
