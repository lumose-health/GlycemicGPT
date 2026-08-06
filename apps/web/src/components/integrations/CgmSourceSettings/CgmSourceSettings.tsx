"use client";

/**
 * CgmSourceSettings (Story 43.10)
 *
 * Dropdown for choosing which CGM source drives the dashboard charts
 * and stats when a user has more than one CGM-providing integration
 * (e.g. Dexcom Share AND a Loop-via-Nightscout connection that reposts
 * the same sensor). Backed by `GET /api/integrations/cgm` for the
 * current state + `PUT /api/integrations/cgm/source` for the write.
 *
 * UI rules:
 * - Auto-hide when the user has zero or one CGM source
 *   (`multiple_sources === false`). A single source is always primary
 *   and there is nothing to dedupe, so the picker would only clutter.
 * - Selecting a source promotes it to primary and demotes the rest to
 *   secondary; the read endpoints then count only the primary by default.
 */

import { useCgmSources } from "@/hooks/use-cgm";
import { useDashboardInvalidation } from "@/hooks/dashboard-query";
import { updatePrimaryCgmSource } from "@/lib/api";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import { LumoseLoadingLogo } from "@/components/LumoseLoadingLogo";
import { SelectField } from "@/components/SelectField";
import { useCallback, useId, useState } from "react";
import type { CgmSourceSettingsProps } from "./CgmSourceSettings.types";

const HELP_TEXT =
  "You have more than one CGM source connected. This determines which one " +
  "drives your charts and stats. Keep both connected for redundancy; only " +
  "the primary displays at a time so your AGP and Time-in-Range aren't doubled.";

export function CgmSourceSettings(_props: CgmSourceSettingsProps = {}) {
  const { cgm, isLoading, error, refresh } = useCgmSources();
  const { invalidateResources } = useDashboardInvalidation();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const selectId = useId();

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value;
      setIsSaving(true);
      setSaveError(null);
      try {
        await updatePrimaryCgmSource(next);
        await invalidateResources([
          "cgm-sources",
          "glucose-history",
          "glucose-stats",
          "time-in-range",
          "bolus-review",
          "pump-events",
          "insulin-summary",
        ]);
        // Re-read so every source's role reflects the new pick (the PUT
        // only echoes the chosen primary). Keep isSaving through the
        // refresh so a rapid double-change can't PUT a stale value.
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
  if (isLoading && cgm === null) {
    return (
      <div
        className="flex min-h-24 items-center justify-center rounded-panel border border-border-default bg-surface-elevated p-4"
        aria-busy="true"
      >
        <LumoseLoadingLogo className="h-8 w-8" label="Loading CGM settings" />
      </div>
    );
  }

  // Quiet error on initial load -- avoid guessing at sources we couldn't fetch.
  if (error !== null && cgm === null) {
    return (
      <FeedbackMessage
        message="Could not load CGM settings. Try refreshing the page."
        variant="error"
      />
    );
  }

  if (cgm === null) {
    return null;
  }

  // Hide entirely unless the user has more than one CGM source.
  if (!cgm.multiple_sources) {
    return null;
  }

  return (
    <div
      className="rounded-panel border border-border-default bg-surface-elevated p-4"
      data-testid="cgm-source-picker"
    >
      <SelectField
        containerClassName="max-w-xl"
        errorMessage={saveError}
        helperText={HELP_TEXT}
        id={selectId}
        label="Primary CGM source"
        options={[
          ...(cgm.primary_source === null
            ? [
                {
                  disabled: true,
                  label: "Select a primary source",
                  value: "",
                },
              ]
            : []),
          ...cgm.sources.map((source) => ({
            label: source.label,
            value: source.source,
          })),
        ]}
        value={cgm.primary_source ?? ""}
        onChange={handleChange}
        disabled={isSaving}
      />
    </div>
  );
}
