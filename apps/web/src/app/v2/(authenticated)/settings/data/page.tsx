"use client";

import { useState, useEffect, useCallback } from "react";

import { Button, Icon } from "@/base";

/**
 * Stories 9.3, 9.4, 9.5: Data Retention, Purge & Export
 *
 * Allows users to configure retention periods for glucose data,
 * AI analysis results, and audit logs. Displays storage usage.
 * Provides a "Danger Zone" section for permanently purging all data.
 * Provides export of settings and/or all data as a JSON download.
 */

import Link from "next/link";
import { twMerge } from "@/lib/ui/twMerge";
import {
  getDataRetentionConfig,
  updateDataRetentionConfig,
  getStorageUsage,
  purgeUserData,
  exportSettings,
  getAnalyticsConfig,
  updateAnalyticsConfig,
  getPluginDeclarations,
  DEFAULT_DISPLAY_LABELS,
  type DisplayLabel,
  type DataRetentionConfigResponse,
  type StorageUsageResponse,
  type AnalyticsConfigResponse,
  type PluginDeclarationResponse,
} from "@/lib/api";
import { SettingsOfflineNotice } from "@/components/settings/SettingsOfflineNotice";

const DEFAULTS = {
  glucose_retention_days: 365,
  analysis_retention_days: 365,
  audit_retention_days: 730,
};

const RETENTION_OPTIONS = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "6 months" },
  { value: 365, label: "1 year" },
  { value: 730, label: "2 years" },
  { value: 1825, label: "5 years" },
  { value: 3650, label: "10 years" },
];

/** Check if two DisplayLabel arrays are equal (by content). */
function displayLabelsEqual(a: DisplayLabel[], b: DisplayLabel[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (item, i) =>
      item.id === b[i].id &&
      item.label === b[i].label &&
      item.computation_role === b[i].computation_role &&
      item.pump_source === b[i].pump_source &&
      item.sort_order === b[i].sort_order,
  );
}

/** Build default labels, auto-populating pump_source from plugin category_mappings when available. */
function buildDefaultLabels(
  plugin: PluginDeclarationResponse | null,
): DisplayLabel[] {
  const defaults = DEFAULT_DISPLAY_LABELS.map((d) => ({ ...d }));
  if (plugin && plugin.category_mappings) {
    const roleToSource: Record<string, string> = {};
    for (const [pumpCat, role] of Object.entries(plugin.category_mappings)) {
      if (!roleToSource[role]) {
        roleToSource[role] = pumpCat;
      }
    }
    for (const label of defaults) {
      if (label.computation_role && roleToSource[label.computation_role]) {
        label.pump_source = roleToSource[label.computation_role];
      }
    }
  }
  return defaults;
}

