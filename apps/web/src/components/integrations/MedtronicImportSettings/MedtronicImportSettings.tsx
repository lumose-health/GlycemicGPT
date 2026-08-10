"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/base";
import {
  getMedtronicAvailability,
  importMedtronicRange,
  type MedtronicAvailabilityResponse,
  type MedtronicImportResponse,
} from "@/lib/api";
import { twMerge } from "@/lib/ui/twMerge";
import { SelectField } from "@/components/SelectField";
import { TextInput } from "@/components/TextInput";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import {
  createMedtronicImportRangeSchema,
  getMedtronicRangeErrors,
  medtronicTokenSchema,
} from "./medtronicImportSettings.schema";
import type { MedtronicImportSettingsProps } from "./MedtronicImportSettings.types";

/**
 * Medtronic CareLink manual historical import.
 *
 * CareLink has no API and no durable server-side session, so we can't pull
 * autonomously like Tandem. Instead: the user logs into CareLink in a popup
 * (solving the captcha) and clicks a one-time GlycemicGPT bookmarklet that
 * reads the short-lived auth_tmp_token and hands it back via postMessage (or
 * clipboard fallback). We then validate it, show the available range, and let
 * the user import a chosen window. The token is used for the import only and
 * is never stored.
 */

const MAX_IMPORT_DAYS = 31;

const REGIONS = [
  {
    code: "US",
    label: "United States",
    loginUrl: "https://carelink.minimed.com/",
    origin: "https://carelink.minimed.com",
  },
  {
    code: "EU",
    label: "Europe / International",
    loginUrl: "https://carelink.minimed.eu/",
    origin: "https://carelink.minimed.eu",
  },
] as const;
const REGION_OPTIONS = REGIONS.map((region) => ({
  label: region.label,
  value: region.code,
}));

