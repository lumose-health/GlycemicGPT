import { Icon } from "@/base";
import { StatusBadge } from "@/components/StatusBadge";
import { getMealSourceLabel } from "@/lib/meal-source";
import type { FoodRecordSource } from "@/lib/api";

const SOURCE_VARIANTS = {
  ai_estimate: "warning",
  external_grounded: "neutral",
  user_corrected: "success",
} as const;

export function MealSourceBadge({
  source,
}: {
  source: FoodRecordSource | string;
}) {
  return (
    <StatusBadge
      data-testid="meal-source-badge"
      variant={
        SOURCE_VARIANTS[source as FoodRecordSource] ?? "neutral"
      }
    >
      {getMealSourceLabel(source)}
    </StatusBadge>
  );
}

export function MealIdentityConfirmedBadge() {
  return (
    <StatusBadge data-testid="meal-identity-confirmed" variant="success">
      <Icon className="mr-1 h-3 w-3" decorative icon="check" />
      Identity confirmed
    </StatusBadge>
  );
}
