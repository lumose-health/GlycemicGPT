import type { FoodRecord } from "@/lib/api";

export interface MealCommonFoodSectionProps {
  onUpdated: (record: FoodRecord) => void;
  record: FoodRecord;
}
