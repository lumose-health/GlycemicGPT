"use client";

/**
 * "How this was estimated" audit / provenance panel for the meal detail view.
 *
 * Surfaces the deterministic audit trail the API records for a vision estimate
 * (the merged `GET /api/food-records/{id}/audit`, Story 50.H3): the raw per-sample
 * vision reads, the empirical dispersion summary, and the precedence decision.
 * The point is the same one a deterministic healthcare tool gives you -- let the
 * user judge how much to trust a number by showing how it was produced.
 *
 * Strictly descriptive provenance: it carries the server-cleared never-dose
 * qualifier and never presents a dose or recommendation. It deliberately does NOT
 * surface the model's self-reported confidence -- the server strips that before
 * responding (it stays internal, per Story 50.H1), and only the EMPIRICAL
 * dispersion-derived confidence is shown.
 *
 * Reuses `AIInsightCard`'s shape: a card with an amber safety note and a lazy
 * expand/collapse that fetches the detail only on first open.
 *
 * Hidden when meal intelligence is off: this only renders inside the loaded-record
 * detail view, and a flag-off server hides the record itself (the detail page
 * shows a blocked state and never reaches this panel).
 */

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/base";
import { SecondaryButton } from "@/components/SecondaryButton";
import {
  getFoodRecordAudit,
  MealApiError,
  type AuditDispersion,
  type AuditPrecedence,
  type AuditSample,
  type FoodRecord,
  type FoodRecordAudit,
} from "@/lib/api";
import {
  confidenceLabel,
  formatCarbRange,
  formatCoefficientOfVariation,
  isGrounded,
} from "@/lib/meal-format";
import {
  GroundedSourceNote,
  MealSafetyQualifier,
} from "@/components/MealDetails";
import type { MealAuditPanelProps } from "./MealAuditPanel.types";

/** A labelled key/value provenance row. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font_metric_caption text-foreground-secondary">
        {label}
      </dt>
      <dd className="font_metric_label text-right text-foreground-primary">
        {value}
      </dd>
    </div>
  );
}

/** Section heading inside the expanded audit trail. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="font_metric_label uppercase text-foreground-secondary">
      {children}
    </h4>
  );
}

/**
 * The grounding citation (AC2): renders the record's grounding attribution as a
 * "how this was grounded" line (with the trust tier), distinct from the raw
 * vision estimate. Gated on `isGrounded` -- the same identity-confirmed gate the
 * detail view uses (Story 50.W2) -- so a stale/regressed source can never render
 * an authoritative citation before the user has confirmed what the food is. The
 * citation box itself is the shared `GroundedSourceNote`, so its safe-URL guard
 * and outbound-link attributes stay in lockstep with the detail card's.
 */
function GroundingCitation({ record }: { record: FoodRecord }) {
  if (!isGrounded(record)) return null;
  return (
    <div className="space-y-2">
      <SectionHeading>How this was grounded</SectionHeading>
      <GroundedSourceNote
        record={record}
        label="Checked against"
        linkLabel="view source"
        showTrustTier
        testId="meal-audit-grounding"
        linkTestId="meal-audit-grounding-link"
      />
    </div>
  );
}

