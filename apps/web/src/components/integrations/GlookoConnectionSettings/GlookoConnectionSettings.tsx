"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/base";
import {
  connectGlooko,
  disconnectGlooko,
  getGlookoStatus,
  getGlookoSyncAvailability,
  importGlookoHistory,
  syncGlookoNow,
  updateGlookoSyncSettings,
  type GlookoAvailability,
  type GlookoStatus,
  type GlookoSyncResult,
} from "@/lib/api";
import { twMerge } from "@/lib/ui/twMerge";
import { PasswordTextInput } from "@/components/PasswordTextInput";
import { Checkbox } from "@/components/Checkbox";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import { SelectField } from "@/components/SelectField";
import { SettingsReadOnlyValue } from "@/components/settings/SettingsReadOnlyValue";
import { Switch } from "@/components/Switch";
import { TextInput } from "@/components/TextInput";
import {
  getGlookoCredentialErrors,
  glookoCredentialsSchema,
  glookoIntervalSchema,
  type GlookoCredentialErrors,
  type GlookoCredentialField,
} from "./glookoConnectionSettings.schema";
import type { GlookoConnectionSettingsProps } from "./GlookoConnectionSettings.types";

/**
 * Omnipod via Glooko -- autonomous cloud sync.
 *
 * Omnipod 5 uploads to Glooko only, so Glooko is the onramp. Unlike Medtronic
 * Connect (whose mobile-app login needs a desktop helper), Glooko authenticates
 * with a plain web session, so the user connects directly with their Glooko
 * email + password and a required consent acknowledgment. The backend validates
 * the credentials live, stores them encrypted, and syncs on a schedule. The
 * credentials never come back to the browser.
 */

const MIN_INTERVAL = 15;
const MAX_INTERVAL = 1440;

// US and EU select the region-prefixed Glooko hosts (us.api / eu.api).
const REGIONS = [
  { code: "US", label: "United States" },
  { code: "EU", label: "Europe / International" },
] as const;
const REGION_OPTIONS = REGIONS.map((region) => ({
  label: region.label,
  value: region.code,
}));

function regionLabel(code: string | null | undefined): string {
  return REGIONS.find((r) => r.code === code)?.label ?? code ?? "";
}

const EMPTY_CREDENTIAL_ERRORS: GlookoCredentialErrors = {
  acceptRisk: [],
  email: [],
  password: [],
  region: [],
};

