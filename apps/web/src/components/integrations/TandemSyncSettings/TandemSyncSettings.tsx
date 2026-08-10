"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TransitionEvent,
} from "react";
import { DashboardTimeRangePicker } from "@/components/DashboardTimeRangePicker";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import { LumoseLoadingLogo } from "@/components/LumoseLoadingLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SaveButton } from "@/components/SaveButton";
import { SettingsReadOnlyValue } from "@/components/settings/SettingsReadOnlyValue";
import { Switch } from "@/components/Switch";
import { TextInput } from "@/components/TextInput";
import { useNotifications } from "@/compositions/NotificationsProvider";
import {
  getTandemSyncAvailability,
  getTandemSyncStatus,
  importTandemRange,
  triggerTandemSync,
  updateTandemSyncSettings,
  type TandemAvailabilityResponse,
  type TandemSyncStatusResponse,
} from "@/lib/api";
import type { HistorySelection } from "@/lib/glucose/history-selection";
import { twMerge } from "@/lib/ui/twMerge";
import { ConnectionInfoCallout } from "../ConnectionSettings";
import type { TandemSyncSettingsProps } from "./TandemSyncSettings.types";
import {
  getImportDateRange,
  getImportHistorySelection,
  getTandemImportRange,
  MAX_IMPORT_DAYS,
  MAX_SYNC_INTERVAL,
  MIN_SYNC_INTERVAL,
  TANDEM_IMPORT_PRESET_RANGES,
  TANDEM_IMPORT_QUICK_RANGES,
  toDay,
} from "./tandemSyncSettings.helpers";
import { tandemSyncIntervalSchema } from "./tandemSyncSettings.schema";

