"use client";

/**
 * Interactive meal-correction surfaces for the detail view, bringing the web app
 * to mobile parity with the two things a user does when the AI is wrong:
 *
 *  - {@link MealCorrectionSection} corrects the carb *range*.
 *  - {@link MealIdentitySection} confirms/corrects *what the food is*.
 *
 * These are deliberately TWO separate actions (the Story 50.H2 split between
 * fixing carbs and confirming identity): correcting carbs never touches identity,
 * and confirming identity is what opens external grounding. Both fix a
 * description of the food, never a dose -- the corrected values are never fed to
 * IoB / treatment_safety / carb-ratio math, and the never-dose framing is the
 * server-cleared `safety_qualifier`, rendered verbatim.
 */

import { useCallback, useId, useState } from "react";
import { Icon, Input } from "@/base";
import { HighlightButton } from "@/components/HighlightButton";
import { MealSafetyQualifier } from "@/components/MealDetails";
import { SecondaryButton } from "@/components/SecondaryButton";
import {
  confirmFoodIdentity,
  correctFoodRecord,
  MealApiError,
} from "@/lib/api";
import {
  CARB_GRAMS_MAX,
  CARB_GRAMS_MIN,
  effectiveCarbRange,
  parseCarbInputs,
  prefillIdentity,
} from "@/lib/meal-format";
import type { MealEditorProps } from "./MealEditor.types";

/**
 * The shared explainer that confirming a food's identity opens external
 * grounding. Rendered identically by the prompt and the editor, so it lives in
 * one place rather than being copy-pasted across the two branches.
 */
function IdentityGroundingExplainer() {
  return (
    <p
      data-testid="meal-identity-grounding-explainer"
      className="font_poppins font_body_4 text-foreground-secondary"
    >
      Confirming opens a lookup against authoritative nutrition data (USDA, Open
      Food Facts, or a restaurant’s published facts).
    </p>
  );
}

/** Map a correction failure to friendly copy; surfaces the server detail otherwise. */
function describeCorrectionError(err: unknown): string {
  if (err instanceof MealApiError) {
    if (err.status === 404) return "This meal no longer exists.";
    const detail = err.detail.toLowerCase();
    if (detail.includes("exceed")) {
      return "The low value must not exceed the high value.";
    }
    if (
      detail.includes("less than or equal") ||
      detail.includes("greater than or equal") ||
      detail.includes("bound above") ||
      detail.includes("bound below") ||
      detail.includes("range")
    ) {
      return "Enter carb values between 0 and 1000 grams.";
    }
    return err.detail || "Couldn't save that correction. Try again.";
  }
  return "Couldn't save that correction. Try again.";
}

/** Map an identity failure to friendly copy; surfaces the server detail otherwise. */
function describeIdentityError(err: unknown): string {
  if (err instanceof MealApiError) {
    if (err.status === 404) return "This meal no longer exists.";
    return err.detail || "Couldn't confirm that. Try again.";
  }
  return "Couldn't confirm that. Try again.";
}

/**
 * Correct the carb range. Closed, it is a single "Correct carbs" button; open,
 * it is a low/high editor seeded from the current range. States plainly that the
 * correction never feeds dosing math and carries the server never-dose qualifier.
 */