export function GlookoConnectionSettings({
  isOffline,
  onStatusChange,
}: GlookoConnectionSettingsProps) {
  const [status, setStatus] = useState<GlookoStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  // True when the initial status fetch failed on a transport/auth error (the
  // endpoint returns 200 "not_configured" when there's simply no connection, so
  // an actual failure here is transient -- we show a retry, not the connect form).
  const [loadFailed, setLoadFailed] = useState(false);

  // Connect-form state.
  const [regionCode, setRegionCode] = useState<"US" | "EU">("US");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [acceptRisk, setAcceptRisk] = useState<boolean>(false);
  const [credentialErrors, setCredentialErrors] =
    useState<GlookoCredentialErrors>(EMPTY_CREDENTIAL_ERRORS);
  const [isConnecting, setIsConnecting] = useState(false);

  // Settings + actions state.
  const [interval, setIntervalMinutes] = useState<number>(30);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [cgmSyncEnabled, setCgmSyncEnabled] = useState<boolean>(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // CGM availability is fetched on demand (it does a live Glooko login), not on
  // mount -- auto-probing on every page visit would add credential-replay
  // traffic to Glooko on every render, which we'd rather keep minimal.
  const [availability, setAvailability] = useState<GlookoAvailability | null>(
    null,
  );
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<GlookoSyncResult | null>(null);

  const applyStatus = useCallback(
    (s: GlookoStatus) => {
      setStatus(s);
      setEnabled(s.enabled);
      setCgmSyncEnabled(s.cgm_sync_enabled ?? true);
      if (s.sync_interval_minutes) setIntervalMinutes(s.sync_interval_minutes);
      onStatusChange?.(s, false);
    },
    [onStatusChange],
  );

  const loadStatus = useCallback(async () => {
    setLoadFailed(false);
    try {
      applyStatus(await getGlookoStatus());
    } catch {
      // 200 "not_configured" covers the no-connection case, so reaching here is
      // a transient transport/auth failure -- flag it instead of silently
      // rendering the connect form for a possibly-connected account.
      setLoadFailed(true);
      onStatusChange?.(null, true);
    } finally {
      setLoaded(true);
    }
  }, [applyStatus, onStatusChange]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // "configured" = a row exists (any state). "needsReconnect" = the stored login
  // is no longer valid, so the user must re-enter credentials. A transient
  // "error" status keeps the connected controls (it's a retryable sync failure),
  // whereas "disconnected" sends the user back to the connect form.
  const configured = !!status && status.status !== "not_configured";
  const needsReconnect = status?.status === "disconnected";
  // When the initial load failed we can't tell connected from not-connected, so
  // show a retry rather than the connect form (which would imply not-connected).
  const showLoadError = loaded && loadFailed && !configured;
  const showConnectForm =
    loaded && !showLoadError && (!configured || needsReconnect);
  const showControls = loaded && configured && !needsReconnect && !!status;
  const isConnected = status?.status === "connected";

  const handleConnect = useCallback(async () => {
    setError(null);
    setSyncResult(null);
    const validation = glookoCredentialsSchema.safeParse({
      acceptRisk,
      email,
      password,
      region: regionCode,
    });
    if (!validation.success) {
      setCredentialErrors(
        getGlookoCredentialErrors({
          acceptRisk,
          email,
          password,
          region: regionCode,
        }),
      );
      return;
    }
    setCredentialErrors(EMPTY_CREDENTIAL_ERRORS);
    setIsConnecting(true);
    try {
      const s = await connectGlooko({
        email: validation.data.email,
        password: validation.data.password,
        region: validation.data.region,
        acceptRisk: validation.data.acceptRisk,
      });
      applyStatus(s);
      setAvailability(null);
      // Don't keep the password in component state after a successful connect.
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect Glooko");
    } finally {
      setIsConnecting(false);
    }
  }, [email, password, acceptRisk, regionCode, applyStatus]);

  const updateCredential = useCallback(
    (field: GlookoCredentialField, value: string | boolean) => {
      if (field === "email") setEmail(value as string);
      if (field === "password") setPassword(value as string);
      if (field === "region") setRegionCode(value as "US" | "EU");
      if (field === "acceptRisk") setAcceptRisk(value as boolean);
      setCredentialErrors((current) => ({ ...current, [field]: [] }));
    },
    [],
  );

  const saveSettings = useCallback(async () => {
    setError(null);
    const validation = glookoIntervalSchema.safeParse(interval);
    if (!validation.success) return;
    setIsSavingSettings(true);
    try {
      applyStatus(
        await updateGlookoSyncSettings(
          enabled,
          validation.data,
          cgmSyncEnabled,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  }, [enabled, interval, cgmSyncEnabled, applyStatus]);

  const syncNow = useCallback(async () => {
    setError(null);
    setSyncResult(null);
    setIsSyncing(true);
    try {
      setSyncResult(await syncGlookoNow());
      // The sync itself succeeded; a failed status refresh must not turn that
      // into "Sync failed". Refresh best-effort -- the status reloads anyway.
      try {
        applyStatus(await getGlookoStatus());
      } catch {
        /* keep the successful sync result */
      }
    } catch (e) {
      // A failed sync may have flipped the connection to disconnected; refresh so
      // the card reflects it instead of showing a stale "Connected" banner. When
      // it did disconnect, the reconnect prompt already explains it -- skip the
      // redundant error banner; otherwise surface the failure.
      try {
        const s = await getGlookoStatus();
        applyStatus(s);
        if (s.status !== "disconnected") {
          setError(e instanceof Error ? e.message : "Sync failed");
        }
      } catch {
        setError(e instanceof Error ? e.message : "Sync failed");
      }
    } finally {
      setIsSyncing(false);
    }
  }, [applyStatus]);

  const importHistory = useCallback(async () => {
    setError(null);
    setSyncResult(null);
    setIsImporting(true);
    try {
      setSyncResult(await importGlookoHistory());
      try {
        applyStatus(await getGlookoStatus());
      } catch {
        /* keep the successful import result */
      }
    } catch (e) {
      // Same as syncNow: refresh so a disconnect is reflected; when disconnected
      // the reconnect prompt covers it, so skip the redundant error banner.
      try {
        const s = await getGlookoStatus();
        applyStatus(s);
        if (s.status !== "disconnected") {
          setError(e instanceof Error ? e.message : "Import failed");
        }
      } catch {
        setError(e instanceof Error ? e.message : "Import failed");
      }
    } finally {
      setIsImporting(false);
    }
  }, [applyStatus]);

  // Read-only probe: authenticates and walks the CGM window but never mutates
  // the sync state. User-initiated so the live login only happens when asked.
  const checkAvailability = useCallback(async () => {
    setError(null);
    setIsCheckingAvailability(true);
    try {
      setAvailability(await getGlookoSyncAvailability());
    } catch (e) {
      setAvailability(null);
      setError(
        e instanceof Error ? e.message : "Failed to check available data",
      );
    } finally {
      setIsCheckingAvailability(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    setIsDisconnecting(true);
    try {
      await disconnectGlooko();
      setStatus(null);
      onStatusChange?.(null, false);
      setAvailability(null);
      setSyncResult(null);
      setAcceptRisk(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setIsDisconnecting(false);
    }
  }, [onStatusChange]);

  const intervalValidation = glookoIntervalSchema.safeParse(interval);
  const intervalErrors = intervalValidation.success
    ? []
    : intervalValidation.error.issues.map((issue) => issue.message);
  const intervalValid = intervalValidation.success;

  const btnClass = twMerge(
    "rounded-panel px-4 py-2 font_ui_label transition-colors",
    "bg-accent hover:bg-accent-hover text-accent-foreground",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <p className="font_ui_label text-foreground-primary">
          Automatic sync (Omnipod via Glooko)
        </p>
      </div>
      <div className="space-y-2 font_body_2 text-foreground-secondary">
        <p>
          Keep GlycemicGPT updated automatically from your Glooko account — the
          only place an Omnipod 5 uploads its data. Pulls basal, bolus, and pod
          changes; sensor glucose syncs too when your Omnipod streams it to
          Glooko.
        </p>
      </div>

      {/* ---- Initial status load failed (transient): offer a retry ---- */}
      {showLoadError && (
        <div className="space-y-2">
          <p className="font_body_2 text-foreground-secondary">
            Couldn&apos;t load your Glooko connection status.
          </p>
          <Button
            type="button"
            onClick={() => void loadStatus()}
            disabled={isOffline}
            className="rounded-panel border border-border-default px-4 py-2 font_ui_label text-foreground-secondary hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Retry
          </Button>
        </div>
      )}

      {/* ---- Not connected (or login expired): direct email/password connect ---- */}
      {showConnectForm && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleConnect();
          }}
        >
          {needsReconnect && (
            <div
              role="alert"
              className="rounded-panel border border-signal-warning-text bg-signal-warning-fill/10 p-3 font_body_2 text-signal-warning-text"
            >
              Your Glooko login is no longer valid. Re-enter your current Glooko
              password below to resume syncing.
              {status?.last_error ? ` (${status.last_error})` : ""}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-md">
            <TextInput
              autoComplete="email"
              disabled={isOffline || isConnecting}
              id="glooko-email"
              label="Glooko email"
              errorMessages={credentialErrors.email}
              onChange={(event) =>
                updateCredential("email", event.target.value)
              }
              placeholder="you@example.com"
              type="email"
              value={email}
            />
            <SelectField
              disabled={isOffline || isConnecting}
              id="glooko-region"
              label="Region"
              errorMessage={credentialErrors.region[0]}
              onChange={(event) =>
                updateCredential("region", event.target.value)
              }
              options={REGION_OPTIONS}
              value={regionCode}
            />
          </div>
          <div className="max-w-md">
            <PasswordTextInput
              id="glooko-password"
              value={password}
              errorMessages={credentialErrors.password}
              onChange={(event) =>
                updateCredential("password", event.target.value)
              }
              disabled={isOffline || isConnecting}
              label="Glooko password"
            />
          </div>

          {/* Required acknowledgment: Glooko has no official app integration, so
              we sign in with the user's credentials. We ask them to confirm they
              understand this isn't officially supported before we store
              credentials and sync on their behalf. */}
          <div className="rounded-panel border border-border-default bg-surface-secondary p-3">
            <Checkbox
              aria-describedby={
                credentialErrors.acceptRisk.length
                  ? "glooko-accept-risk-error"
                  : undefined
              }
              aria-invalid={credentialErrors.acceptRisk.length > 0}
              checked={acceptRisk}
              disabled={isOffline || isConnecting}
              id="glooko-accept-risk"
              label={
                <span>
                  I understand that Glooko doesn&apos;t offer an official way
                  for other apps to connect, so GlycemicGPT signs in with my
                  Glooko credentials on my behalf. This isn&apos;t officially
                  supported by Glooko, and I&apos;m connecting my own account by
                  choice.
                </span>
              }
              onCheckedChange={(checked) =>
                updateCredential("acceptRisk", checked)
              }
            />
            {credentialErrors.acceptRisk.length ? (
              <p
                className="mt-2 font_body_3 text-signal-error-text"
                id="glooko-accept-risk-error"
                role="alert"
              >
                {credentialErrors.acceptRisk[0]}
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            disabled={isOffline || isConnecting}
            className={btnClass}
          >
            {isConnecting
              ? "Connecting…"
              : needsReconnect
                ? "Reconnect Glooko"
                : "Connect Glooko"}
          </Button>
          <p className="font_body_3 text-foreground-secondary">
            Your Glooko password is encrypted and stored only to keep the sync
            authorized — it is never shown back to you. Data flows one way: from
            Glooko into GlycemicGPT.
          </p>
        </form>
      )}

      {/* ---- Configured (connected, or a retryable error): status + controls ---- */}
      {showControls && status && (
        <div className="space-y-4">
          <dl className="grid gap-4 rounded-panel bg-surface-secondary p-4 sm:grid-cols-2">
            <SettingsReadOnlyValue
              label="Region"
              labelClassName="text-foreground-primary"
              value={regionLabel(status.region) || "Not available"}
            />
            <SettingsReadOnlyValue
              label="Readings synced"
              labelClassName="text-foreground-primary"
              value={String(status.readings_synced_total ?? 0)}
            />
          </dl>
          {!isConnected && status.last_error ? (
            <FeedbackMessage
              message={status.last_error}
              title="The latest sync did not complete"
              variant="warning"
            />
          ) : null}

          {/* Honest CGM availability: pump data syncs regardless, but sensor
              glucose depends on the account streaming it to Glooko. Fetched on
              demand to avoid an automatic live login on every page visit. */}
          <div className="space-y-2">
            <Button
              type="button"
              onClick={checkAvailability}
              disabled={isOffline || isCheckingAvailability}
              className="rounded-panel border border-border-default px-3 py-1.5 font_metric_label text-foreground-secondary hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCheckingAvailability ? "Checking…" : "Check CGM availability"}
            </Button>
            {availability && (
              <div className="rounded-panel border border-border-default bg-surface-secondary p-3 font_body_3 text-foreground-primary">
                {availability.cgm_available ? (
                  <p>
                    Sensor glucose is available
                    {availability.earliest && availability.latest
                      ? ` (${new Date(
                          availability.earliest,
                        ).toLocaleDateString()} – ${new Date(
                          availability.latest,
                        ).toLocaleDateString()})`
                      : ""}
                    . Pump data (basal, bolus, pod changes) syncs as well.
                  </p>
                ) : (
                  <p>
                    Pump data (basal, bolus, pod changes) is connected. No
                    sensor glucose was found in your Glooko account yet — CGM
                    data appears here only if your Omnipod streams integrated
                    CGM to Glooko.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <Switch
              checked={enabled}
              disabled={isOffline || isSavingSettings}
              label="Automatic sync enabled"
              onCheckedChange={setEnabled}
            />
            <div title="Turn off to keep insulin doses but skip Glooko's CGM trace -- use when a direct CGM (e.g. Dexcom) already provides your glucose.">
              <Switch
                checked={cgmSyncEnabled}
                disabled={isOffline || isSavingSettings}
                label="Sync CGM from Glooko"
                onCheckedChange={setCgmSyncEnabled}
              />
            </div>
            <TextInput
              containerClassName="w-40"
              disabled={isOffline || isSavingSettings}
              id="glooko-interval"
              label="Sync every (minutes)"
              max={MAX_INTERVAL}
              min={MIN_INTERVAL}
              errorMessages={intervalErrors}
              onChange={(event) =>
                setIntervalMinutes(Number(event.target.value))
              }
              step={1}
              type="number"
              value={interval}
            />
            <Button
              type="button"
              onClick={saveSettings}
              disabled={isOffline || isSavingSettings || !intervalValid}
              className={btnClass}
            >
              {isSavingSettings ? "Saving…" : "Save"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={syncNow}
              disabled={isOffline || isSyncing || isImporting}
              className={btnClass}
            >
              {isSyncing ? "Syncing…" : "Sync now"}
            </Button>
            <Button
              type="button"
              onClick={importHistory}
              disabled={isOffline || isImporting || isSyncing}
              className="rounded-panel border border-border-default px-4 py-2 font_ui_label text-foreground-secondary hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImporting ? "Importing…" : "Import history (one-time)"}
            </Button>
            <Button
              type="button"
              onClick={disconnect}
              disabled={isOffline || isDisconnecting}
              className="rounded-panel border border-signal-error-text px-4 py-2 font_ui_label text-signal-error-text hover:bg-signal-error-fill/10 disabled:opacity-50"
            >
              {isDisconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
          <p className="font_body_3 text-foreground-secondary">
            One-time import backfills history from before you connected; it can
            take a minute and is safe to run again (duplicates are skipped).
          </p>
        </div>
      )}

      {syncResult && (
        <FeedbackMessage
          message={`Synced ${syncResult.glucose_stored} new glucose readings and ${syncResult.events_stored} pump events.`}
          variant="success"
        />
      )}
      {error && <FeedbackMessage message={error} variant="error" />}
    </div>
  );
}
