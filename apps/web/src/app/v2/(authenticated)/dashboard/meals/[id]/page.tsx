"use client";

/**
 * Meal detail.
 *
 * Shows one food record: the (placeholder) photo, identity, carb range, the
 * empirical-dispersion confidence band, read-only macros, and provenance. There
 * is deliberately no dose/insulin element; the server-cleared safety qualifier
 * carries the never-dose framing. Delete reuses the native-confirm UX.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getFoodRecord,
  deleteFoodRecord,
  type FoodRecord,
} from "@/lib/api";
import { classifyMealError, type MealErrorInfo } from "@/lib/meal-errors";
import {
  effectiveCarbRange,
  formatCarbRange,
  confidenceLabel,
  mealTitle,
} from "@/lib/meal-format";
import { ActionLink } from "@/components/ActionLink";
import { AnimatedCard } from "@/components/AnimatedCard";
import { ContentPage } from "@/components/ContentPage";
import { DestructiveButton } from "@/components/DestructiveButton";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import { LoadingState } from "@/components/LoadingState";
import { MealAuditPanel } from "@/components/MealAuditPanel";
import { MealCommonFoodSection } from "@/components/MealCommonFoodSection";
import {
  MealCorrectionSection,
  MealIdentitySection,
} from "@/components/MealEditor";
import {
  MealAssumedPortion,
  MealComorbidityNutrition,
  MealErrorPanel,
  MealGroundingStatus,
  MealIdentityConfirmedBadge,
  MealNutritionDisclaimer,
  MealNutritionFacts,
  MealSafetyQualifier,
  MealSourceBadge,
} from "@/components/MealDetails";
import { MealPhoto } from "@/components/MealPhoto";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { Panel } from "@/components/Panel";

export default function MealDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();

  const [record, setRecord] = useState<FoodRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [blockedInfo, setBlockedInfo] = useState<MealErrorInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    // Guard against a stale response applying after the id changes or unmount.
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Clear any prior meal so a stale record can't render under a new id.
    setRecord(null);
    setBlockedInfo(null);
    getFoodRecord(id)
      .then((data) => {
        if (cancelled) return;
        setRecord(data);
        setBlockedInfo(null);
      })
      .catch((err) => {
        if (cancelled) return;
        const info = classifyMealError(err);
        if (info.retryable) {
          setError(info.message);
          setRecord(null);
        } else {
          setBlockedInfo(info);
          setRecord(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleDelete = useCallback(async () => {
    if (!record || deleting) return;
    if (
      !window.confirm(
        `Delete this meal log${
          mealTitle(record) ? ` (${mealTitle(record)})` : ""
        }? This also removes its photo and cannot be undone.`
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteFoodRecord(record.id);
      router.push("/dashboard/meals");
    } catch (err) {
      setError(classifyMealError(err).message);
      setDeleting(false);
    }
  }, [record, deleting, router]);

  // A correction / identity-confirmation returns the refreshed record; swap it in
  // so the carb band, source badge, and grounding attribution re-render in place.
  // Guard on the route id: this route segment re-runs its loader on navigation
  // without remounting, so a response that resolves after the user moved to a
  // different meal must not overwrite the now-active record with stale data.
  const handleUpdated = useCallback(
    (updated: FoodRecord) => {
      if (updated.id !== id) return;
      setRecord(updated);
      setError(null);
    },
    [id]
  );

  if (loading) {
    return (
      <ContentPage className="max-w-3xl">
        <LoadingState label="Loading meal..." />
      </ContentPage>
    );
  }

  if (blockedInfo) {
    return (
      <PageTransition>
        <ContentPage className="max-w-3xl">
          <ActionLink href="/dashboard/meals" variant="secondary">
            Back to Meals
          </ActionLink>
          <MealErrorPanel info={blockedInfo} />
        </ContentPage>
      </PageTransition>
    );
  }

  if (!record) {
    return (
      <PageTransition>
        <ContentPage className="max-w-3xl">
          <ActionLink href="/dashboard/meals" variant="secondary">
            Back to Meals
          </ActionLink>
          <FeedbackMessage
            message={error || "This meal could not be loaded."}
            title="Meal unavailable"
            variant="error"
          />
        </ContentPage>
      </PageTransition>
    );
  }

  const range = effectiveCarbRange(record);
  const facts = record.nutrition_facts;
  const hasNutrition = !!facts && (facts.macros.length > 0 || !!facts.net_carbs);

  return (
    <PageTransition>
      <ContentPage className="max-w-3xl">
        <ActionLink href="/dashboard/meals" variant="secondary">
          Back to Meals
        </ActionLink>

        <PageHeader
          actions={
            <DestructiveButton
              data-testid="meal-delete"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting…" : "Delete"}
            </DestructiveButton>
          }
          description={new Date(record.meal_timestamp).toLocaleString()}
          icon="fork-knife"
          title={mealTitle(record)}
        />

        {error ? (
          <FeedbackMessage message={error} variant="error" />
        ) : null}

        <AnimatedCard>
          <Panel
            bodyClassName="space-y-5"
            heading="Meal estimate"
            headingLevel={2}
          >
            <MealPhoto recordId={record.id} size="lg" />

            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid="meal-carb-range"
                className="font_poppins font_header_2 text-foreground-primary"
              >
                {formatCarbRange(range.low, range.high)}
              </span>
              <span
                data-testid="meal-confidence"
                className="font_metric_label text-foreground-secondary"
              >
                {confidenceLabel(record.confidence)}
              </span>
              <MealSourceBadge source={record.source} />
              {record.identity_confirmed ? (
                <MealIdentityConfirmedBadge />
              ) : null}
            </div>

            {range.corrected ? (
              <p className="font_poppins font_body_3 text-foreground-secondary">
                You corrected this. AI estimated{" "}
                {formatCarbRange(record.carbs_low, record.carbs_high)}.
              </p>
            ) : null}

            <MealSafetyQualifier qualifier={record.safety_qualifier} />
            <MealGroundingStatus record={record} />
            <MealCorrectionSection record={record} onUpdated={handleUpdated} />
          </Panel>
        </AnimatedCard>

        <AnimatedCard delay={0.05}>
          <Panel heading="What is this?" headingLevel={2}>
            <MealIdentitySection record={record} onUpdated={handleUpdated} />
          </Panel>
        </AnimatedCard>

        <AnimatedCard delay={0.075}>
          <Panel
            heading="Common foods"
            headingLevel={2}
          >
            <div className="mb-3 flex justify-end">
              <ActionLink
                className="h-8 px-3"
                href="/dashboard/meals/common-foods"
                data-testid="meal-manage-common-foods"
                variant="secondary"
              >
                Manage
              </ActionLink>
            </div>
            <MealCommonFoodSection record={record} onUpdated={handleUpdated} />
          </Panel>
        </AnimatedCard>

        <AnimatedCard delay={0.1}>
          <MealAuditPanel record={record} />
        </AnimatedCard>

        {facts?.portion && (
          <AnimatedCard delay={0.125}>
            <MealAssumedPortion portion={facts.portion} />
          </AnimatedCard>
        )}

        {hasNutrition && facts && (
          <AnimatedCard delay={0.15}>
            <MealNutritionFacts facts={facts} />
          </AnimatedCard>
        )}

        {facts?.disclaimer && (
          <MealNutritionDisclaimer disclaimer={facts.disclaimer} />
        )}

        {record.comorbidity_nutrition && (
          <AnimatedCard delay={0.175}>
            <MealComorbidityNutrition
              record={record}
              comorbidity={record.comorbidity_nutrition}
            />
          </AnimatedCard>
        )}

        {(record.ai_model || record.ai_provider) && (
          <p className="font_metric_caption text-center text-foreground-secondary">
            Estimated by {record.ai_model || "AI"}
            {record.ai_provider ? ` · ${record.ai_provider}` : ""}
          </p>
        )}
      </ContentPage>
    </PageTransition>
  );
}