const MESSAGE_SOURCE = "glycemicgpt-carelink";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function MedtronicImportSettings({
  isOffline,
}: MedtronicImportSettingsProps) {
  const [regionCode, setRegionCode] = useState<"US" | "EU">("US");
  const [token, setToken] = useState<string>("");
  const [pasteValue, setPasteValue] = useState<string>("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);
  const [availability, setAvailability] =
    useState<MedtronicAvailabilityResponse | null>(null);
  const [importStart, setImportStart] = useState<string>("");
  const [importEnd, setImportEnd] = useState<string>("");
  const [isFetchingAvail, setIsFetchingAvail] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MedtronicImportResponse | null>(null);

  const region = useMemo(
    () => REGIONS.find((r) => r.code === regionCode) ?? REGIONS[0],
    [regionCode],
  );
  const browserTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  const bookmarklet = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    // Reads the non-httpOnly auth_tmp_token, posts it to the opener (this app),
    // and falls back to copying it to the clipboard if the opener is gone.
    return `javascript:(function(){try{var m=document.cookie.match(/(?:^|;\\s*)auth_tmp_token=([^;]+)/);if(!m){alert('GlycemicGPT: no CareLink token found - are you signed in?');return;}var t=decodeURIComponent(m[1]);if(window.opener&&!window.opener.closed){window.opener.postMessage({source:'${MESSAGE_SOURCE}',token:t},'${origin}');alert('GlycemicGPT: token sent. You can close this tab.');}else if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){alert('GlycemicGPT: token copied. Paste it into GlycemicGPT.');},function(){prompt('GlycemicGPT: copy this token:',t);});}else{prompt('GlycemicGPT: copy this token:',t);}}catch(e){alert('GlycemicGPT capture error: '+e);}})();`;
  }, []);

  const popupRef = useRef<Window | null>(null);
  const bookmarkletRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    // Set the javascript: href via the DOM so React doesn't strip it; the user
    // drags this to their bookmarks bar (clicking it here is a no-op).
    if (bookmarkletRef.current) {
      bookmarkletRef.current.setAttribute("href", bookmarklet);
    }
  }, [bookmarklet]);

  const copyBookmarklet = useCallback(() => {
    // Guard the whole call: `navigator.clipboard?.writeText(...).then()` would
    // throw if clipboard is undefined (the optional chain returns undefined and
    // .then is then called on it).
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(bookmarklet).then(
      () => {
        setBookmarkletCopied(true);
        setTimeout(() => setBookmarkletCopied(false), 2000);
      },
      () => {},
    );
  }, [bookmarklet]);

  const fetchAvailability = useCallback(
    async (tok: string) => {
      setError(null);
      setResult(null);
      setIsFetchingAvail(true);
      try {
        const avail = await getMedtronicAvailability(region.code, tok);
        setAvailability(avail);
        // Clear any prior window so a new account with no data doesn't show a
        // stale range from the previous one.
        setImportStart("");
        setImportEnd("");
        // Default the picker to the most recent ~14 days of available data.
        if (avail.end) {
          const end = avail.end.slice(0, 10);
          const earliest = avail.start ? avail.start.slice(0, 10) : end;
          const proposedStart = isoDate(
            new Date(new Date(end).getTime() - 14 * 86_400_000),
          );
          setImportEnd(end);
          setImportStart(proposedStart < earliest ? earliest : proposedStart);
        }
      } catch (e) {
        setAvailability(null);
        setError(
          e instanceof Error ? e.message : "Failed to read availability",
        );
      } finally {
        setIsFetchingAvail(false);
      }
    },
    [region.code],
  );

  // Listen for the bookmarklet's postMessage from the CareLink popup.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== region.origin) return;
      // Only accept the token from the CareLink popup we opened (defense against
      // any other window posting a look-alike message).
      if (popupRef.current && event.source !== popupRef.current) return;
      const data = event.data;
      if (
        data &&
        data.source === MESSAGE_SOURCE &&
        typeof data.token === "string" &&
        data.token.length > 0
      ) {
        setToken(data.token);
        setPasteValue("");
        void fetchAvailability(data.token);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [region.origin, fetchAvailability]);

  const openCareLink = useCallback(() => {
    setError(null);
    popupRef.current = window.open(
      region.loginUrl,
      "carelink_login",
      "width=1100,height=860",
    );
  }, [region.loginUrl]);

  const usePastedToken = useCallback(() => {
    const validation = medtronicTokenSchema.safeParse(pasteValue);
    if (!validation.success) {
      setPasteError(
        validation.error.issues[0]?.message ?? "Enter a valid code.",
      );
      return;
    }
    setPasteError(null);
    setToken(validation.data);
    setPasteValue("");
    void fetchAvailability(validation.data);
  }, [pasteValue, fetchAvailability]);

  const rangeOptions = useMemo(
    () => ({
      earliest: availability?.start?.slice(0, 10),
      latest: availability?.end?.slice(0, 10),
      maxDays: MAX_IMPORT_DAYS,
    }),
    [availability?.end, availability?.start],
  );
  const rangeValidation = createMedtronicImportRangeSchema(
    rangeOptions,
  ).safeParse({
    end: importEnd,
    start: importStart,
  });
  const rangeErrors = getMedtronicRangeErrors(
    { end: importEnd, start: importStart },
    rangeOptions,
  );
  const rangeValid = rangeValidation.success;

  const runImport = useCallback(async () => {
    const validation = createMedtronicImportRangeSchema(rangeOptions).safeParse(
      {
        end: importEnd,
        start: importStart,
      },
    );
    if (!token || !validation.success) return;
    setError(null);
    setResult(null);
    setIsImporting(true);
    try {
      const res = await importMedtronicRange(
        region.code,
        token,
        validation.data.start,
        validation.data.end,
        browserTz,
      );
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  }, [token, rangeOptions, region.code, importStart, importEnd, browserTz]);

  const btnClass = twMerge(
    "rounded-panel px-4 py-2 font_ui_label transition-colors",
    "bg-accent hover:bg-accent-hover text-accent-foreground",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  );

  return (
    <div className="space-y-5">
      <div className="space-y-2 font_body_2 text-foreground-secondary">
        <p>
          Bring your Medtronic pump history into GlycemicGPT from the CareLink
          website — no pump connection or cables needed.
        </p>
        <p>
          Medtronic doesn&apos;t offer a direct app connection, so you sign in
          to CareLink yourself and send a copy of your data over. There&apos;s a
          quick one-time setup, then importing takes just a few clicks. Your
          CareLink sign-in is used only to fetch the data you ask for, and
          GlycemicGPT never sees your CareLink password or saves your sign-in.
        </p>
      </div>

      {/* Region */}
      <div className="max-w-xs">
        <SelectField
          disabled={isOffline}
          helperText="Choose the region your Medtronic CareLink account is registered in."
          id="medtronic-region"
          label="Where is your CareLink account?"
          onChange={(event) => {
            setRegionCode(event.target.value as "US" | "EU");
            setToken("");
            setAvailability(null);
          }}
          options={REGION_OPTIONS}
          value={regionCode}
        />
      </div>

      {/* Step 1: bookmarklet (one-time setup) */}
      <div className="space-y-2">
        <p className="font_ui_label text-foreground-secondary">
          Step 1 — One-time setup: save the GlycemicGPT button
        </p>
        <p className="font_body_3 text-foreground-secondary">
          Save this button to your browser once. Later, while you&apos;re signed
          in to CareLink, you&apos;ll click it to send your data to GlycemicGPT
          — like a one-click bridge between the two sites. You only do this
          once.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <a
            ref={bookmarkletRef}
            href="#"
            onClick={(e) => e.preventDefault()}
            draggable
            title="Drag me to your bookmarks bar"
            className="inline-block cursor-grab rounded-panel border border-accent bg-accent/10 px-3 py-1.5 font_ui_label text-accent"
          >
            Capture CareLink → GlycemicGPT
          </a>
          <Button
            type="button"
            onClick={copyBookmarklet}
            className="rounded-panel border border-border-default px-3 py-1.5 font_body_2 text-foreground-secondary hover:bg-surface-secondary"
          >
            {bookmarkletCopied ? "Copied!" : "Copy button instead"}
          </Button>
        </div>

        <div className="space-y-1.5 rounded-panel bg-surface-secondary p-3 font_body_3 text-foreground-primary">
          <p className="font_ui_label text-foreground-primary">
            How to save it:
          </p>
          <p>
            1. Show your browser&apos;s bookmarks bar — the row of saved links
            under the address bar at the top. Press{" "}
            <kbd className="rounded-panel bg-surface-inverse px-1">Ctrl</kbd>+
            <kbd className="rounded-panel bg-surface-inverse px-1">Shift</kbd>+
            <kbd className="rounded-panel bg-surface-inverse px-1">B</kbd> (
            <kbd className="rounded-panel bg-surface-inverse px-1">⌘</kbd>
            +Shift+B on a Mac) to show it.
          </p>
          <p>
            2. Drag the blue{" "}
            <span className="text-foreground-primary">
              Capture CareLink → GlycemicGPT
            </span>{" "}
            button up onto that bar.
          </p>
          <p>
            Rather not drag? Click{" "}
            <span className="text-foreground-primary">
              “Copy button instead”
            </span>
            , then right-click your bookmarks bar, choose{" "}
            <span className="text-foreground-primary">“Add page”</span>, type
            any name, and paste. (Pasting it into the address bar won&apos;t
            work — browsers block that.)
          </p>
        </div>
      </div>

      {/* Step 2: sign in + capture */}
      <div className="space-y-2">
        <p className="font_ui_label text-foreground-secondary">
          Step 2 — Sign in to Medtronic CareLink
        </p>
        <Button
          type="button"
          onClick={openCareLink}
          disabled={isOffline}
          className={btnClass}
        >
          Open CareLink &amp; sign in
        </Button>
        <p className="font_body_3 text-foreground-secondary">
          This opens Medtronic&apos;s CareLink website in a new window. Sign in
          with your Medtronic username and password (you may be asked to confirm
          you&apos;re not a robot). You sign in directly with Medtronic —
          GlycemicGPT never sees your password.
        </p>
        <p className="font_body_3 text-foreground-secondary">
          Once you&apos;re signed in, click the{" "}
          <span className="text-foreground-secondary">
            Capture CareLink → GlycemicGPT
          </span>{" "}
          button you saved (in your bookmarks bar). Your data connection comes
          back here automatically. If nothing appears here after a few seconds,
          the button will have copied a code instead — paste it below:
        </p>
        <div className="flex items-end gap-2">
          <TextInput
            containerClassName="flex-1"
            placeholder="Paste the copied code (only if needed)"
            disabled={isOffline}
            label="Copied CareLink code"
            errorMessage={pasteError ?? undefined}
            onChange={(event) => {
              setPasteValue(event.target.value);
              setPasteError(null);
            }}
            optionalText="Only if needed"
            type="text"
            value={pasteValue}
          />
          <Button
            type="button"
            onClick={usePastedToken}
            disabled={isOffline}
            className={twMerge(btnClass, "whitespace-nowrap")}
          >
            Use code
          </Button>
        </div>
        {token && (
          <FeedbackMessage
            message={
              isFetchingAvail
                ? "Connected to your CareLink account. Checking what data is available."
                : "Connected to your CareLink account."
            }
            variant="success"
          />
        )}
      </div>

      {/* Step 3: range + import */}
      {availability && (
        <div className="space-y-3">
          <p className="font_ui_label text-foreground-secondary">
            Step 3 — Choose dates and import
          </p>
          <p className="font_body_3 text-foreground-secondary">
            Your CareLink account has data from{" "}
            {availability.start?.slice(0, 10) ?? "?"} to{" "}
            {availability.end?.slice(0, 10) ?? "?"}. Pick the dates you&apos;d
            like to bring in (up to {MAX_IMPORT_DAYS} days at a time).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
            <TextInput
              disabled={isImporting}
              id="medtronic-start"
              label="Start"
              errorMessages={rangeErrors.start}
              min={availability.start?.slice(0, 10)}
              max={availability.end?.slice(0, 10)}
              onChange={(event) => setImportStart(event.target.value)}
              type="date"
              value={importStart}
            />
            <TextInput
              disabled={isImporting}
              id="medtronic-end"
              label="End"
              errorMessages={rangeErrors.end}
              min={availability.start?.slice(0, 10)}
              max={availability.end?.slice(0, 10)}
              onChange={(event) => setImportEnd(event.target.value)}
              type="date"
              value={importEnd}
            />
          </div>
          <Button
            type="button"
            onClick={runImport}
            disabled={isOffline || isImporting || !rangeValid}
            className={btnClass}
          >
            {isImporting ? "Importing…" : "Import these dates"}
          </Button>
        </div>
      )}

      {result && (
        <FeedbackMessage
          message={`Imported ${result.glucose_stored} glucose readings and ${result.events_stored} pump events. You can pick another date range above to bring in more.`}
          title="Import complete"
          variant="success"
        />
      )}
      {error && <FeedbackMessage message={error} variant="error" />}
    </div>
  );
}
