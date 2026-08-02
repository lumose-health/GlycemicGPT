import Link from "next/link";
import { Icon } from "@/base";
import { AnimatedCard } from "@/components/AnimatedCard";
import {
  MealIdentityConfirmedBadge,
  MealSafetyQualifier,
  MealSourceBadge,
} from "@/components/MealDetails";
import { MealPhoto } from "@/components/MealPhoto";
import {
  confidenceLabel,
  effectiveCarbRange,
  formatCarbRange,
  mealTitle,
} from "@/lib/meal-display";
import type { MealCardProps } from "./MealCard.types";

export function MealCard({ delay = 0, record }: MealCardProps) {
  const range = effectiveCarbRange(record);

  return (
    <AnimatedCard delay={delay}>
      <Link
        className="flex gap-4 rounded-panel border border-border-default bg-surface-elevated p-4 transition-colors hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active"
        data-testid="meal-card"
        href={`/dashboard/meals/${record.id}`}
      >
        <MealPhoto recordId={record.id} size="sm" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font_poppins font_header_4 truncate text-foreground-primary">
                {mealTitle(record)}
              </h2>
              <time className="font_metric_caption text-foreground-primary">
                {new Date(record.meal_timestamp).toLocaleString()}
              </time>
            </div>
            <Icon
              className="h-4 w-4 shrink-0 rotate-90 text-foreground-primary"
              decorative
              icon="chevron"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className="font_metric_label text-foreground-primary"
              data-testid="meal-carb-range"
            >
              {formatCarbRange(range.low, range.high)}
            </span>
            <span className="font_metric_caption text-foreground-primary">
              {confidenceLabel(record.confidence)}
            </span>
            <MealSourceBadge source={record.source} />
            {record.identity_confirmed ? (
              <MealIdentityConfirmedBadge />
            ) : null}
          </div>

          <MealSafetyQualifier qualifier={record.safety_qualifier} />
        </div>
      </Link>
    </AnimatedCard>
  );
}
