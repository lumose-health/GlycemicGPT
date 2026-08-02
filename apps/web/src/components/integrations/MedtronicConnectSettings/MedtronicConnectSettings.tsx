"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/base";
import {
  disconnectMedtronicConnect,
  getMedtronicConnectStatus,
  installMedtronicConnect,
  syncMedtronicConnectNow,
  updateMedtronicConnectSettings,
  type MedtronicConnectInstall,
  type MedtronicConnectStatus,
  type MedtronicConnectSyncResult,
} from "@/lib/api";
import { twMerge } from "@/lib/ui/twMerge";
import { SelectField } from "@/components/SelectField";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import { SettingsReadOnlyValue } from "@/components/settings/SettingsReadOnlyValue";
import { Switch } from "@/components/Switch";
import { TextInput } from "@/components/TextInput";
import {
  getMedtronicPairingErrors,
  medtronicIntervalSchema,
  medtronicPairingSchema,
  type MedtronicPairingErrors,
} from "./medtronicConnectSettings.schema";
import type { MedtronicConnectSettingsProps } from "./MedtronicConnectSettings.types";

/**
 * Medtronic CareLink CarePartner (Connect) -- autonomous sync.
 *
 * The one-time CarePartner login can't run in the web app: it redirects to a
 * mobile-app URL scheme (com.medtronic.carepartner:) that a browser/server
 * can't receive. So a small LOCAL desktop helper drives the login + captures
 * the auth code, authenticating to the backend with a short-lived pairing token
 * minted here. The backend exchanges the code for the refresh token and stores
 * it server-side; thereafter sync is fully automatic. The refresh token never
 * reaches the browser.
 */

const MIN_INTERVAL = 15;
const MAX_INTERVAL = 1440;
const POLL_MS = 4000;
const EMPTY_PAIRING_ERRORS: MedtronicPairingErrors = {
  apiUrl: [],
  region: [],
  username: [],
};

// "EU" is Medtronic's catch-all for non-US CarePartner countries -- UK, EU
// member states, Australia, South Africa, etc. all share a single OUS Auth0
// tenant + cloud host. Picking the right region just selects which Auth0
// tenant the helper points your sign-in at.
const REGIONS = [
  { code: "US", label: "United States" },
  { code: "EU", label: "Europe / International (UK, EU, AU, …)" },
] as const;
const REGION_OPTIONS = REGIONS.map((region) => ({
  label: region.label,
  value: region.code,
}));

type HelperOS = "linux-mac" | "windows";

function detectOS(): HelperOS {
  if (typeof navigator === "undefined") return "linux-mac";
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes("win") ? "windows" : "linux-mac";
}

/** POSIX single-quote (close, escaped quote, reopen) for safe bash embedding. */
function shSingleQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** PowerShell single-quote (double any embedded quote) for safe embedding. */
function psSingleQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Assemble the copy-paste command that downloads and runs the helper installer
 * from `url`. Exported and pure so the shell-quoting is unit-testable. Both the
 * URL and the optional --browser path are single-quoted for the target shell, so
 * a value with a space or quote can't break out. A custom browser is forwarded
 * via `bash -s --` / a PowerShell script block (a plain `| iex` can't pass
 * arguments); it stays in the pasted command and never reaches the server.
 */
export function buildHelperCommand(
  url: string,
  os: HelperOS,
  browserPath: string,
): string {
  const customBrowser = browserPath.trim();
  if (os === "windows") {
    if (customBrowser) {
      return `& ([scriptblock]::Create((iwr ${psSingleQuote(url)} -UseBasicParsing).Content)) --browser ${psSingleQuote(customBrowser)}`;
    }
    return `iwr ${psSingleQuote(url)} -UseBasicParsing | iex`;
  }
  if (customBrowser) {
    return `curl -fsSL ${shSingleQuote(url)} | bash -s -- --browser ${shSingleQuote(customBrowser)}`;
  }
  return `curl -fsSL ${shSingleQuote(url)} | bash`;
}

