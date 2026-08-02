"use client";

/**
 * Save-as / link-to common-food actions for the meal detail view, bringing the
 * web app to mobile parity with the personalization loop:
 *
 *  - "Save as common food" promotes this record to a named baseline (the server
 *    uses the record's corrected values when present, else the AI estimate, and
 *    dedupes by name) and links the record to it.
 *  - "Link to common food" attaches this record to one of the user's existing
 *    baselines.
 *
 * A common food is the user's curated truth for a food they eat often, but it is
 * still a *description* of the food, never a dose: nothing here is fed to IoB /
 * treatment_safety / carb-ratio math, and the never-dose framing stays attached.
 */

import { useCallback, useEffect, useId, useState } from "react";
import { Icon } from "@/base";
import { HighlightButton } from "@/components/HighlightButton";
import { LoadingState } from "@/components/LoadingState";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SelectField } from "@/components/SelectField";
import { TextInput } from "@/components/TextInput";
import {
  type CommonFood,
  getFoodRecord,
  linkRecordToCommonFood,
  listCommonFoods,
  saveRecordAsCommonFood,
} from "@/lib/api";
import { describeCommonFoodError, NEVER_DOSE_BASELINE_NOTE } from "@/lib/common-food-format";
import { mealTitle } from "@/lib/meal-display";
import type { MealCommonFoodSectionProps } from "./MealCommonFoodSection.types";

type Mode = "idle" | "save" | "link";

/**
 * Promote/link a record to a common-food baseline. Two distinct actions behind
 * one card; both leave the carb estimate untouched and never imply a dose.
 */
