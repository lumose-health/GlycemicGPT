"use client";

import { useCallback, useState } from "react";
import { Icon } from "@/base";
import { AnimatedCard } from "@/components/AnimatedCard";
import { DestructiveButton } from "@/components/DestructiveButton";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import { HighlightButton } from "@/components/HighlightButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { TextInput } from "@/components/TextInput";
import {
  deleteCommonFood,
  updateCommonFood,
} from "@/lib/api";
import { describeCommonFoodError } from "@/lib/common-food-format";
import {
  CARB_GRAMS_MAX,
  CARB_GRAMS_MIN,
  formatCarbRange,
  parseCarbInputs,
} from "@/lib/meal-display";
import type { CommonFoodCardProps } from "./CommonFoodCard.types";

interface EditState {
  high: string;
  low: string;
  name: string;
}

export function CommonFoodCard({
  delay = 0,
  food,
  onDeleted,
  onEdited,
}: CommonFoodCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditState>({
    high: "",
    low: "",
    name: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = `common-food-${food.id}-edit-error`;

  const open = useCallback(() => {
    setDraft({
      high: String(Math.round(food.carbs_high)),
      low: String(Math.round(food.carbs_low)),
      name: food.name,
    });
    setError(null);
    setEditing(true);
  }, [food.carbs_high, food.carbs_low, food.name]);

  const cancel = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    const name = draft.name.trim();
    if (!name) {
      setError("Enter a name for this common food.");
      return;
    }

    const parsed = parseCarbInputs(draft.low, draft.high);
    if (!parsed.ok) {
      setError(parsed.reason);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateCommonFood(food.id, {
        carbs_high: parsed.high,
        carbs_low: parsed.low,
        name,
      });
      setEditing(false);
      onEdited();
    } catch (requestError) {
      setError(describeCommonFoodError(requestError));
    } finally {
      setSaving(false);
    }
  }, [draft, food.id, onEdited]);

  const remove = useCallback(async () => {
    if (
      !window.confirm(
        `Delete the common food “${food.name}”? Meals linked to it stay logged. They are only unlinked from this baseline.`,
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      await deleteCommonFood(food.id);
      onDeleted();
    } catch (requestError) {
      setError(describeCommonFoodError(requestError));
    } finally {
      setDeleting(false);
    }
  }, [food.id, food.name, onDeleted]);

  if (editing) {
    return (
      <AnimatedCard delay={delay}>
        <section
          className="space-y-4 rounded-panel border border-border-default bg-surface-elevated p-5"
          data-testid="common-food-editor"
        >
          <TextInput
            aria-describedby={error ? errorId : undefined}
            aria-invalid={Boolean(error)}
            data-testid="common-food-edit-name"
            label="Name"
            maxLength={120}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            value={draft.name}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              aria-describedby={error ? errorId : undefined}
              aria-invalid={Boolean(error)}
              data-testid="common-food-edit-low"
              inputMode="numeric"
              label="Low (g)"
              max={CARB_GRAMS_MAX}
              min={CARB_GRAMS_MIN}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  low: event.target.value,
                }))
              }
              type="number"
              value={draft.low}
            />
            <TextInput
              aria-describedby={error ? errorId : undefined}
              aria-invalid={Boolean(error)}
              data-testid="common-food-edit-high"
              inputMode="numeric"
              label="High (g)"
              max={CARB_GRAMS_MAX}
              min={CARB_GRAMS_MIN}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  high: event.target.value,
                }))
              }
              type="number"
              value={draft.high}
            />
          </div>
          {error ? (
            <FeedbackMessage
              className="p-3"
              data-testid="common-food-edit-error"
              id={errorId}
              message={error}
              variant="error"
            />
          ) : null}
          <div className="flex gap-3">
            <SecondaryButton
              className="flex-1"
              data-testid="common-food-edit-cancel"
              disabled={saving}
              onClick={cancel}
            >
              Cancel
            </SecondaryButton>
            <HighlightButton
              className="flex-1"
              data-testid="common-food-edit-save"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </HighlightButton>
          </div>
        </section>
      </AnimatedCard>
    );
  }

  return (
    <AnimatedCard delay={delay}>
      <article
        className="flex items-center justify-between gap-4 rounded-panel border border-border-default bg-surface-elevated p-4"
        data-testid="common-food-row"
      >
        <div className="min-w-0">
          <h2
            className="font_poppins font_header_4 truncate text-foreground-primary"
            data-testid="common-food-name"
          >
            {food.name}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className="font_metric_label text-foreground-primary"
              data-testid="common-food-range"
            >
              {formatCarbRange(food.carbs_low, food.carbs_high)}
            </span>
            <time className="font_metric_caption text-foreground-primary">
              Updated {new Date(food.updated_at).toLocaleDateString()}
            </time>
          </p>
          {error ? (
            <p
              className="font_poppins font_body_4 mt-2 text-signal-error-text"
              data-testid="common-food-row-error"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SecondaryButton
            aria-label={`Edit ${food.name}`}
            data-testid="common-food-edit"
            onClick={open}
            size="sm"
          >
            Edit
          </SecondaryButton>
          <DestructiveButton
            aria-label={`Delete ${food.name}`}
            className="h-8 w-8 p-0"
            data-testid="common-food-delete"
            disabled={deleting}
            onClick={() => void remove()}
          >
            {deleting ? (
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-pill border-2 border-border-default border-t-signal-error-text"
              />
            ) : (
              <Icon className="h-4 w-4" decorative icon="trash" />
            )}
          </DestructiveButton>
        </div>
      </article>
    </AnimatedCard>
  );
}