export function MedtronicConnectSettings({
  isOffline,
  onStatusChange,
}: MedtronicConnectSettingsProps) {
  const [status, setStatus] = useState<MedtronicConnectStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Pairing flow state.
  const [regionCode, setRegionCode] = useState<"US" | "EU">("US");
  const [username, setUsername] = useState<string>("");
  const [pairing, setPairing] = useState<MedtronicConnectInstall | null>(null);
  const [isPairing, setIsPairing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pairingErrors, setPairingErrors] =
    useState<MedtronicPairingErrors>(EMPTY_PAIRING_ERRORS);

  // Settings + actions state.
  const [interval, setIntervalMinutes] = useState<number>(30);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] =
    useState<MedtronicConnectSyncResult | null>(null);

  const applyStatus = useCallback(
    (s: MedtronicConnectStatus) => {
      setStatus(s);
      setEnabled(s.enabled);
      if (s.sync_interval_minutes) setIntervalMinutes(s.sync_interval_minutes);
      onStatusChange?.(s, false);
    },
    [onStatusChange],
  );

  const connected = !!status?.connected;

  // The URL the user typed to reach the dashboard -- the only URL we can be
  // sure is reachable from whatever machine they'll run the helper on (because
  // they just reached it that way). Editable for the rare split-origin
  // deployment where the API is at a different URL than the web app.
  const [instanceUrl, setInstanceUrl] = useState<string>(() =>
    typeof window !== "undefined" ? window.location.origin : "",
  );
  const [selectedOS, setSelectedOS] = useState<HelperOS>(() => detectOS());

  // Optional explicit browser path for the helper's --browser flag, for users
  // whose Chrome/Edge/Brave/Chromium is installed somewhere auto-detection
  // can't find. Stays in the copy-paste command; never sent to the server.
  const [browserPath, setBrowserPath] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    getMedtronicConnectStatus()
      .then((s) => {
        if (!cancelled) applyStatus(s);
      })
      .catch(() => {
        /* not configured / unauth -- treated as not connected */
        if (!cancelled) onStatusChange?.(null, true);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [applyStatus, onStatusChange]);

  // While a pairing is pending, poll for the CLI to complete the connection.
  // Stop once the pairing token has expired (the token is useless after that),
  // so an abandoned pairing doesn't poll forever.
  useEffect(() => {
    if (!pairing || connected) return;
    const expiresAtMs = Date.parse(pairing.expires_at);
    const id = setInterval(async () => {
      if (Number.isFinite(expiresAtMs) && Date.now() > expiresAtMs) {
        setPairing(null);
        setError("Pairing token expired before connecting. Get a new one.");
        return;
      }
      try {
        const s = await getMedtronicConnectStatus();
        if (s.connected) {
          applyStatus(s);
          setPairing(null);
        }
      } catch {
        /* keep polling */
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [pairing, connected, applyStatus]);

  const startPairing = useCallback(async () => {
    setError(null);
    setSyncResult(null);
    const validation = medtronicPairingSchema.safeParse({
      apiUrl: instanceUrl,
      region: regionCode,
      username,
    });
    if (!validation.success) {
      setPairingErrors(
        getMedtronicPairingErrors({
          apiUrl: instanceUrl,
          region: regionCode,
          username,
        }),
      );
      return;
    }
    setPairingErrors(EMPTY_PAIRING_ERRORS);
    setIsPairing(true);
    try {
      setPairing(
        await installMedtronicConnect({
          apiUrl: validation.data.apiUrl,
          username: validation.data.username,
          region: validation.data.region,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start pairing");
    } finally {
      setIsPairing(false);
    }
  }, [username, instanceUrl, regionCode]);

  // The primary command: a one-liner that downloads our native Go helper from
  // THIS instance and runs it. Uses the short-handle install endpoint, so the
  // copy-paste line is ~80 chars instead of the ~540 char form that inlined
  // the full Fernet pair token. The handle indexes a server-side bundle that
  // holds the same {pair, api, username, region}, with the same single-use
  // gate as the long URL form.
  const nativeCommand = useMemo(() => {
    const base = instanceUrl.trim();
    if (!pairing || !base) return "";
    const ext = selectedOS === "windows" ? "ps1" : "sh";
    let url: string;
    try {
      // Runs during render -- a malformed/whitespace-padded instance URL would
      // otherwise throw here and take down the whole settings page.
      url = new URL(
        `/api/integrations/medtronic/connect/install/${pairing.handle}.${ext}`,
        base,
      ).toString();
    } catch {
      return "";
    }
    return buildHelperCommand(url, selectedOS, browserPath);
  }, [pairing, instanceUrl, selectedOS, browserPath]);

  // Advanced fallback for users who'd rather run the in-tree Python CLI than
  // download a binary -- same backend endpoints, same flow, just heavier deps.
  const pythonCommand = useMemo(() => {
    if (!pairing) return "";
    const api = shSingleQuote(
      instanceUrl || "https://your-glycemicgpt-instance",
    );
    const user = shSingleQuote(username.trim());
    const pair = shSingleQuote(pairing.pairing_token);
    const region = shSingleQuote(regionCode);
    return [
      "uv run tools/medtronic-connect-login/medtronic_connect_login.py \\",
      `  --api ${api} \\`,
      `  --pair ${pair} \\`,
      `  --username ${user} \\`,
      `  --region ${region}`,
    ].join("\n");
  }, [pairing, instanceUrl, username, regionCode]);

  const copyCommand = useCallback(() => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(nativeCommand).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  }, [nativeCommand]);

  const saveSettings = useCallback(async () => {
    setError(null);
    const validation = medtronicIntervalSchema.safeParse(interval);
    if (!validation.success) return;
    setIsSavingSettings(true);
    try {
      applyStatus(
        await updateMedtronicConnectSettings(enabled, validation.data),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  }, [enabled, interval, applyStatus]);

  const syncNow = useCallback(async () => {
    setError(null);
    setSyncResult(null);
    setIsSyncing(true);
    try {
      setSyncResult(await syncMedtronicConnectNow());
      applyStatus(await getMedtronicConnectStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }, [applyStatus]);

  const disconnect = useCallback(async () => {
    setError(null);
    setIsDisconnecting(true);
    try {
      await disconnectMedtronicConnect();
      setStatus(null);
      onStatusChange?.(null, false);
      setPairing(null);
      setSyncResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setIsDisconnecting(false);
    }
  }, [onStatusChange]);

  const intervalValidation = medtronicIntervalSchema.safeParse(interval);
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
          Automatic sync (CareLink CarePartner)
        </p>
      </div>
      <div className="space-y-2 font_body_2 text-foreground-secondary">
        <p>
          Keep GlycemicGPT updated automatically from Medtronic&apos;s CareLink
          CarePartner service — no cables, and no need to import by hand.
          CarePartner reports recent data (about the last 24 hours); GlycemicGPT
          keeps a rolling history as it syncs.
        </p>
      </div>

      {/* ---- Not connected: pair with the local desktop helper ---- */}
      {loaded && !connected && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-md">
            <SelectField
              disabled={isOffline || !!pairing}
              id="connect-region"
              label="Region"
              errorMessage={pairingErrors.region[0]}
              onChange={(event) => {
                setRegionCode(event.target.value as "US" | "EU");
                setPairingErrors((current) => ({ ...current, region: [] }));
              }}
              options={REGION_OPTIONS}
              value={regionCode}
            />
            <TextInput
              autoComplete="username"
              // Frozen once a pairing token is minted: the bundle was created
              // with this username, so editing it now would desync the
              // displayed setup command from the server-side bundle.
              disabled={isOffline || !!pairing}
              id="connect-username"
              label="CareLink username"
              errorMessages={pairingErrors.username}
              onChange={(event) => {
                setUsername(event.target.value);
                setPairingErrors((current) => ({ ...current, username: [] }));
              }}
              placeholder="your CareLink username"
              type="text"
              value={username}
            />
          </div>
          <p className="font_body_3 text-foreground-secondary">
            UK and other non-US accounts: pick &quot;Europe /
            International.&quot; One Medtronic OUS account covers the whole
            region.
          </p>

          {!pairing ? (
            <div className="space-y-2">
              <Button
                type="button"
                onClick={startPairing}
                disabled={isOffline || isPairing}
                className={btnClass}
              >
                {isPairing ? "Preparing…" : "Connect with CareLink"}
              </Button>
              <p className="font_body_3 text-foreground-secondary">
                Medtronic&apos;s sign-in only works in a browser on your
                computer, so connecting uses a one-time setup command you run on
                your own machine. GlycemicGPT never sees your CareLink or
                GlycemicGPT password.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font_ui_label text-foreground-secondary">
                Run the setup command
              </p>

              {/* Editable instance URL (default: window.location.origin). */}
              <div className="max-w-md">
                <TextInput
                  errorMessages={pairingErrors.apiUrl}
                  id="connect-instance-url"
                  label="Your GlycemicGPT URL"
                  onChange={(event) => {
                    setInstanceUrl(event.target.value);
                    setPairingErrors((current) => ({ ...current, apiUrl: [] }));
                  }}
                  spellCheck={false}
                  type="text"
                  value={instanceUrl}
                />
                <p className="mt-1 font_body_3 text-foreground-secondary">
                  Auto-detected from your address bar. Only edit this if your
                  API is at a different URL than this dashboard.
                </p>
              </div>

              {/* OS picker. */}
              <div className="inline-flex rounded-panel border border-border-default overflow-hidden">
                {(
                  [
                    { v: "linux-mac" as const, label: "macOS / Linux" },
                    { v: "windows" as const, label: "Windows" },
                  ] as const
                ).map((o) => (
                  <Button
                    key={o.v}
                    type="button"
                    onClick={() => setSelectedOS(o.v)}
                    className={twMerge(
                      "px-3 py-1.5 font_body_2",
                      selectedOS === o.v
                        ? "bg-accent text-accent-foreground"
                        : "bg-surface-primary text-foreground-secondary hover:bg-surface-secondary",
                    )}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>

              {/* Optional --browser path for installs auto-detect can't find. */}
              <div className="max-w-md">
                <TextInput
                  id="connect-browser-path"
                  label="Browser path"
                  onChange={(event) => setBrowserPath(event.target.value)}
                  optionalText="Optional"
                  placeholder={
                    selectedOS === "windows"
                      ? "e.g. C:\\Program Files\\BraveSoftware\\...\\brave.exe"
                      : "e.g. /Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
                  }
                  spellCheck={false}
                  type="text"
                  value={browserPath}
                />
                <p className="mt-1 font_body_3 text-foreground-secondary">
                  Only if the helper can&apos;t find your browser on its own —
                  point it at a Chrome, Edge, Brave, or Chromium executable.
                </p>
              </div>

              <p className="font_body_3 text-foreground-secondary">
                Paste this one line into a terminal on your computer. It runs a
                small one-time connector from your own GlycemicGPT, opens your
                browser to CareLink, and connects automatically. No installs;
                requires Chrome, Edge, Brave, or Chromium (auto-detected, or set
                a path above for a custom install). No Chromium-family browser
                at all? The Advanced → Python CLI below works on its own — it
                uses a bundled browser engine.
              </p>

              <pre className="overflow-x-auto rounded-panel border border-border-default bg-surface-inverse p-3 font_body_3 text-foreground-inverse">
                {nativeCommand}
              </pre>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={copyCommand}
                  className="rounded-panel border border-border-default px-3 py-1.5 font_body_2 text-foreground-secondary hover:bg-surface-secondary"
                >
                  {copied ? "Copied!" : "Copy command"}
                </Button>
                <Button
                  type="button"
                  onClick={startPairing}
                  disabled={isPairing}
                  className="rounded-panel border border-border-default px-3 py-1.5 font_body_2 text-foreground-secondary hover:bg-surface-secondary"
                >
                  New token
                </Button>
                <span className="inline-flex items-center gap-2 font_body_3 text-foreground-secondary">
                  <span className="h-2 w-2 animate-pulse rounded-pill bg-accent" />
                  Waiting for the helper to finish…
                </span>
              </div>

              <details className="font_body_3 text-foreground-secondary">
                <summary className="cursor-pointer hover:text-foreground-primary">
                  Advanced — Python CLI (requires uv + Playwright on your
                  machine)
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-panel border border-border-default bg-surface-inverse p-3 text-foreground-inverse">
                  {pythonCommand}
                </pre>
                <p className="mt-1">
                  Equivalent flow using the in-tree Python helper. It runs the
                  login through a bundled browser engine, so it works even with
                  no Chromium-family browser installed (handy for Firefox/Safari
                  users and devs); otherwise prefer the one-liner above.
                </p>
              </details>

              <p className="font_body_3 text-foreground-secondary">
                The pairing token is short-lived (~15 min). A browser opens —
                sign in to CareLink and solve the captcha. This page updates
                automatically when it connects. If the token expires, click
                &quot;New token&quot;.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---- Connected: status + controls ---- */}
      {loaded && connected && status && (
        <div className="space-y-4">
          <dl className="grid gap-4 rounded-panel bg-surface-secondary p-4 sm:grid-cols-2">
            <SettingsReadOnlyValue
              label="Region"
              labelClassName="text-foreground-primary"
              value={status.region ?? "Not available"}
            />
            <SettingsReadOnlyValue
              label="Readings synced"
              labelClassName="text-foreground-primary"
              value={String(status.readings_synced_total ?? 0)}
            />
          </dl>

          <div className="flex flex-wrap items-end gap-4">
            <Switch
              checked={enabled}
              disabled={isOffline || isSavingSettings}
              label="Automatic sync enabled"
              onCheckedChange={setEnabled}
            />
            <TextInput
              containerClassName="w-40"
              disabled={isOffline || isSavingSettings}
              id="connect-interval"
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
              disabled={isOffline || isSyncing}
              className={btnClass}
            >
              {isSyncing ? "Syncing…" : "Sync now"}
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

          {status.last_error && (
            <FeedbackMessage
              message={status.last_error}
              title="Last sync issue"
              variant="warning"
            />
          )}
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
