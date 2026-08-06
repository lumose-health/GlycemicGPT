import type { FoodRecord } from "@/lib/api";

export interface MealEditorProps {
  onUpdated: (record: FoodRecord) => void;
  record: FoodRecord;
}
