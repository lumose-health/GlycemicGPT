import type { FoodRecordSource } from "@/lib/api";

const SOURCE_LABELS: Record<FoodRecordSource, string> = {
  ai_estimate: "AI estimate",
  external_grounded: "Grounded",
  user_corrected: "You corrected this",
};

export function getMealSourceLabel(source: FoodRecordSource | string): string {
  return SOURCE_LABELS[source as FoodRecordSource] ?? String(source);
}
