import { Icon } from "@/base";
import {
  isGrounded,
  isSafeHttpUrl,
} from "@/lib/meal-display";
import type { FoodRecord } from "@/lib/api";

export function GroundedSourceNote({
  label,
  linkLabel = "source",
  linkTestId,
  record,
  showTrustTier = false,
  testId,
}: {
  label: string;
  linkLabel?: string;
  linkTestId: string;
  record: FoodRecord;
  showTrustTier?: boolean;
  testId: string;
}) {
  return (
    <div
      className="font_poppins font_body_4 flex items-start gap-2 rounded-panel border border-border-active bg-surface-primary px-3 py-2 text-foreground-primary"
      data-testid={testId}
      role="note"
    >
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 text-signal-check-text"
        decorative
        icon="check"
      />
      <span>
        {label}{" "}
        <strong className="text-foreground-primary">
          {record.grounding_source}
        </strong>
        {showTrustTier && record.grounding_trust_tier
          ? ` (${record.grounding_trust_tier.toLowerCase()} source)`
          : null}
        {isSafeHttpUrl(record.grounding_source_url) ? (
          <>
            {" "}
            <a
              aria-label={`View ${record.grounding_source} source (opens in a new window)`}
              className="inline-flex items-center gap-1 text-accent underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active"
              data-testid={linkTestId}
              href={record.grounding_source_url!}
              rel="noopener noreferrer"
              target="_blank"
            >
              {linkLabel}
              <Icon
                className="h-3 w-3"
                decorative
                icon="link-external"
              />
            </a>
          </>
        ) : null}
        .
      </span>
    </div>
  );
}

export function MealGroundingStatus({ record }: { record: FoodRecord }) {
  if (isGrounded(record)) {
    return (
      <GroundedSourceNote
        label="Grounded against"
        linkTestId="meal-grounding-link"
        record={record}
        testId="meal-grounding-grounded"
      />
    );
  }

  let copy =
    "Vision-only. This estimate hasn’t been checked against an external nutrition source.";
  if (record.source === "user_corrected") {
    copy =
      "Your corrected estimate. It has not been checked against an external nutrition source.";
  } else if (record.identity_confirmed) {
    copy =
      "Confirmed, but no authoritative nutrition source matched this food.";
  }

  return (
    <div
      className="font_poppins font_body_4 rounded-panel border border-border-default bg-surface-primary px-3 py-2 text-foreground-secondary"
      data-testid="meal-grounding-vision-only"
      role="note"
    >
      {copy}
    </div>
  );
}