/** The raw per-sample vision reads (AC1). One row per sample; no self-reported confidence. */
function SamplesSection({ samples }: { samples: AuditSample[] }) {
  if (samples.length === 0) return null;
  return (
    <div className="space-y-2">
      <SectionHeading>Photo reads ({samples.length})</SectionHeading>
      <ul className="space-y-1.5">
        {samples.map((sample, i) => {
          const carbs =
            sample.carbs_low != null && sample.carbs_high != null
              ? formatCarbRange(sample.carbs_low, sample.carbs_high)
              : "no carb read";
          return (
            <li
              key={i}
              data-testid="meal-audit-sample"
              className="font_metric_caption flex items-baseline justify-between gap-3"
            >
              <span className="min-w-0 truncate text-foreground-primary">
                {sample.identity?.trim() || "Unlabelled read"}
              </span>
              <span className="shrink-0 text-foreground-primary">
                {sample.parse_ok ? carbs : "unreadable"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The empirical dispersion summary (AC1 + AC3): how much the photo reads
 * disagreed. The confidence here is the EMPIRICAL dispersion band, never the
 * model's self-reported confidence.
 */
function DispersionSection({ dispersion }: { dispersion: AuditDispersion }) {
  const cv = formatCoefficientOfVariation(dispersion.coefficient_of_variation);
  const sampleCount =
    dispersion.samples_used != null && dispersion.samples_requested != null
      ? `${dispersion.samples_used} of ${dispersion.samples_requested}`
      : dispersion.samples_used != null
        ? String(dispersion.samples_used)
        : null;
  return (
    <div className="space-y-2">
      <SectionHeading>How much the reads agreed</SectionHeading>
      <dl
        data-testid="meal-audit-dispersion"
        className="space-y-1.5 rounded-panel border border-border-default bg-surface-primary px-3 py-2"
      >
        <DetailRow
          label="Confidence (from spread)"
          value={confidenceLabel(dispersion.confidence)}
        />
        {cv && <DetailRow label="Spread between reads" value={cv} />}
        {sampleCount && <DetailRow label="Usable reads" value={sampleCount} />}
        {dispersion.identity_agreement != null && (
          <DetailRow
            label="Reads agreed on the food"
            value={dispersion.identity_agreement ? "Yes" : "No"}
          />
        )}
        {dispersion.distinct_identities.length > 1 && (
          <DetailRow
            label="Identities seen"
            value={dispersion.distinct_identities.join(", ")}
          />
        )}
      </dl>
    </div>
  );
}

/** Humanize the precedence outcome into a short decision line. */
function precedenceDecision(precedence: AuditPrecedence): string {
  if (precedence.outcome === "grounded" && precedence.chosen_source) {
    return `Grounded against ${precedence.chosen_source}`;
  }
  return "Vision-only estimate";
}

/**
 * The precedence decision (AC1): which source won and the ladder AS IT STOOD when
 * the decision was made. The recorded ladder is shown rather than a live constant
 * so the trail reads the ordering that actually applied. The grounding citation
 * (above) carries the trust tier and outbound link; this section is just the
 * decision + the ordered ladder.
 *
 * The server documents the precedence payload as schema-loose (still settling),
 * so the ladder is coerced to an array before iterating rather than trusted blind.
 */
function PrecedenceSection({ precedence }: { precedence: AuditPrecedence }) {
  const ladder = Array.isArray(precedence.ladder) ? precedence.ladder : [];
  return (
    <div className="space-y-2" data-testid="meal-audit-precedence">
      <SectionHeading>Which source was used</SectionHeading>
      <div className="space-y-1.5 rounded-panel border border-border-default bg-surface-primary px-3 py-2">
        <DetailRow label="Decision" value={precedenceDecision(precedence)} />
        {precedence.identity_used && (
          <DetailRow label="Keyed on" value={precedence.identity_used} />
        )}
        {precedence.reason && (
          <p className="font_poppins font_body_4 text-foreground-secondary">
            {precedence.reason}
          </p>
        )}
        {ladder.length > 0 && (
          <div className="pt-1">
            <p className="font_poppins font_body_4 mb-1 text-foreground-secondary">
              Sources considered, in order:
            </p>
            <ol className="list-decimal list-inside space-y-0.5">
              {ladder.map((rung, i) => {
                const used =
                  !!precedence.chosen_source &&
                  rung.toLowerCase() === precedence.chosen_source.toLowerCase();
                return (
                  // Index-keyed: the ladder is render-only and never reordered, and
                  // a malformed payload could repeat a rung.
                  <li
                    key={`${i}-${rung}`}
                    className={
                      used
                        ? "font_metric_label text-foreground-primary"
                        : "font_metric_caption text-foreground-secondary"
                    }
                  >
                    {rung}
                    {used && " — used"}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

/** The expanded provenance body, once the audit has loaded. */
function AuditDetails({
  record,
  audit,
}: {
  record: FoodRecord;
  audit: FoodRecordAudit;
}) {
  return (
    <div
      data-testid="meal-audit-details"
      role="region"
      aria-label="How this estimate was produced"
      className="mt-3 space-y-4 border-t border-border-default pt-3"
    >
      <GroundingCitation record={record} />
      <SamplesSection samples={audit.samples} />
      {audit.dispersion && (
        <DispersionSection dispersion={audit.dispersion} />
      )}
      {audit.precedence && (
        <PrecedenceSection precedence={audit.precedence} />
      )}
    </div>
  );
}

/**
 * The audit / provenance panel. Closed, it is a compact "How this was estimated"
 * card with the never-dose qualifier; opening it lazily fetches and renders the
 * full audit trail.
 */
export function MealAuditPanel({ record }: MealAuditPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [audit, setAudit] = useState<FoodRecordAudit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A 404 means the record simply has no stored audit trail (benign) rather than
  // a failure to surface for retry.
  const [unavailable, setUnavailable] = useState(false);

  // The detail view swaps the record in place when the user corrects carbs or
  // confirms identity (which re-runs the grounding decision), so a cached audit
  // can go stale. Drop it and collapse on those changes; the next open refetches
  // the current trail. Mirrors AIInsightCard invalidating its cached detail.
  useEffect(() => {
    setAudit(null);
    setUnavailable(false);
    setError(null);
    setExpanded(false);
  }, [record.id, record.identity_confirmed, record.source, record.corrected_at]);

  const toggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    // Already resolved once (loaded, or known-unavailable): just re-open.
    if (audit || unavailable) {
      setExpanded(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getFoodRecordAudit(record.id);
      setAudit(result);
      setExpanded(true);
    } catch (err) {
      if (err instanceof MealApiError && err.status === 404) {
        setUnavailable(true);
        setExpanded(true);
      } else {
        // Transient: leave the panel collapsed so the button retries on re-click.
        setError("Couldn’t load how this was estimated. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [expanded, audit, unavailable, record.id]);

  return (
    <article
      data-testid="meal-audit-panel"
      aria-label="How this was estimated"
      className="space-y-4 rounded-panel border border-border-default bg-surface-elevated p-5 focus-within:ring-2 focus-within:ring-border-active"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-surface-secondary text-foreground-primary"
        >
          <Icon className="h-5 w-5" decorative icon="lightbulb" />
        </span>
        <div className="min-w-0">
          <h2 className="font_poppins font_header_4 text-foreground-primary">
            How this was estimated
          </h2>
          <p className="font_poppins font_body_4 mt-1 text-foreground-secondary">
            The photo reads, how much they agreed, and what grounded the number.
            Use this trail to judge how much to trust it.
          </p>
        </div>
      </div>

      {/* The never-dose qualifier travels with this provenance surface (AC4),
          rendered verbatim from the server-cleared field. */}
      <MealSafetyQualifier
        qualifier={record.safety_qualifier}
        testId="meal-audit-safety-qualifier"
      />

      <SecondaryButton
        onClick={toggle}
        disabled={loading}
        data-testid="meal-audit-toggle"
        aria-expanded={expanded}
        size="sm"
      >
        {loading ? (
          <>
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border-default border-t-accent"
            />
            Loading…
          </>
        ) : (
          <>
            {expanded ? "Hide details" : "View details"}
            <Icon
              className={
                expanded ? "h-3 w-3 -rotate-90" : "h-3 w-3 rotate-90"
              }
              decorative
              icon="chevron"
            />
          </>
        )}
      </SecondaryButton>

      {error && (
        <p
          role="alert"
          data-testid="meal-audit-error"
          className="font_poppins font_body_4 text-signal-error-text"
        >
          {error}
        </p>
      )}

      {expanded && unavailable && (
        <div
          role="note"
          data-testid="meal-audit-unavailable"
          className="font_poppins font_body_4 rounded-panel border border-border-default bg-surface-primary px-3 py-2 text-foreground-secondary"
        >
          <span>No estimation trail was recorded for this meal.</span>
        </div>
      )}

      {expanded && audit && <AuditDetails record={record} audit={audit} />}
    </article>
  );
}