export function MealCorrectionSection({
  record,
  onUpdated,
}: MealEditorProps) {
  const range = effectiveCarbRange(record);
  const [editing, setEditing] = useState(false);
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const open = useCallback(() => {
    // Seed from the currently-displayed range so a small fix is a couple of taps.
    setLow(String(Math.round(range.low)));
    setHigh(String(Math.round(range.high)));
    setError(null);
    setEditing(true);
  }, [range.low, range.high]);

  const cancel = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    const parsed = parseCarbInputs(low, high);
    if (!parsed.ok) {
      setError(parsed.reason);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await correctFoodRecord(record.id, {
        corrected_carbs_low: parsed.low,
        corrected_carbs_high: parsed.high,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(describeCorrectionError(err));
    } finally {
      setSaving(false);
    }
  }, [low, high, record.id, onUpdated]);

  if (!editing) {
    return (
      <SecondaryButton
        onClick={open}
        data-testid="meal-correct-button"
        size="sm"
      >
        Correct carbs
      </SecondaryButton>
    );
  }

  return (
    <div
      data-testid="meal-correction-editor"
      className="space-y-4 rounded-panel border border-border-default bg-surface-primary p-5"
    >
      <h2 className="font_poppins font_header_4 text-foreground-primary">
        Correct the carb estimate (grams)
      </h2>
      <div className="flex gap-3">
        <label className="font_poppins font_body_4 flex-1 text-foreground-secondary">
          Low (g)
          <Input
            type="number"
            inputMode="numeric"
            min={CARB_GRAMS_MIN}
            max={CARB_GRAMS_MAX}
            value={low}
            onChange={(e) => setLow(e.target.value)}
            data-testid="meal-correct-low"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className="font_ui_input mt-1 h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-foreground-primary focus-visible:border-border-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active"
          />
        </label>
        <label className="font_poppins font_body_4 flex-1 text-foreground-secondary">
          High (g)
          <Input
            type="number"
            inputMode="numeric"
            min={CARB_GRAMS_MIN}
            max={CARB_GRAMS_MAX}
            value={high}
            onChange={(e) => setHigh(e.target.value)}
            data-testid="meal-correct-high"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className="font_ui_input mt-1 h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-foreground-primary focus-visible:border-border-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active"
          />
        </label>
      </div>

      {/* AC2: corrected values fix the record only -- they are decoupled from all
          dosing math, and the never-dose framing is the server-cleared qualifier. */}
      <p
        data-testid="meal-correct-decoupling"
        className="font_poppins font_body_4 text-foreground-secondary"
      >
        Correcting only updates this record — corrected values are never fed to
        IoB, treatment safety, or carb-ratio math.
      </p>
      <MealSafetyQualifier qualifier={record.safety_qualifier} />

      {error && (
        <p
          role="alert"
          id={errorId}
          data-testid="meal-correct-error"
          className="font_poppins font_body_4 text-signal-error-text"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <SecondaryButton
          onClick={cancel}
          disabled={saving}
          data-testid="meal-correct-cancel"
          className="flex-1"
        >
          Cancel
        </SecondaryButton>
        <HighlightButton
          onClick={submit}
          disabled={saving}
          data-testid="meal-correct-save"
          className="flex-1"
        >
          {saving ? "Saving…" : "Save"}
        </HighlightButton>
      </div>
    </div>
  );
}

/**
 * Confirm or correct what the food is. Distinct from carb correction: this is
 * what opens external authoritative grounding (USDA / Open Food Facts /
 * restaurant facts) server-side, so a confident misidentification is never
 * certified with a citation. An own-history suggestion (when present) pre-fills
 * a one-click confirm.
 */
export function MealIdentitySection({
  record,
  onUpdated,
}: MealEditorProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const candidate = prefillIdentity(record);

  const openEditor = useCallback(() => {
    setName(candidate);
    setError(null);
    setEditing(true);
  }, [candidate]);

  const cancelEditor = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const submit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setError("Tell us what this food is.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const updated = await confirmFoodIdentity(record.id, trimmed);
        onUpdated(updated);
        setEditing(false);
      } catch (err) {
        setError(describeIdentityError(err));
      } finally {
        setSaving(false);
      }
    },
    [record.id, onUpdated]
  );

  // Editing the free-text name (used for both "Correct" and "Change what this is").
  if (editing) {
    return (
      <div
        data-testid="meal-identity-editor"
        className="space-y-4 rounded-panel border border-border-default bg-surface-primary p-5"
      >
        <label className="font_poppins font_body_4 block text-foreground-secondary">
          Food name
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="meal-identity-input"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className="font_ui_input mt-1 h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-foreground-primary focus-visible:border-border-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active"
          />
        </label>
        <IdentityGroundingExplainer />
        {error && (
          <p
            role="alert"
            id={errorId}
            data-testid="meal-identity-error"
            className="font_poppins font_body_4 text-signal-error-text"
          >
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <SecondaryButton
            onClick={cancelEditor}
            disabled={saving}
            data-testid="meal-identity-cancel"
            className="flex-1"
          >
            Cancel
          </SecondaryButton>
          <HighlightButton
            onClick={() => submit(name)}
            disabled={saving || !name.trim()}
            data-testid="meal-identity-save"
            className="flex-1"
          >
            {saving ? "Confirming…" : "Confirm"}
          </HighlightButton>
        </div>
      </div>
    );
  }

  // Already confirmed: let the user change what it is (which re-opens grounding).
  if (record.identity_confirmed) {
    return (
      <div className="space-y-2">
        <p
          data-testid="meal-identity-confirmed-note"
          className="font_poppins font_body_2 text-foreground-primary"
        >
          <Icon
            className="mr-1 inline h-4 w-4 text-signal-check-text"
            decorative
            icon="check"
          />
          You confirmed this food.
        </p>
        <SecondaryButton
          onClick={openEditor}
          data-testid="meal-identity-change"
          size="sm"
        >
          Change what this is
        </SecondaryButton>
      </div>
    );
  }

  // Not yet confirmed: prompt to confirm (opens grounding) or correct the name.
  return (
    <div
      data-testid="meal-identity-prompt"
      className="space-y-3 rounded-panel border border-border-active bg-surface-primary p-5"
    >
      <p className="font_poppins font_body_2 text-foreground-primary">
        {record.suggested_identity ? (
          <>
            Looks like your saved “{record.suggested_identity}” — confirm?
          </>
        ) : (
          <>Confirm what this food is so we can ground it against real nutrition data.</>
        )}
      </p>
      <IdentityGroundingExplainer />
      {error && (
        <p
          role="alert"
          id={errorId}
          data-testid="meal-identity-error"
          className="font_poppins font_body_4 text-signal-error-text"
        >
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <HighlightButton
          onClick={() => submit(candidate)}
          disabled={saving || !candidate}
          data-testid="meal-identity-confirm"
        >
          {saving ? "Confirming…" : "Confirm"}
        </HighlightButton>
        <SecondaryButton
          onClick={openEditor}
          disabled={saving}
          data-testid="meal-identity-correct"
        >
          That’s not it
        </SecondaryButton>
      </div>
    </div>
  );
}
