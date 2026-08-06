"use client";

/**
 * ForecastSourceSettings (Story 43.12 PR 4)
 *
 * Dropdown for choosing which closed-loop's BG forecast to draw on
 * the dashboard chart. Backed by `GET /api/integrations/forecast` for
 * the current state + `available_sources`, and `PUT
 * /api/integrations/forecast/source` for the write.
 *
 * UI rules (per design doc Section 3):
 * - Auto-hide when the user has no forecast-publishing integration
 *   (`available_sources` is empty). The picker is meaningless then
 *   and surfacing it confuses users.
 * - "Auto" is the default: picks the only available source; renders
 *   nothing when multiple are available (the user must pick).
 * - "None" opts out. Used by users who don't want any forecast line.
 * - Each engine in `available_sources` is listed by friendly name
 *   via `prettySourceName` (shared with PR 6's hero card badge).
 *
 * Hover help text is copied from the design doc so the wording is
 * traceable to a single source of truth.
 */

import { prettySourceName } from "@/lib/pump/closed-loop-status";
import { useForecast } from "@/hooks/use-forecast";
import { useDashboardInvalidation } from "@/hooks/dashboard-query";
import { type ForecastSourcePreference, updateForecastSource } from "@/lib/api";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import { LumoseLoadingLogo } from "@/components/LumoseLoadingLogo";
import { SelectField } from "@/components/SelectField";
import { useCallback, useId, useState } from "react";
import type { ForecastSourceSettingsProps } from "./ForecastSourceSettings.types";

const HELP_TEXT =
  "Some integrations (Loop, AAPS, Trio, OpenAPS) publish their algorithm's BG forecasts. " +
  "This setting picks which forecast to draw on your glucose chart. " +
  "GlycemicGPT does not generate predictions itself yet.";

export function ForecastSourceSettings(
  _props: ForecastSourceSettingsProps = {},
) {
  const { forecast, isLoading, error, refresh } = useForecast();
  const { invalidateResources } = useDashboardInvalidation();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const selectId = useId();

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value as ForecastSourcePreference;
      setIsSaving(true);
      setSaveError(null);
      try {
        await updateForecastSource(next);
        await invalidateResources(["forecast"]);
        // Re-read the full state so `effective_source` /
        // `forecast_unavailable_reason` reflect the new pick
        // (the PUT response only returns `source_preference`).
        // Keep `isSaving` true through the refresh -- otherwise a
        // rapid double-change can PUT a stale preference between the
        // first PUT and the first refresh response.
        await refresh();
      } catch (err) {
        setSaveError(
          err instanceof Error ? err.message : "Failed to save preference",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [invalidateResources, refresh],
  );

  // Loading state -- preserve layout space so the section doesn't pop in.
  if (isLoading && forecast === null) {
    return (
      <div
        className="flex min-h-24 items-center justify-center rounded-panel border border-border-default bg-surface-elevated p-4"
        aria-busy="true"
      >
        <LumoseLoadingLogo
          className="h-8 w-8"
          label="Loading forecast settings"
        />
      </div>
    );
  }

  // Network error on initial load -- show a quiet error, no picker.
  // Avoids guessing at what to render when we don't know what sources
  // are available.
  if (error !== null && forecast === null) {
    return (
      <FeedbackMessage
        message="Could not load forecast settings. Try refreshing the page."
        variant="error"
      />
    );
  }

  if (forecast === null) {
    return null;
  }

  // Hide entirely when no source has published a forecast in the
  // last 24h. The picker is meaningless in this state and adding a
  // disabled-dropdown UI just clutters the page.
  if (forecast.available_sources.length === 0) {
    return null;
  }

  return (
    <div
      className="rounded-panel border border-border-default bg-surface-elevated p-4"
      data-testid="forecast-source-picker"
    >
      <SelectField
        containerClassName="max-w-xl"
        errorMessage={saveError}
        helperText={HELP_TEXT}
        id={selectId}
        label="Forecast source"
        options={[
          { label: "Auto (default)", value: "auto" },
          { label: "None (don't show)", value: "none" },
          ...(forecast.source_preference !== "auto" &&
          forecast.source_preference !== "none" &&
          !forecast.available_sources.includes(forecast.source_preference)
            ? [
                {
                  label: `${prettySourceName(forecast.source_preference)} (no recent forecast)`,
                  value: forecast.source_preference,
                },
              ]
            : []),
          ...forecast.available_sources.map((engine) => ({
            label: prettySourceName(engine),
            value: engine,
          })),
        ]}
        value={forecast.source_preference}
        onChange={handleChange}
        disabled={isSaving}
      />
      {/* Status hint when the chosen state would render nothing on the
          chart -- mirrors the same dispatch the chart legend uses so
          the user gets the explanation in both places. */}
      {forecast.forecast_unavailable_reason !== null && (
        <PickerStatusHint
          reason={forecast.forecast_unavailable_reason}
          preference={forecast.source_preference}
        />
      )}
    </div>
  );
}

interface PickerStatusHintProps {
  reason: NonNullable<
    import("@/lib/api").ForecastReadResponse["forecast_unavailable_reason"]
  >;
  preference: ForecastSourcePreference;
}

/**
 * One-liner showing why no chart line is drawing right now. The chart
 * legend has its own version of this message; the picker version is
 * scoped to "explain what your current pick means in plain words."
 */
function PickerStatusHint({ reason, preference }: PickerStatusHintProps) {
  const message = (() => {
    switch (reason) {
      case "opted_out":
        return "Forecast overlay is off.";
      case "needs_pick":
        return "Multiple sources available: pick one to see its forecast.";
      case "no_sources":
        // Shouldn't reach this branch because the picker is hidden
        // when available_sources is empty, but kept for completeness.
        return null;
      case "source_silent":
        return `Your ${
          preference === "auto" || preference === "none"
            ? "source"
            : prettySourceName(preference)
        } hasn't published a forecast recently.`;
      case "stale":
        return "Your forecast data is older than 30 minutes: no overlay until fresher data arrives.";
      default:
        // Fail closed if the backend adds a new reason -- better to show
        // nothing than render an empty <p>.
        return null;
    }
  })();
  if (message === null) return null;
  return (
    <p
      className="font_body_4 mt-2 text-foreground-secondary"
      data-testid="forecast-picker-hint"
    >
      {message}
    </p>
  );
}