export function MealCommonFoodSection({
  record,
  onUpdated,
}: MealCommonFoodSectionProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const errorId = useId();

  // Save-as state.
  const [name, setName] = useState("");

  // Link state: the user's existing baselines, loaded lazily when the picker opens.
  const [baselines, setBaselines] = useState<CommonFood[] | null>(null);
  const [loadingBaselines, setLoadingBaselines] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  const reset = useCallback(() => {
    setMode("idle");
    setError(null);
  }, []);

  const openSave = useCallback(() => {
    // The AI food_description is unbounded; clamp the prefill to the server's
    // 120-char name cap (which the input's maxLength only enforces for typing).
    setName(mealTitle(record).slice(0, 120));
    setError(null);
    setSuccess(null);
    setMode("save");
  }, [record]);

  const openLink = useCallback(() => {
    setError(null);
    setSuccess(null);
    setSelectedId("");
    setMode("link");
  }, []);

  // Reset the section's transient state when the detail view switches to a
  // different meal. This route re-runs its loader on navigation rather than
  // remounting, so a success/error/open editor from a prior meal must not linger
  // on the next one. Re-rendering with the same record (e.g. after a save) keeps
  // record.id stable, so the success message it just set survives.
  useEffect(() => {
    setMode("idle");
    setSuccess(null);
    setError(null);
  }, [record.id]);

  // Load the baselines for the link picker on demand. Re-runs if the mode toggles
  // back to "link", so a baseline saved meanwhile shows up without a full reload.
  useEffect(() => {
    if (mode !== "link") return;
    let cancelled = false;
    setLoadingBaselines(true);
    setError(null);
    listCommonFoods(200, 0)
      .then((data) => {
        if (cancelled) return;
        setBaselines(data.common_foods);
        // Default the picker to the currently-linked baseline when present.
        const current = data.common_foods.find((f) => f.id === record.common_food_id);
        setSelectedId(current?.id ?? data.common_foods[0]?.id ?? "");
      })
      .catch((err) => {
        if (cancelled) return;
        // Leave baselines null on error so the picker shows the error message,
        // not the misleading "no common foods yet" empty state.
        setError(describeCommonFoodError(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingBaselines(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, record.common_food_id]);

  const submitSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name for this common food.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveRecordAsCommonFood(record.id, trimmed);
      // The promotion links the record server-side. Re-fetch so the detail view
      // reflects the link from the source of truth — uniform with the correction
      // and identity flows, which also swap in a server-returned record (and so
      // never write a stale closure snapshot back over a concurrent edit). A
      // refresh blip is non-fatal: the save already succeeded.
      try {
        onUpdated(await getFoodRecord(record.id));
      } catch {
        /* keep the success state; the link shows on the next load */
      }
      setSuccess(`Saved “${saved.name}” to your common foods.`);
      setMode("idle");
    } catch (err) {
      setError(describeCommonFoodError(err));
    } finally {
      setSaving(false);
    }
  }, [name, record.id, onUpdated]);

  const submitLink = useCallback(async () => {
    if (!selectedId) {
      setError("Pick a common food to link to.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await linkRecordToCommonFood(record.id, selectedId);
      onUpdated(updated);
      const linked = baselines?.find((f) => f.id === selectedId);
      setSuccess(`Linked to “${linked?.name ?? "your common food"}”.`);
      setMode("idle");
    } catch (err) {
      setError(describeCommonFoodError(err));
    } finally {
      setSaving(false);
    }
  }, [selectedId, record.id, onUpdated, baselines]);

  return (
    <div data-testid="meal-common-food-section" className="space-y-3">
      {record.common_food_id && (
        <p
          data-testid="meal-common-food-linked"
          className="font_poppins font_body_2 flex items-center gap-1.5 text-foreground-primary"
        >
          <Icon
            className="h-4 w-4 text-signal-check-text"
            decorative
            icon="check"
          />
          Linked to one of your common foods.
        </p>
      )}

      {success && (
        <p
          role="status"
          data-testid="meal-common-food-success"
          className="font_poppins font_body_2 text-signal-check-text"
        >
          {success}
        </p>
      )}

      {mode === "idle" && (
        <div className="flex flex-wrap gap-3">
          <SecondaryButton
            onClick={openSave}
            data-testid="meal-save-as-common-food"
            size="sm"
          >
            <Icon className="h-4 w-4" decorative icon="bookmark" />
            Save as common food
          </SecondaryButton>
          <SecondaryButton
            onClick={openLink}
            data-testid="meal-link-common-food"
            size="sm"
          >
            <Icon className="h-4 w-4" decorative icon="link" />
            Link to common food
          </SecondaryButton>
        </div>
      )}

      {mode === "save" && (
        <div className="space-y-4 rounded-panel border border-border-default bg-surface-primary p-5">
          <TextInput
            aria-describedby={error ? errorId : undefined}
            aria-invalid={Boolean(error)}
            data-testid="meal-save-as-name"
            label="Common food name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            type="text"
            value={name}
          />
          <p className="font_poppins font_body_4 text-foreground-secondary">
            Saves this meal’s carbs as a reusable baseline. Saving under a name you
            already use updates that baseline instead of adding a duplicate.
          </p>
          {error && (
            <p
              role="alert"
              id={errorId}
              data-testid="meal-save-as-error"
              className="font_poppins font_body_4 text-signal-error-text"
            >
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <SecondaryButton
              onClick={reset}
              disabled={saving}
              data-testid="meal-save-as-cancel"
              className="flex-1"
            >
              Cancel
            </SecondaryButton>
            <HighlightButton
              onClick={submitSave}
              disabled={saving || !name.trim()}
              data-testid="meal-save-as-submit"
              className="flex-1"
            >
              {saving ? "Saving…" : "Save"}
            </HighlightButton>
          </div>
        </div>
      )}

      {mode === "link" && (
        <div className="space-y-4 rounded-panel border border-border-default bg-surface-primary p-5">
          {loadingBaselines ? (
            <LoadingState
              className="min-h-24"
              data-testid="meal-link-loading"
              label="Loading your common foods"
            />
          ) : baselines && baselines.length > 0 ? (
            <SelectField
              aria-describedby={error ? errorId : undefined}
              aria-invalid={Boolean(error)}
              data-testid="meal-link-select"
              label="Link to"
              onChange={(event) => setSelectedId(event.target.value)}
              options={baselines.map((food) => ({
                label: food.name,
                value: food.id,
              }))}
              value={selectedId}
            />
          ) : baselines && baselines.length === 0 ? (
            <p
              data-testid="meal-link-empty"
              className="font_poppins font_body_2 text-foreground-secondary"
            >
              You don’t have any common foods yet. Use “Save as common food” to
              create one.
            </p>
          ) : null}
          {error && (
            <p
              role="alert"
              id={errorId}
              data-testid="meal-link-error"
              className="font_poppins font_body_4 text-signal-error-text"
            >
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <SecondaryButton
              onClick={reset}
              disabled={saving}
              data-testid="meal-link-cancel"
              className="flex-1"
            >
              Cancel
            </SecondaryButton>
            <HighlightButton
              onClick={submitLink}
              disabled={saving || loadingBaselines || !selectedId}
              data-testid="meal-link-submit"
              className="flex-1"
            >
              {saving ? "Linking…" : "Link"}
            </HighlightButton>
          </div>
        </div>
      )}

      <p
        data-testid="meal-common-food-note"
        className="font_metric_caption text-foreground-secondary"
      >
        {NEVER_DOSE_BASELINE_NOTE}
      </p>
    </div>
  );
}
