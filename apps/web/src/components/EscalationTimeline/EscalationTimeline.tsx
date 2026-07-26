"use client";
/**
 * Story 6.7: Escalation Timeline Component.
 *
 * Displays the escalation history for an alert, showing progression
 * through tiers (reminder, primary contact, all contacts).
 */
import { useEffect, useState } from"react";
import { AlertCircle, Clock, Loader2, User, Users } from"lucide-react";
import { twMerge } from "@/lib/ui/twMerge";
import { getAlertEscalationTimeline } from"@/lib/api";
import type { EscalationEvent } from"@/lib/api";
import type { EscalationTimelineProps } from "./EscalationTimeline.types";
const TIER_CONFIG: Record<
  string,
  {
    label: string;
    icon: typeof Clock;
    color: string;
    bg: string;
    border: string;
  }
> = {
  reminder: {
    label:"Reminder Sent",
    icon: Clock,
    color:"text-signal-warning-text",
    bg:"bg-signal-warning-fill/10",
    border:"border-signal-warning-fill/40",
  },
  primary_contact: {
    label:"Primary Contact Notified",
    icon: User,
    color:"text-signal-warning-text",
    bg:"bg-signal-warning-fill/10",
    border:"border-signal-warning-fill/40",
  },
  all_contacts: {
    label:"All Contacts Notified",
    icon: Users,
    color:"text-signal-error-text",
    bg:"bg-signal-error-fill/10",
    border:"border-signal-error-fill/40",
  },
};
const UNKNOWN_TIER = {
  label:"Unknown Escalation",
  icon: AlertCircle,
  color:"text-foreground-secondary",
  bg:"bg-surface-secondary/20",
  border:"border-border-hover/30",
};
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
}
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    sent:"bg-signal-check-fill/10 text-signal-check-text border-signal-check-fill/40",
    pending:"bg-signal-warning-fill/10 text-signal-warning-text border-signal-warning-fill/40",
    failed:"bg-signal-error-fill/10 text-signal-error-text border-signal-error-fill/40",
  };
  return (
    <span
      className={twMerge("font_metric_caption uppercase px-1.5 py-0.5 rounded-sm border",
        styles[status] || styles.pending
      )}
    >
      {status}
    </span>
  );
}
export function EscalationTimeline({ alertId }: EscalationTimelineProps) {
  const [events, setEvents] = useState<EscalationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAlertId, setFetchedAlertId] = useState<string | null>(null);
  useEffect(() => {
    // Skip re-fetch if data is already loaded for this alert
    if (fetchedAlertId === alertId) return;
    let cancelled = false;
    async function fetchTimeline() {
      try {
        setLoading(true);
        const data = await getAlertEscalationTimeline(alertId);
        if (!cancelled) {
          setEvents(data.events);
          setError(null);
          setFetchedAlertId(alertId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message :"Failed to load timeline"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    fetchTimeline();
    return () => {
      cancelled = true;
    };
  }, [alertId, fetchedAlertId]);
  if (loading) {
    return (
      <div className="flex items-center gap-2 font_metric_caption text-foreground-secondary mt-3">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        <span>Loading escalation timeline...</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="font_metric_caption text-signal-error-text mt-3" role="alert">
        Escalation timeline unavailable
      </div>
    );
  }
  if (events.length === 0) {
    return null;
  }
  return (
    <div className="mt-3 space-y-2" aria-label="Escalation timeline">
      <p className="font_metric_caption uppercase text-foreground-secondary">
        Escalation History
      </p>
      {events.map((event) => {
        const tier = TIER_CONFIG[event.tier] || UNKNOWN_TIER;
        const TierIcon = tier.icon;
        return (
          <div
            key={event.id}
            className={twMerge("flex items-center gap-2 rounded-lg border px-3 py-2",
              tier.bg,
              tier.border
            )}
          >
            <TierIcon
              className={twMerge("h-3.5 w-3.5 shrink-0", tier.color)}
              aria-hidden="true"
            />
            <span className={twMerge("font_metric_caption", tier.color)}>
              {tier.label}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <StatusBadge status={event.notification_status} />
              <span className="font_metric_caption text-foreground-secondary">
                {formatTimestamp(event.triggered_at)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