export function TandemSyncSettings({ isOffline }: TandemSyncSettingsProps) {
  const { notifyError } = useNotifications();
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<TandemSyncStatusResponse | null>(
    null,
  );
  const [intervalInput, setIntervalInput] = useState("60");
  const [intervalError, setIntervalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [renderedSyncError, setRenderedSyncError] = useState<string | null>(
    null,
  );
  const [isSyncErrorVisible, setIsSyncErrorVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [availability, setAvailability] =
    useState<TandemAvailabilityResponse | null>(null);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );
  const [importStart, setImportStart] = useState("");
  const [importEnd, setImportEnd] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const notifiedAutomaticSyncErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!success) return;

    const timer = setTimeout(() => setSuccess(null), 5_000);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!syncError) {
      setIsSyncErrorVisible(false);
      return;
    }

    setRenderedSyncError(syncError);
    const animationFrame = requestAnimationFrame(() =>
      setIsSyncErrorVisible(true),
    );
    return () => cancelAnimationFrame(animationFrame);
  }, [syncError]);

  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const status = await getTandemSyncStatus();
      setSyncStatus(status);
      setIntervalInput(String(status.sync_interval_minutes));
      setIntervalError(null);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load sync status",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const automaticSyncError =
      syncStatus?.enabled === true ? syncStatus.last_error : null;

    if (!automaticSyncError) {
      notifiedAutomaticSyncErrorRef.current = null;
      return;
    }

    if (notifiedAutomaticSyncErrorRef.current === automaticSyncError) {
      return;
    }

    notifiedAutomaticSyncErrorRef.current = automaticSyncError;
    notifyError("Automatic pump sync failed", {
      durationMs: null,
      message: automaticSyncError,
    });
  }, [notifyError, syncStatus?.enabled, syncStatus?.last_error]);

  const fetchAvailability = useCallback(async () => {
    setIsCheckingAvailability(true);
    setAvailabilityError(null);

    try {
      const result = await getTandemSyncAvailability();
      setAvailability(result);

      if (result.latest && !importStart && !importEnd) {
        const range = getImportDateRange("30", result.latest, result.earliest);
        setImportStart(range.start);
        setImportEnd(range.end);
      }
    } catch (fetchError) {
      setAvailabilityError(
        fetchError instanceof Error
          ? fetchError.message
          : "Couldn't check the available data range",
      );
    } finally {
      setIsCheckingAvailability(false);
    }
  }, [importEnd, importStart]);

  const saveSettings = async (enabled: boolean, interval: number) => {
    setIsSaving(true);
    setError(null);

    try {
      const result = await updateTandemSyncSettings({
        enabled,
        sync_interval_minutes: interval,
      });
      setSyncStatus(result);
      setIntervalInput(String(result.sync_interval_minutes));
      setIntervalError(null);

      if (enabled && !availability) {
        void fetchAvailability();
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to update settings",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = (enabled: boolean) => {
    if (!syncStatus) return;
    void saveSettings(enabled, syncStatus.sync_interval_minutes);
  };

  const handleIntervalApply = () => {
    if (!syncStatus) return;

    const validationResult = tandemSyncIntervalSchema.safeParse(intervalInput);
    if (!validationResult.success) {
      setIntervalError(validationResult.error.issues[0]?.message ?? null);
      return;
    }

    setIntervalError(null);
    void saveSettings(syncStatus.enabled, validationResult.data);
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncSuccess(null);
    setSyncError(null);
    setError(null);

    try {
      const result = await triggerTandemSync();
      setSyncSuccess(
        `Synced ${result.events_stored} new event(s) from t:connect`,
      );
      await fetchStatus();
    } catch (syncError) {
      setSyncSuccess(null);
      setSyncError(
        syncError instanceof Error
          ? syncError.message
          : "Failed to trigger sync",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const importSelection = useMemo(
    () => getImportHistorySelection(importStart, importEnd),
    [importEnd, importStart],
  );

  const handleImportSelectionChange = (selection: HistorySelection) => {
    if (selection.kind === "preset") {
      const range = getTandemImportRange(selection.range);
      if (!range) return;

      const dates = getImportDateRange(
        range,
        availability?.latest ?? null,
        availability?.earliest ?? null,
      );
      setImportStart(dates.start);
      setImportEnd(dates.end);
      setError(null);
      return;
    }

    setImportStart(toDay(selection.window.from));
    setImportEnd(toDay(selection.window.to));
    setError(null);
  };

  const handleImport = async () => {
    if (!importStart || !importEnd) {
      setError("Pick a start and end date to import");
      return;
    }

    if (importEnd < importStart) {
      setError("End date must be on or after the start date");
      return;
    }

    const startMs =
      toDay(importStart) === importStart
        ? Date.parse(`${importStart}T00:00:00Z`)
        : Number.NaN;
    const requestedEndMs =
      toDay(importEnd) === importEnd
        ? Date.parse(`${importEnd}T23:59:59Z`)
        : Number.NaN;

    if (!Number.isFinite(startMs) || !Number.isFinite(requestedEndMs)) {
      setError("Enter valid start and end dates");
      return;
    }

    const endMs = Math.min(requestedEndMs, Date.now());

    if (endMs < startMs) {
      setError("Start date cannot be in the future");
      return;
    }

    if (endMs - startMs > MAX_IMPORT_DAYS * 86_400_000) {
      setError(
        `Import up to ${MAX_IMPORT_DAYS} days at a time. For older history, import in ${MAX_IMPORT_DAYS}-day chunks.`,
      );
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const result = await importTandemRange(
        new Date(startMs).toISOString(),
        new Date(endMs).toISOString(),
      );
      setSuccess(
        result.events_stored > 0
          ? `Imported ${result.events_stored} new event(s) from ${importStart} to ${importEnd}`
          : `No new events in ${importStart} to ${importEnd} (already imported, or no data there)`,
      );
      await fetchStatus();
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : "Import failed",
      );
    } finally {
      setIsImporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-28 items-center justify-center pt-4">
        <LumoseLoadingLogo
          className="h-10 w-10"
          label="Loading Tandem sync settings"
        />
      </div>
    );
  }

  const needsCountryReselect = syncStatus?.needs_country_reselect ?? false;
  const intervalChanged =
    syncStatus != null &&
    Number(intervalInput) !== syncStatus.sync_interval_minutes;
  const actionsDisabled = isSaving || isOffline;
  const handleSyncErrorTransitionEnd = (
    event: TransitionEvent<HTMLDivElement>,
  ) => {
    if (
      !syncError &&
      event.target === event.currentTarget &&
      event.propertyName === "grid-template-rows"
    ) {
      setRenderedSyncError(null);
    }
  };

  return (
    <section
      aria-labelledby="tandem-automatic-sync-heading"
      className="space-y-6"
      data-testid="tandem-sync-settings"
    >
      <div
        className="space-y-4 border-b border-border-default pb-6"
        data-testid="tandem-automatic-sync-section"
      >
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <h3
              className="font_header_4 text-foreground-primary"
              id="tandem-automatic-sync-heading"
            >
              Automatic pump sync
            </h3>
            <p className="font_body_3 text-foreground-secondary">
              Keep Tandem pump history up to date automatically.
            </p>
          </div>
          <Switch
            checked={syncStatus?.enabled ?? false}
            disabled={
              actionsDisabled ||
              !syncStatus ||
              (needsCountryReselect && !syncStatus.enabled)
            }
            label="Automatic pump sync"
            onCheckedChange={handleToggle}
            visuallyHideLabel
          />
        </div>

        {needsCountryReselect ? (
          <FeedbackMessage
            message="Reconnect Tandem above and select your country so scheduled sync can use the correct Tandem cloud."
            title="Re-select your country"
            variant="warning"
          />
        ) : null}

        {error ? (
          <FeedbackMessage
            message={error}
            title="Tandem sync error"
            variant="error"
          />
        ) : null}

        {success ? (
          <FeedbackMessage message={success} variant="success" />
        ) : null}
      </div>

      {syncStatus ? (
        <div>
          <div
            aria-hidden={!syncStatus.enabled}
            className={twMerge(
              "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none",
              syncStatus.enabled
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0",
            )}
            data-testid="tandem-sync-interval-transition"
            inert={!syncStatus.enabled}
          >
            <div className="min-h-0 overflow-hidden">
              <section
                className="border-b border-border-default pb-6"
                data-testid="tandem-sync-interval-section"
              >
                <div className="space-y-6">
                  <ConnectionInfoCallout title="Sync timing">
                    {MIN_SYNC_INTERVAL} to {MAX_SYNC_INTERVAL} minutes. Tandem
                    refreshes roughly hourly, and scheduled runs start within
                    about 15 minutes of the selected interval.
                  </ConnectionInfoCallout>

                  <div
                    className="grid gap-3 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] sm:items-start sm:gap-8"
                    data-testid="tandem-sync-interval-controls"
                  >
                    <TextInput
                      disabled={actionsDisabled}
                      errorMessage={intervalError}
                      id="tandem-sync-interval"
                      inputMode="numeric"
                      label="Sync interval (minutes)"
                      max={MAX_SYNC_INTERVAL}
                      min={MIN_SYNC_INTERVAL}
                      onChange={(event) => {
                        const nextInterval = event.target.value;
                        setIntervalInput(nextInterval);

                        if (
                          intervalError &&
                          tandemSyncIntervalSchema.safeParse(nextInterval)
                            .success
                        ) {
                          setIntervalError(null);
                        }
                      }}
                      step={1}
                      type="number"
                      value={intervalInput}
                    />
                    <div
                      className="flex justify-end sm:mt-[1.625rem]"
                      data-testid="tandem-sync-interval-action"
                    >
                      <PrimaryButton
                        className="w-full sm:w-auto"
                        disabled={actionsDisabled || !intervalChanged}
                        onClick={handleIntervalApply}
                      >
                        Apply interval
                      </PrimaryButton>
                    </div>
                  </div>
                </div>
              </section>
              <div aria-hidden="true" className="h-6" />
            </div>
          </div>

          <section
            aria-labelledby="tandem-manual-sync-heading"
            className="space-y-4 border-b border-border-default pb-6"
            data-testid="tandem-manual-sync-section"
          >
            <div
              className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
              data-testid="tandem-manual-sync-header"
            >
              <div className="space-y-1">
                <h3
                  className="font_header_4 text-foreground-primary"
                  id="tandem-manual-sync-heading"
                >
                  Manual pump sync
                </h3>
                <p className="font_body_3 text-foreground-secondary">
                  Pull the latest pump history from Tandem on demand.
                </p>
              </div>

              <div className="w-full sm:w-[28rem]">
                <div
                  aria-hidden={!isSyncErrorVisible}
                  className={twMerge(
                    "grid transition-[grid-template-rows,opacity,translate] duration-300 ease-in-out motion-reduce:transition-none",
                    isSyncErrorVisible
                      ? "grid-rows-[1fr] translate-y-0 opacity-100"
                      : "grid-rows-[0fr] -translate-y-2 opacity-0",
                  )}
                  data-testid="tandem-sync-error-transition"
                  onTransitionEnd={handleSyncErrorTransitionEnd}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="pb-3">
                      {renderedSyncError ? (
                        <FeedbackMessage
                          message={renderedSyncError}
                          title="Tandem sync error"
                          variant="error"
                        />
                      ) : null}
                    </div>
                  </div>
                </div>

                <div
                  className="flex justify-end"
                  data-testid="tandem-manual-sync-action"
                >
                  <SaveButton
                    className="w-full sm:w-auto"
                    disabled={actionsDisabled || needsCountryReselect}
                    label="Sync now"
                    onClick={handleSyncNow}
                    savedLabel={syncSuccess ?? "Synced"}
                    savingLabel="Syncing..."
                    state={
                      isSyncing ? "saving" : syncSuccess ? "saved" : "idle"
                    }
                    type="button"
                  />
                </div>
              </div>
            </div>

            <dl
              className="grid gap-4 rounded-panel bg-surface-secondary p-4 sm:grid-cols-3 sm:p-6"
              data-testid="tandem-sync-stats"
            >
              <SettingsReadOnlyValue
                label="Last sync"
                labelClassName="text-foreground-primary"
                value={
                  syncStatus.last_sync_at
                    ? new Date(syncStatus.last_sync_at).toLocaleString()
                    : "No syncs yet"
                }
              />
              <SettingsReadOnlyValue
                label="Events available"
                labelClassName="text-foreground-primary"
                value={syncStatus.events_available.toLocaleString()}
              />
              <SettingsReadOnlyValue
                label="Imported in total"
                labelClassName="text-foreground-primary"
                value={syncStatus.events_pulled_total.toLocaleString()}
              />
            </dl>
          </section>

          <section
            aria-labelledby="tandem-import-heading"
            className="space-y-4 pt-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <h3
                  className="font_header_4 text-foreground-primary"
                  id="tandem-import-heading"
                >
                  Import pump history
                </h3>
                <p className="font_body_3 text-foreground-secondary">
                  Backfill a preset range or choose exact dates.
                </p>
              </div>
              <PrimaryButton
                disabled={isCheckingAvailability || isOffline}
                onClick={() => void fetchAvailability()}
              >
                {isCheckingAvailability
                  ? "Checking..."
                  : availability
                    ? "Refresh available data"
                    : "Check available data"}
              </PrimaryButton>
            </div>

            <p
              className={twMerge(
                "font_body_3",
                availability?.earliest && availability.latest
                  ? "text-signal-warning-text"
                  : availabilityError
                    ? "text-signal-error-text"
                    : "text-foreground-secondary",
              )}
              data-testid="tandem-availability-status"
            >
              {isCheckingAvailability
                ? "Checking what is available in your Tandem cloud."
                : availability?.earliest && availability.latest
                  ? `Data available from ${toDay(availability.earliest)} to ${toDay(availability.latest)}. Import up to ${MAX_IMPORT_DAYS} days at a time.`
                  : availabilityError
                    ? "The available range could not be checked. You can still try an import."
                    : `Import up to ${MAX_IMPORT_DAYS} days at a time.`}
            </p>

            <div
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
              data-testid="tandem-import-controls"
            >
              <div className="min-w-0" data-testid="tandem-import-time-range">
                <DashboardTimeRangePicker
                  currentWindow={
                    importStart &&
                    importEnd &&
                    importSelection.kind === "custom"
                      ? importSelection.window
                      : null
                  }
                  disabled={isImporting || isOffline}
                  maxRangeDays={MAX_IMPORT_DAYS}
                  onChange={handleImportSelectionChange}
                  panelMode="inline"
                  presetRanges={TANDEM_IMPORT_PRESET_RANGES}
                  quickRangeOptions={TANDEM_IMPORT_QUICK_RANGES}
                  selection={importSelection}
                  showNavigationControls={false}
                  timeZone="UTC"
                />
              </div>

              <div
                className="flex justify-end"
                data-testid="tandem-import-action"
              >
                <PrimaryButton
                  className="w-full sm:w-auto"
                  disabled={
                    isImporting ||
                    isOffline ||
                    !importStart ||
                    !importEnd ||
                    needsCountryReselect
                  }
                  onClick={handleImport}
                >
                  {isImporting ? "Importing..." : "Import history"}
                </PrimaryButton>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