/** Generate a unique slug id for a new label. */
function generateLabelId(existingIds: Set<string>): string {
  for (let i = 1; i <= 100; i++) {
    const candidate = `custom_${i}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  return `custom_${Date.now()}`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const ampm =
    i === 0
      ? "12:00 AM (midnight)"
      : i === 12
        ? "12:00 PM (noon)"
        : i < 12
          ? `${i}:00 AM`
          : `${i - 12}:00 PM`;
  return { value: i, label: ampm };
});

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export default function DataRetentionPage() {
  const [config, setConfig] = useState<DataRetentionConfigResponse | null>(
    null,
  );
  const [usage, setUsage] = useState<StorageUsageResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Purge state.
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeInput, setPurgeInput] = useState("");
  const [isPurging, setIsPurging] = useState(false);

  // Export state.
  const [exportType, setExportType] = useState<"settings_only" | "all_data">(
    "settings_only",
  );
  const [isExporting, setIsExporting] = useState(false);

  // Analytics config state
  const [analyticsConfig, setAnalyticsConfig] =
    useState<AnalyticsConfigResponse | null>(null);
  const [boundaryHour, setBoundaryHour] = useState(0);
  const [isSavingBoundary, setIsSavingBoundary] = useState(false);

  // Display labels state
  const [displayLabels, setDisplayLabels] = useState<DisplayLabel[]>(() =>
    DEFAULT_DISPLAY_LABELS.map((d) => ({ ...d })),
  );
  const [savedLabels, setSavedLabels] = useState<DisplayLabel[]>(() =>
    DEFAULT_DISPLAY_LABELS.map((d) => ({ ...d })),
  );
  const [isSavingLabels, setIsSavingLabels] = useState(false);

  // Plugin declaration state
  const [pluginDeclaration, setPluginDeclaration] =
    useState<PluginDeclarationResponse | null>(null);

  // Form state
  const [glucoseDays, setGlucoseDays] = useState(365);
  const [analysisDays, setAnalysisDays] = useState(365);
  const [auditDays, setAuditDays] = useState(730);

  // Auto-clear success message after 5 seconds
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [configData, usageData, analyticsData, pluginData] =
        await Promise.all([
          getDataRetentionConfig(),
          getStorageUsage(),
          getAnalyticsConfig().catch(() => null),
          getPluginDeclarations().catch(() => null),
        ]);
      setConfig(configData);
      setUsage(usageData);
      setGlucoseDays(configData.glucose_retention_days);
      setAnalysisDays(configData.analysis_retention_days);
      setAuditDays(configData.audit_retention_days);
      if (analyticsData) {
        setAnalyticsConfig(analyticsData);
        setBoundaryHour(analyticsData.day_boundary_hour);
        if (
          analyticsData.display_labels &&
          analyticsData.display_labels.length > 0
        ) {
          const sorted = [...analyticsData.display_labels].sort(
            (a, b) => a.sort_order - b.sort_order,
          );
          setDisplayLabels(sorted);
          setSavedLabels(sorted.map((d) => ({ ...d })));
        }
      }
      setPluginDeclaration(pluginData);
      setIsOffline(false);
    } catch (err) {
      if (!(err instanceof Error && err.message.includes("401"))) {
        setIsOffline(true);
      }
      // Use defaults as baseline so the form is still functional
      setConfig({
        glucose_retention_days: DEFAULTS.glucose_retention_days,
        analysis_retention_days: DEFAULTS.analysis_retention_days,
        audit_retention_days: DEFAULTS.audit_retention_days,
      } as DataRetentionConfigResponse);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Check if any retention period is being reduced (destructive operation)
  const isReducingRetention =
    config &&
    (glucoseDays < config.glucose_retention_days ||
      analysisDays < config.analysis_retention_days ||
      auditDays < config.audit_retention_days);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Warn the user if they are reducing any retention period
    if (isReducingRetention) {
      const confirmed = window.confirm(
        "You are reducing one or more retention periods. " +
          "Data older than the new retention period will be permanently " +
          "deleted during the next enforcement cycle. This cannot be undone.\n\n" +
          "Are you sure you want to continue?",
      );
      if (!confirmed) return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Only send fields that actually changed
      const payload: Record<string, unknown> = {};
      if (config && glucoseDays !== config.glucose_retention_days)
        payload.glucose_retention_days = glucoseDays;
      if (config && analysisDays !== config.analysis_retention_days)
        payload.analysis_retention_days = analysisDays;
      if (config && auditDays !== config.audit_retention_days)
        payload.audit_retention_days = auditDays;

      const updated = await updateDataRetentionConfig(
        payload as Parameters<typeof updateDataRetentionConfig>[0],
      );
      setConfig(updated);
      setSuccess("Data retention configuration updated successfully");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update data retention configuration",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    // Resetting to defaults may reduce retention periods — confirm with user
    if (config) {
      const wouldReduce =
        DEFAULTS.glucose_retention_days < config.glucose_retention_days ||
        DEFAULTS.analysis_retention_days < config.analysis_retention_days ||
        DEFAULTS.audit_retention_days < config.audit_retention_days;

      if (wouldReduce) {
        const confirmed = window.confirm(
          "Resetting to defaults will reduce one or more retention periods. " +
            "Data older than the default retention period will be permanently " +
            "deleted during the next enforcement cycle. This cannot be undone.\n\n" +
            "Are you sure you want to reset to defaults?",
        );
        if (!confirmed) return;
      }
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateDataRetentionConfig({
        glucose_retention_days: DEFAULTS.glucose_retention_days,
        analysis_retention_days: DEFAULTS.analysis_retention_days,
        audit_retention_days: DEFAULTS.audit_retention_days,
      });
      setConfig(updated);
      setGlucoseDays(DEFAULTS.glucose_retention_days);
      setAnalysisDays(DEFAULTS.analysis_retention_days);
      setAuditDays(DEFAULTS.audit_retention_days);
      setSuccess("Data retention configuration reset to defaults");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to reset data retention configuration",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handlePurge = async () => {
    if (purgeInput !== "DELETE") return;

    setIsPurging(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await purgeUserData("DELETE");
      setSuccess(
        `${result.message}. All glucose data, AI analysis, and audit records have been permanently removed.`,
      );
      setShowPurgeConfirm(false);
      setPurgeInput("");
      // Refresh storage usage to reflect the purge (failure here is non-critical)
      try {
        const usageData = await getStorageUsage();
        setUsage(usageData);
      } catch {
        // Usage refresh failed but purge succeeded — don't overwrite success
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to purge data");
    } finally {
      setIsPurging(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await exportSettings(exportType);
      const json = JSON.stringify(result.export_data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `glycemicgpt-${exportType === "all_data" ? "full-export" : "settings"}-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccess(
        exportType === "all_data"
          ? "Full data export downloaded successfully"
          : "Settings export downloaded successfully",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export data");
    } finally {
      setIsExporting(false);
    }
  };

  const hasChanges =
    config &&
    (glucoseDays !== config.glucose_retention_days ||
      analysisDays !== config.analysis_retention_days ||
      auditDays !== config.audit_retention_days);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div data-settings-page-header>
        <h1 className="font_poppins font_header_2">Data Retention</h1>
        <p className="text-foreground-secondary">
          Configure how long your data is retained before automatic cleanup
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
        <div
          className="bg-surface-primary rounded-panel p-12 border border-border-default text-center"
          role="status"
          aria-label="Loading data retention configuration"
        >
          <Icon
            decorative
            icon="clock"
            className="h-8 w-8 text-accent animate-spin mx-auto mb-3"
          />
          <p className="text-foreground-secondary">
            Loading data retention configuration...
          </p>
        </div>
      )}

      {/* Storage usage */}
      {!isLoading && usage && (
        <div className="bg-surface-primary rounded-panel border border-border-default p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-accent/10 rounded-panel">
              <Icon
                decorative
                icon="desktop-device"
                className="h-5 w-5 text-accent"
              />
            </div>
            <div>
              <h2 className="font_poppins font_header_4">Storage Usage</h2>
              <p className="font_body_3 text-foreground-secondary">
                Current record counts by category
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-surface-secondary rounded-panel p-3 border border-border-default">
              <p className="font_body_3 text-foreground-secondary mb-1">
                Glucose Data
              </p>
              <p className="font_poppins font_header_4 text-accent">
                {formatNumber(usage.glucose_records + usage.pump_records)}
              </p>
              <p className="font_body_3 text-foreground-secondary">
                {formatNumber(usage.glucose_records)} CGM +{" "}
                {formatNumber(usage.pump_records)} pump
              </p>
            </div>
            <div className="bg-surface-secondary rounded-panel p-3 border border-border-default">
              <p className="font_body_3 text-foreground-secondary mb-1">
                AI Analysis
              </p>
              <p className="font_poppins font_header_4 text-signal-check-text">
                {formatNumber(usage.analysis_records)}
              </p>
              <p className="font_body_3 text-foreground-secondary">
                briefs, meals, corrections
              </p>
            </div>
            <div className="bg-surface-secondary rounded-panel p-3 border border-border-default">
              <p className="font_body_3 text-foreground-secondary mb-1">
                Audit Logs
              </p>
              <p className="font_poppins font_header_4 text-signal-warning-text">
                {formatNumber(usage.audit_records)}
              </p>
              <p className="font_body_3 text-foreground-secondary">
                safety, alerts, escalations
              </p>
            </div>
            <div className="bg-surface-secondary rounded-panel p-3 border border-border-default">
              <p className="font_body_3 text-foreground-secondary mb-1">
                Total Records
              </p>
              <p className="font_poppins font_header_4 text-foreground-primary">
                {formatNumber(usage.total_records)}
              </p>
              <p className="font_body_3 text-foreground-secondary">
                across all categories
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Configuration form */}
      {!isLoading && (
        <div className="bg-surface-primary rounded-panel border border-border-default p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-accent/10 rounded-panel">
              <Icon
                decorative
                icon="desktop-device"
                className="h-5 w-5 text-accent"
              />
            </div>
            <div>
              <h2 className="font_poppins font_header_4">Retention Periods</h2>
              <p className="font_body_3 text-foreground-secondary">
                Set how long each category of data is kept
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Glucose retention */}
            <div>
              <label
                htmlFor="glucose-retention"
                className="block font_ui_label text-foreground-secondary mb-1"
              >
                Glucose Data Retention
              </label>
              <select
                id="glucose-retention"
                value={glucoseDays}
                onChange={(e) => setGlucoseDays(Number(e.target.value))}
                disabled={isSaving}
                className={twMerge(
                  "w-full rounded-panel border px-3 py-2 font_body_2",
                  "bg-surface-secondary border-border-default text-foreground-primary",
                  "focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
                aria-describedby="glucose-retention-hint"
              >
                {RETENTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p
                id="glucose-retention-hint"
                className="font_body_3 text-foreground-secondary mt-1"
              >
                CGM readings and pump events. Default: 1 year
              </p>
            </div>

            {/* Analysis retention */}
            <div>
              <label
                htmlFor="analysis-retention"
                className="block font_ui_label text-foreground-secondary mb-1"
              >
                AI Analysis Retention
              </label>
              <select
                id="analysis-retention"
                value={analysisDays}
                onChange={(e) => setAnalysisDays(Number(e.target.value))}
                disabled={isSaving}
                className={twMerge(
                  "w-full rounded-panel border px-3 py-2 font_body_2",
                  "bg-surface-secondary border-border-default text-foreground-primary",
                  "focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
                aria-describedby="analysis-retention-hint"
              >
                {RETENTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p
                id="analysis-retention-hint"
                className="font_body_3 text-foreground-secondary mt-1"
              >
                Daily briefs, meal analyses, correction analyses. Default: 1
                year
              </p>
            </div>

            {/* Audit retention */}
            <div>
              <label
                htmlFor="audit-retention"
                className="block font_ui_label text-foreground-secondary mb-1"
              >
                Audit Log Retention
              </label>
              <select
                id="audit-retention"
                value={auditDays}
                onChange={(e) => setAuditDays(Number(e.target.value))}
                disabled={isSaving}
                className={twMerge(
                  "w-full rounded-panel border px-3 py-2 font_body_2",
                  "bg-surface-secondary border-border-default text-foreground-primary",
                  "focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
                aria-describedby="audit-retention-hint"
              >
                {RETENTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p
                id="audit-retention-hint"
                className="font_body_3 text-foreground-secondary mt-1"
              >
                Safety logs, alerts, escalation events. Default: 2 years
              </p>
            </div>

            {/* Preview */}
            {!isLoading && (
              <div className="bg-surface-secondary rounded-panel p-4 border border-border-default">
                <p className="font_body_3 text-foreground-secondary mb-2">
                  Preview
                </p>
                <p className="font_poppins font_header_4 text-accent">
                  Glucose:{" "}
                  {RETENTION_OPTIONS.find((o) => o.value === glucoseDays)
                    ?.label ?? `${glucoseDays} days`}{" "}
                  &middot; Analysis:{" "}
                  {RETENTION_OPTIONS.find((o) => o.value === analysisDays)
                    ?.label ?? `${analysisDays} days`}{" "}
                  &middot; Audit:{" "}
                  {RETENTION_OPTIONS.find((o) => o.value === auditDays)
                    ?.label ?? `${auditDays} days`}
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
                  (config.glucose_retention_days ===
                    DEFAULTS.glucose_retention_days &&
                    config.analysis_retention_days ===
                      DEFAULTS.analysis_retention_days &&
                    config.audit_retention_days ===
                      DEFAULTS.audit_retention_days)
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

      {/* Analytics Day Boundary */}
      {!isLoading && (
        <div className="bg-surface-primary rounded-panel border border-border-default p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-accent/10 rounded-panel">
              <Icon decorative icon="clock" className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="font_poppins font_header_4">
                Analytics Day Boundary
              </h2>
              <p className="font_body_3 text-foreground-secondary">
                Controls when your daily analytics period resets
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-surface-secondary rounded-panel p-4 border border-border-default">
              <p className="font_body_2 text-foreground-secondary mb-2">
                The day boundary determines when analytics periods like Insulin
                Summary and Recent Boluses start counting each day. Most insulin
                pumps reset their Delivery Summary at midnight, so the default
                boundary is{" "}
                <strong className="text-foreground-primary">12:00 AM</strong>.
              </p>
              <p className="font_body_2 text-foreground-secondary">
                Changing this affects how &ldquo;24H&rdquo;, &ldquo;3D&rdquo;,
                and &ldquo;7D&rdquo; periods are calculated for insulin delivery
                statistics. For example, if your pump resets at a different
                time, or you work night shifts, you can align the boundary to
                match your schedule. Charts, Time in Range, and CGM Stats are
                not affected &mdash; they always use a rolling window.
              </p>
            </div>

            <div>
              <label
                htmlFor="day-boundary-hour"
                className="block font_ui_label text-foreground-secondary mb-1"
              >
                Day starts at
              </label>
              <select
                id="day-boundary-hour"
                value={boundaryHour}
                onChange={(e) => setBoundaryHour(Number(e.target.value))}
                disabled={isSavingBoundary || isOffline}
                className={twMerge(
                  "w-full rounded-panel border px-3 py-2 font_body_2",
                  "bg-surface-secondary border-border-default text-foreground-primary",
                  "focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
                aria-describedby="day-boundary-hint"
              >
                {HOUR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p
                id="day-boundary-hint"
                className="font_body_3 text-foreground-secondary mt-1"
              >
                Hour in your local time when the analytics day resets. Default:
                12:00 AM (midnight)
              </p>
            </div>

            <Button
              type="button"
              disabled={
                isSavingBoundary ||
                isOffline ||
                (analyticsConfig !== null &&
                  boundaryHour === analyticsConfig.day_boundary_hour)
              }
              onClick={async () => {
                setIsSavingBoundary(true);
                setError(null);
                setSuccess(null);
                try {
                  const updated = await updateAnalyticsConfig({
                    day_boundary_hour: boundaryHour,
                  });
                  setAnalyticsConfig(updated);
                  setBoundaryHour(updated.day_boundary_hour);
                  setSuccess("Analytics day boundary updated successfully");
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Failed to update analytics day boundary",
                  );
                } finally {
                  setIsSavingBoundary(false);
                }
              }}
              className={twMerge(
                "flex items-center gap-1.5 px-4 py-2 rounded-panel font_ui_label",
                "bg-accent text-accent-foreground hover:bg-accent-hover",
                "transition-colors",
                "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isSavingBoundary ? (
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
              {isSavingBoundary ? "Saving..." : "Save Boundary"}
            </Button>
          </div>
        </div>
      )}

      {/* Bolus Display Labels */}
      {!isLoading && (
        <div className="bg-surface-primary rounded-panel border border-border-default p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-accent/10 rounded-panel">
              <Icon
                decorative
                icon="bookmark"
                className="h-5 w-5 text-accent"
              />
            </div>
            <div>
              <h2 className="font_poppins font_header_4">
                Bolus Display Labels
              </h2>
              <p className="font_body_3 text-foreground-secondary">
                Customize how bolus categories are displayed across the platform
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Active plugin info */}
            <div className="bg-surface-secondary rounded-panel p-4 border border-border-default">
              <div className="flex items-center gap-2 mb-2">
                <Icon
                  decorative
                  icon="link"
                  className="h-4 w-4 text-foreground-secondary"
                  aria-hidden="true"
                />
                <span className="font_ui_label text-foreground-secondary">
                  Active Plugin:
                </span>
                {pluginDeclaration ? (
                  <span className="font_body_2 text-accent">
                    {pluginDeclaration.plugin_name} v
                    {pluginDeclaration.plugin_version}
                  </span>
                ) : (
                  <span className="font_body_2 text-foreground-secondary italic">
                    No pump plugin connected
                  </span>
                )}
              </div>
              <p className="font_body_2 text-foreground-secondary">
                Labels control how bolus categories appear in the Insulin
                Summary, charts, and dashboards on both web and mobile. Assign a
                Pump Source to link labels with your pump&apos;s native
                categories.
              </p>
            </div>

            {/* Display labels table */}
            <div className="overflow-x-auto">
              <table className="w-full font_body_2">
                <thead>
                  <tr className="border-b border-border-default">
                    <th className="text-left py-2 pr-2 font_ui_caption text-foreground-secondary uppercase tracking-wider w-8">
                      <span className="sr-only">Order</span>
                    </th>
                    <th className="text-left py-2 px-2 font_ui_caption text-foreground-secondary uppercase tracking-wider">
                      Display Label
                    </th>
                    <th className="text-left py-2 px-2 font_ui_caption text-foreground-secondary uppercase tracking-wider">
                      Pump Source
                    </th>
                    <th className="text-right py-2 pl-2 font_ui_caption text-foreground-secondary uppercase tracking-wider w-10">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayLabels.map((item, index) => (
                    <tr
                      key={item.id}
                      className="border-b border-border-default"
                    >
                      {/* Reorder controls */}
                      <td className="py-2 pr-2">
                        <div className="flex flex-col gap-0.5">
                          <Button
                            type="button"
                            disabled={index === 0 || isSavingLabels}
                            aria-label={`Move ${item.label} up`}
                            onClick={() => {
                              setDisplayLabels((prev) => {
                                const next = [...prev];
                                [next[index - 1], next[index]] = [
                                  next[index],
                                  next[index - 1],
                                ];
                                return next.map((l, i) => ({
                                  ...l,
                                  sort_order: i,
                                }));
                              });
                            }}
                            className="text-foreground-secondary hover:text-foreground-primary disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Icon
                              decorative
                              icon="chevron"
                              className="h-3 w-3 -rotate-90"
                            />
                          </Button>
                          <Button
                            type="button"
                            disabled={
                              index === displayLabels.length - 1 ||
                              isSavingLabels
                            }
                            aria-label={`Move ${item.label} down`}
                            onClick={() => {
                              setDisplayLabels((prev) => {
                                const next = [...prev];
                                [next[index], next[index + 1]] = [
                                  next[index + 1],
                                  next[index],
                                ];
                                return next.map((l, i) => ({
                                  ...l,
                                  sort_order: i,
                                }));
                              });
                            }}
                            className="text-foreground-secondary hover:text-foreground-primary disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Icon
                              decorative
                              icon="chevron"
                              className="h-3 w-3 rotate-90"
                            />
                          </Button>
                        </div>
                      </td>
                      {/* Label text input */}
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            id={`label-${item.id}`}
                            type="text"
                            maxLength={20}
                            aria-label={`${item.label} display label`}
                            value={item.label}
                            onChange={(e) => {
                              const newLabel = e.target.value;
                              setDisplayLabels((prev) =>
                                prev.map((l) =>
                                  l.id === item.id
                                    ? { ...l, label: newLabel }
                                    : l,
                                ),
                              );
                            }}
                            disabled={isSavingLabels || isOffline}
                            className={twMerge(
                              "w-full rounded-panel border px-2 py-1.5 font_body_2",
                              "bg-surface-secondary border-border-default text-foreground-primary",
                              "placeholder:text-foreground-secondary",
                              "focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent",
                              "disabled:opacity-50 disabled:cursor-not-allowed",
                            )}
                          />
                        </div>
                      </td>
                      {/* Pump source dropdown */}
                      <td className="py-2 px-2">
                        <select
                          aria-label={`${item.label} pump source`}
                          value={item.pump_source ?? ""}
                          onChange={(e) => {
                            const val = e.target.value || null;
                            setDisplayLabels((prev) =>
                              prev.map((l) =>
                                l.id === item.id
                                  ? { ...l, pump_source: val }
                                  : l,
                              ),
                            );
                          }}
                          disabled={
                            isSavingLabels || isOffline || !pluginDeclaration
                          }
                          className={twMerge(
                            "w-full rounded-panel border px-2 py-1.5 font_body_2",
                            "bg-surface-secondary border-border-default text-foreground-primary",
                            "focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                          )}
                        >
                          <option value="">{"\u2014"}</option>
                          {pluginDeclaration?.declared_categories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </td>
                      {/* Delete button */}
                      <td className="py-2 pl-2 text-right">
                        <Button
                          type="button"
                          aria-label={`Delete ${item.label}`}
                          disabled={isSavingLabels || displayLabels.length <= 1}
                          onClick={() => {
                            setDisplayLabels((prev) =>
                              prev
                                .filter((l) => l.id !== item.id)
                                .map((l, i) => ({ ...l, sort_order: i })),
                            );
                          }}
                          className="text-foreground-secondary hover:text-signal-error-text disabled:opacity-30 disabled:cursor-not-allowed p-1"
                        >
                          <Icon
                            decorative
                            icon="circle-slash"
                            className="h-4 w-4"
                          />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add Label button */}
            <Button
              type="button"
              disabled={
                isSavingLabels || isOffline || displayLabels.length >= 20
              }
              onClick={() => {
                const existingIds = new Set(displayLabels.map((l) => l.id));
                const newId = generateLabelId(existingIds);
                setDisplayLabels((prev) => [
                  ...prev,
                  {
                    id: newId,
                    label: "New Label",
                    computation_role: null,
                    pump_source: null,
                    sort_order: prev.length,
                  },
                ]);
              }}
              className={twMerge(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-panel font_body_2",
                "bg-surface-secondary text-foreground-secondary hover:bg-surface-secondary",
                "transition-colors border border-border-default",
                "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <Icon
                decorative
                icon="person-add"
                className="h-4 w-4"
                aria-hidden="true"
              />
              Add Label
            </Button>

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                disabled={
                  isSavingLabels ||
                  isOffline ||
                  displayLabels.length === 0 ||
                  displayLabelsEqual(displayLabels, savedLabels)
                }
                onClick={async () => {
                  setIsSavingLabels(true);
                  setError(null);
                  setSuccess(null);
                  try {
                    const updated = await updateAnalyticsConfig({
                      display_labels: displayLabels,
                    });
                    setAnalyticsConfig(updated);
                    if (
                      updated.display_labels &&
                      updated.display_labels.length > 0
                    ) {
                      const sorted = [...updated.display_labels].sort(
                        (a, b) => a.sort_order - b.sort_order,
                      );
                      setDisplayLabels(sorted);
                      setSavedLabels(sorted.map((d) => ({ ...d })));
                    }
                    setSuccess("Display labels updated successfully");
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Failed to update display labels",
                    );
                  } finally {
                    setIsSavingLabels(false);
                  }
                }}
                className={twMerge(
                  "flex items-center gap-1.5 px-4 py-2 rounded-panel font_ui_label",
                  "bg-accent text-accent-foreground hover:bg-accent-hover",
                  "transition-colors",
                  "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {isSavingLabels ? (
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
                {isSavingLabels ? "Saving..." : "Save Labels"}
              </Button>

              <Button
                type="button"
                onClick={() => {
                  setDisplayLabels(buildDefaultLabels(pluginDeclaration));
                }}
                disabled={
                  isSavingLabels ||
                  displayLabelsEqual(
                    displayLabels,
                    buildDefaultLabels(pluginDeclaration),
                  )
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
          </div>
        </div>
      )}

      {/* Export data */}
      {!isLoading && (
        <div className="bg-surface-primary rounded-panel border border-border-default p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-signal-check-fill/10 rounded-panel">
              <Icon
                decorative
                icon="share"
                className="h-5 w-5 text-signal-check-text"
              />
            </div>
            <div>
              <h2 className="font_poppins font_header_4">Export Data</h2>
              <p className="font_body_3 text-foreground-secondary">
                Download your settings and data as a JSON file
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <fieldset>
              <legend className="font_ui_label text-foreground-secondary mb-2">
                Export type
              </legend>
              <div className="space-y-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="export-type"
                    value="settings_only"
                    checked={exportType === "settings_only"}
                    onChange={() => setExportType("settings_only")}
                    disabled={isExporting}
                    className="mt-1 accent-accent"
                  />
                  <div>
                    <p className="font_body_2 text-foreground-primary">
                      Settings only
                    </p>
                    <p className="font_body_3 text-foreground-secondary">
                      Alert thresholds, glucose range, escalation timing, brief
                      delivery, data retention, AI provider, integrations
                      (without credentials), and emergency contacts
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="export-type"
                    value="all_data"
                    checked={exportType === "all_data"}
                    onChange={() => setExportType("all_data")}
                    disabled={isExporting}
                    className="mt-1 accent-accent"
                  />
                  <div>
                    <p className="font_body_2 text-foreground-primary">
                      All data (JSON archive)
                    </p>
                    <p className="font_body_3 text-foreground-secondary">
                      Everything above plus glucose readings, pump events, daily
                      briefs, AI analyses, safety logs, and alerts
                    </p>
                  </div>
                </label>
              </div>
            </fieldset>

            <Button
              type="button"
              onClick={handleExport}
              disabled={isExporting || isSaving || isPurging || isOffline}
              className={twMerge(
                "flex items-center gap-1.5 px-4 py-2 rounded-panel font_ui_label",
                "bg-accent text-accent-foreground hover:bg-accent-hover",
                "transition-colors",
                "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isExporting ? (
                <Icon
                  decorative
                  icon="clock"
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Icon
                  decorative
                  icon="share"
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              )}
              {isExporting ? "Exporting..." : "Download Export"}
            </Button>
          </div>
        </div>
      )}

      {/* Clinical Report Link */}
      {!isLoading && (
        <Link
          href="/dashboard/reports/clinical"
          className="block bg-surface-primary rounded-panel border border-border-default p-6 hover:border-accent transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/10 rounded-panel">
                <Icon
                  decorative
                  icon="book-open"
                  className="h-5 w-5 text-accent"
                  aria-hidden="true"
                />
              </div>
              <div>
                <h2 className="font_poppins font_header_4 text-foreground-primary group-hover:text-accent transition-colors">
                  Clinical Report
                </h2>
                <p className="font_body_2 text-foreground-secondary">
                  Generate a printable report for your healthcare provider
                </p>
              </div>
            </div>
            <Icon
              decorative
              icon="chevron"
              className="h-5 w-5 text-foreground-secondary group-hover:text-accent transition-colors"
              aria-hidden="true"
            />
          </div>
        </Link>
      )}

      {/* Danger zone */}
      {!isLoading && (
        <div className="bg-surface-primary rounded-panel border border-signal-error-text p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-signal-error-fill/10 rounded-panel">
              <Icon
                decorative
                icon="trash"
                className="h-5 w-5 text-signal-error-text"
              />
            </div>
            <div>
              <h2 className="font_poppins font_header_4 text-signal-error-text">
                Danger Zone
              </h2>
              <p className="font_body_3 text-foreground-secondary">
                Irreversible actions that permanently delete your data
              </p>
            </div>
          </div>

          {!showPurgeConfirm ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font_body_2 text-foreground-secondary">
                  Purge All Data
                </p>
                <p className="font_body_3 text-foreground-secondary">
                  Permanently delete all glucose readings, pump events, AI
                  analysis, and audit records. Account settings are preserved.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setShowPurgeConfirm(true)}
                disabled={isPurging || isSaving || isOffline}
                className={twMerge(
                  "flex items-center gap-1.5 px-4 py-2 rounded-panel font_ui_label",
                  "bg-signal-error-fill/10 text-signal-error-text border border-signal-error-text",
                  "hover:bg-signal-error-fill/20",
                  "transition-colors",
                  "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-signal-error-text",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <Icon
                  decorative
                  icon="trash"
                  className="h-4 w-4"
                  aria-hidden="true"
                />
                Purge All Data
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                className="bg-signal-error-fill/10 rounded-panel p-4 border border-signal-error-text"
                role="alert"
              >
                <div className="flex items-start gap-2">
                  <Icon
                    decorative
                    icon="circle-slash"
                    className="h-4 w-4 text-signal-error-text shrink-0 mt-0.5"
                  />
                  <div className="font_body_2 text-signal-error-text">
                    <p className="font_ui_label mb-1">
                      This action is irreversible
                    </p>
                    <p>
                      All glucose readings, pump events, daily briefs, meal
                      analyses, correction analyses, safety logs, alerts, and
                      escalation events will be permanently deleted.
                    </p>
                    <p className="mt-2">
                      Your account, settings, integrations, emergency contacts,
                      and caregiver links will be preserved.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="purge-confirm"
                  className="block font_ui_label text-foreground-secondary mb-1"
                >
                  Type{" "}
                  <span className="font_poppins text-signal-error-text">
                    DELETE
                  </span>{" "}
                  to confirm
                </label>
                <input
                  id="purge-confirm"
                  type="text"
                  value={purgeInput}
                  onChange={(e) => setPurgeInput(e.target.value)}
                  disabled={isPurging}
                  placeholder="Type DELETE to confirm"
                  autoComplete="off"
                  className={twMerge(
                    "w-full rounded-panel border px-3 py-2 font_body_2",
                    "bg-surface-secondary border-border-default text-foreground-primary",
                    "placeholder:text-foreground-secondary",
                    "focus:outline-hidden focus:ring-2 focus:ring-signal-error-text focus:border-transparent",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  onClick={handlePurge}
                  disabled={purgeInput !== "DELETE" || isPurging}
                  className={twMerge(
                    "flex items-center gap-1.5 px-4 py-2 rounded-panel font_ui_label",
                    "bg-surface-fixed-critical text-foreground-fixed-light hover:opacity-90",
                    "transition-colors",
                    "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-signal-error-text",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {isPurging ? (
                    <Icon
                      decorative
                      icon="clock"
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Icon
                      decorative
                      icon="trash"
                      className="h-4 w-4"
                      aria-hidden="true"
                    />
                  )}
                  {isPurging ? "Purging..." : "Permanently Delete All Data"}
                </Button>

                <Button
                  type="button"
                  onClick={() => {
                    setShowPurgeConfirm(false);
                    setPurgeInput("");
                  }}
                  disabled={isPurging}
                  className={twMerge(
                    "px-4 py-2 rounded-panel font_ui_label",
                    "bg-surface-secondary text-foreground-secondary hover:bg-surface-secondary",
                    "transition-colors",
                    "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info card */}
      <div className="bg-surface-elevated rounded-panel p-4 border border-border-default">
        <p className="font_body_3 text-foreground-secondary">
          Data retention policies are enforced automatically on a daily
          schedule. Records older than the configured retention period will be
          permanently deleted. Reducing retention periods will cause older data
          to be removed during the next enforcement cycle. Minimum retention is
          30 days.
        </p>
      </div>
    </div>
  );
}
