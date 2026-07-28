"use client";
/**
 * AIInsightCard Component
 *
 * Stories 5.7-5.8: AI Insight Card
 * Displays an AI-generated insight (daily brief, meal analysis,
 * or correction analysis) with acknowledge/dismiss actions,
 *"Not medical advice" disclaimer, and expandable reasoning/audit panel.
 *
 * Accessibility features:
 * - Semantic article element with aria-label
 * - Keyboard-navigable action buttons
 * - Screen reader status announcements via aria-live
 * - Visible focus rings
 * - Respects reduced motion preferences
 */
import { useMemo, useState } from "react";
import { Button, Icon } from "@/base";
import { twMerge } from "@/lib/ui/twMerge";
import type { InsightDetail } from "@/lib/api";
import { MarkdownContent } from "@/components/MarkdownContent";
import type { AIInsightCardProps, InsightData } from "./AIInsightCard.types";
// Analysis type configuration
const ANALYSIS_CONFIG = {
  daily_brief: {
    icon: "lightbulb",
    color: "text-accent",
    bg: "bg-accent/10",
    border: "border-accent/20",
    label: "Daily Brief",
  },
  meal_analysis: {
    icon: "fork-knife",
    color: "text-signal-warning-text",
    bg: "bg-signal-warning-fill/10",
    border: "border-signal-warning-fill/20",
    label: "Meal Analysis",
  },
  correction_analysis: {
    icon: "glucose",
    color: "text-signal-partial-text",
    bg: "bg-signal-partial-fill/10",
    border: "border-signal-partial-fill/20",
    label: "Correction Analysis",
  },
} as const;
/**
 * Format a date string for display.
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
/**
 * Format a date range for the analysis period.
 */
function formatPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "Unknown period";
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(s)} – ${fmt(e)}`;
}
/**
 * Format data context values for display.
 */
function DataContextDisplay({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([, v]) => v !== null && v !== undefined,
  );
  if (entries.length === 0) return null;
  const formatKey = (key: string) =>
    key.replace(/_/g, "").replace(/\b\w/g, (c) => c.toUpperCase());
  const formatValue = (v: unknown): string => {
    if (Array.isArray(v)) {
      return `${v.length} ${v.length === 1 ? "period" : "periods"} analyzed`;
    }
    if (typeof v === "number") {
      return Number.isInteger(v) ? String(v) : v.toFixed(1);
    }
    return String(v);
  };
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex justify-between font_metric_caption">
          <span className="text-foreground-secondary">{formatKey(key)}</span>
          <span className="text-foreground-secondary font_jetbrains_mono">
            {formatValue(value)}
          </span>
        </div>
      ))}
    </div>
  );
}
/**
 * Status badge component.
 */
function StatusBadge({ status }: { status: InsightData["status"] }) {
  const config = {
    pending: {
      text: "New",
      className: "bg-accent/10 text-accent",
    },
    acknowledged: {
      text: "Acknowledged",
      className: "bg-signal-check-fill/10 text-signal-check-text",
    },
    dismissed: {
      text: "Dismissed",
      className: "bg-surface-secondary text-foreground-primary",
    },
  };
  const { text, className } = config[status];
  return (
    <span
      className={twMerge(
        "inline-flex items-center px-2 py-0.5 rounded-full font_metric_caption",
        className,
      )}
    >
      {text}
    </span>
  );
}
export function AIInsightCard({
  insight,
  onRespond,
  onFetchDetail,
}: AIInsightCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [localStatus, setLocalStatus] = useState(insight.status);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detail, setDetail] = useState<InsightDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const config = ANALYSIS_CONFIG[insight.analysis_type];
  // Strip markdown syntax for clean plain-text preview in collapsed view
  const plainText = useMemo(
    () =>
      insight.content
        .replace(/#{1,6}\s+/g, "") // headings
        .replace(/\*\*(.+?)\*\*/g, "$1") // bold
        .replace(/\*(.+?)\*/g, "$1") // italic
        .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, "")) // code
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
        .replace(/^[-*+]\s+/gm, "") // unordered list markers
        .replace(/^\d+\.\s+/gm, "") // ordered list markers
        .replace(/^>\s+/gm, "") // blockquotes
        .replace(/\n{2,}/g, "") // collapse multiple newlines
        .trim(),
    [insight.content],
  );
  const maxPreviewLength = 200;
  const needsTruncation = plainText.length > maxPreviewLength;
  const previewContent = needsTruncation
    ? plainText.slice(0, maxPreviewLength) + "..."
    : plainText;
  const handleRespond = async (response: "acknowledged" | "dismissed") => {
    if (!onRespond || isResponding) return;
    setIsResponding(true);
    setError(null);
    try {
      await onRespond(insight.analysis_type, insight.id, response);
      setLocalStatus(response);
      setDetail(null); // Invalidate cached detail so re-fetch picks up response
      setAnnouncement(
        `Insight ${response === "acknowledged" ? "acknowledged" : "dismissed"}`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to record response",
      );
    } finally {
      setIsResponding(false);
    }
  };
  const handleToggleDetail = async () => {
    if (showDetail) {
      setShowDetail(false);
      return;
    }
    // Fetch detail if not already loaded
    if (!detail && onFetchDetail) {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const result = await onFetchDetail(insight.analysis_type, insight.id);
        setDetail(result);
      } catch (err) {
        setDetailError(
          err instanceof Error ? err.message : "Failed to load details",
        );
        setDetailLoading(false);
        return;
      } finally {
        setDetailLoading(false);
      }
    }
    setShowDetail(true);
  };
  return (
    <article
      className={twMerge(
        "rounded-xl border p-5 transition-colors",
        "bg-surface-primary",
        config.border,
        "focus-within:ring-2 focus-within:ring-border-active focus-within:ring-offset-2 focus-within:ring-offset-surface-primary",
      )}
      aria-label={`${config.label}: ${insight.title}`}
    >
      {/* Screen reader announcement for status changes */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {/* Header row */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className={twMerge("p-2 rounded-lg shrink-0", config.bg)}
          aria-hidden="true"
        >
          <Icon
            className={twMerge("h-5 w-5", config.color)}
            decorative
            icon={config.icon}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={twMerge("font_metric_caption uppercase", config.color)}
            >
              {config.label}
            </span>
            <StatusBadge status={localStatus} />
          </div>
          <h3 className="font_body_3 text-foreground-primary ">
            {insight.title}
          </h3>
          <time
            className="font_metric_caption text-foreground-secondary mt-0.5 block"
            dateTime={insight.created_at}
          >
            {formatDate(insight.created_at)}
          </time>
        </div>
      </div>
      {/* Not medical advice disclaimer */}
      <div
        className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-signal-warning-fill/5 border border-signal-warning-fill/10"
        role="note"
        aria-label="Not medical advice disclaimer"
      >
        <p className="font_metric_caption text-signal-warning-text/80">
          Not medical advice. Always consult your healthcare provider.
        </p>
      </div>
      {/* Content */}
      {isExpanded || !needsTruncation ? (
        <MarkdownContent
          content={insight.content}
          className="text-foreground-secondary"
        />
      ) : (
        <div className="font_body_3 text-foreground-secondary whitespace-pre-line">
          {previewContent}
        </div>
      )}
      {/* Expand/collapse toggle */}
      {needsTruncation && (
        <Button
          onClick={() => setIsExpanded(!isExpanded)}
          className={twMerge(
            "mt-2 font_metric_caption flex items-center gap-1",
            "text-foreground-secondary hover:text-foreground-primary transition-colors",
            "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active rounded-sm",
          )}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Show less" : "Show more"}
        >
          {isExpanded ? (
            <>
              Show less
              <Icon
                className="h-3 w-3 -rotate-90"
                decorative
                icon="chevron"
              />
            </>
          ) : (
            <>
              Show more
              <Icon
                className="h-3 w-3 rotate-90"
                decorative
                icon="chevron"
              />
            </>
          )}
        </Button>
      )}
      {/* View Details button */}
      {onFetchDetail && (
        <Button
          onClick={handleToggleDetail}
          disabled={detailLoading}
          className={twMerge(
            "mt-3 font_metric_caption flex items-center gap-1.5",
            "text-foreground-secondary hover:text-foreground-primary transition-colors",
            "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active rounded-sm",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
          aria-expanded={showDetail}
          aria-label={
            showDetail
              ? "Hide reasoning and audit details"
              : "View reasoning and audit details"
          }
        >
          {detailLoading ? (
            <>
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border-default border-t-accent"
              />
              Loading...
            </>
          ) : (
            <>
              <Icon
                className="h-3.5 w-3.5"
                decorative
                icon="lightbulb"
              />
              {showDetail ? "Hide Details" : "View Details"}
              {showDetail ? (
                <Icon
                  className="h-3 w-3 -rotate-90"
                  decorative
                  icon="chevron"
                />
              ) : (
                <Icon
                  className="h-3 w-3 rotate-90"
                  decorative
                  icon="chevron"
                />
              )}
            </>
          )}
        </Button>
      )}
      {/* Detail error */}
      {detailError && (
        <p
          className="mt-2 font_metric_caption text-signal-error-text"
          role="alert"
        >
          {detailError}
        </p>
      )}
      {/* Reasoning & Audit Detail Panel */}
      {showDetail && detail && (
        <div
          className="mt-3 pt-3 border-t border-border-default space-y-4"
          role="region"
          aria-label="Insight reasoning and audit details"
        >
          {/* Analysis Period */}
          <div>
            <h4 className="font_metric_caption text-foreground-secondary uppercase mb-1">
              Analysis Period
            </h4>
            <p className="font_body_3 text-foreground-secondary">
              {formatPeriod(detail.period_start, detail.period_end)}
            </p>
          </div>
          {/* Data Context */}
          <div>
            <h4 className="font_metric_caption text-foreground-secondary uppercase mb-2">
              Data Used for Analysis
            </h4>
            <DataContextDisplay data={detail.data_context} />
          </div>
          {/* AI Model Info */}
          <div>
            <h4 className="font_metric_caption text-foreground-secondary uppercase mb-2">
              AI Model
            </h4>
            <div className="flex items-center gap-2">
              <Icon
                className="h-3.5 w-3.5 text-foreground-secondary"
                decorative
                icon="chat-bubbles"
              />
              <span className="font_metric_caption text-foreground-secondary">
                {detail.model_info.provider} / {detail.model_info.model}
              </span>
            </div>
            <div className="mt-1 font_metric_caption text-foreground-secondary">
              Tokens: {detail.model_info.input_tokens.toLocaleString()} in /{" "}
              {detail.model_info.output_tokens.toLocaleString()} out
            </div>
          </div>
          {/* Safety Validation */}
          <div>
            <h4 className="font_metric_caption text-foreground-secondary uppercase mb-2">
              Safety Validation
            </h4>
            {detail.safety ? (
              <div className="flex items-center gap-2">
                {detail.safety.has_dangerous_content ? (
                  <Icon
                    className="h-3.5 w-3.5 text-signal-error-text"
                    decorative
                    icon="circle-slash"
                  />
                ) : (
                  <Icon
                    className="h-3.5 w-3.5 text-signal-check-text"
                    decorative
                    icon="check"
                  />
                )}
                <span
                  className={twMerge(
                    "font_metric_caption",
                    detail.safety.has_dangerous_content
                      ? "text-signal-error-text"
                      : "text-signal-check-text",
                  )}
                >
                  {detail.safety.status}
                  {detail.safety.has_dangerous_content &&
                    " — flagged content detected"}
                </span>
              </div>
            ) : (
              <p className="font_metric_caption text-foreground-secondary">
                No safety log available
              </p>
            )}
          </div>
        </div>
      )}
      {/* Error message */}
      {error && (
        <p
          className="mt-2 font_metric_caption text-signal-error-text"
          role="alert"
        >
          {error}
        </p>
      )}
      {/* Action buttons (only show for pending insights) */}
      {localStatus === "pending" && onRespond && (
        <div
          className="flex items-center gap-2 mt-4 pt-3 border-t border-border-default"
          role="group"
          aria-label="Insight actions"
        >
          <Button
            onClick={() => handleRespond("acknowledged")}
            disabled={isResponding}
            className={twMerge(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font_metric_caption",
              "bg-signal-check-fill/10 text-signal-check-text hover:bg-signal-check-fill/20",
              "transition-colors",
              "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-signal-check-fill",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
            aria-label="Acknowledge this insight"
          >
            <Icon
              className="h-3.5 w-3.5"
              decorative
              icon="check"
            />
            Acknowledge
          </Button>
          <Button
            onClick={() => handleRespond("dismissed")}
            disabled={isResponding}
            className={twMerge(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font_metric_caption",
              "bg-surface-secondary text-foreground-primary hover:bg-surface-tertiary/50",
              "transition-colors",
              "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-hover",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
            aria-label="Dismiss this insight"
          >
            <Icon
              className="h-3.5 w-3.5"
              decorative
              icon="circle-slash"
            />
            Dismiss
          </Button>
        </div>
      )}
    </article>
  );
}
