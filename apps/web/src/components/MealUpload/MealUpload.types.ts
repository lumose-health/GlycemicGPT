import type { FoodRecord } from "@/lib/api";

export interface MealUploadProps {
  onFeatureOff?: () => void;
  onUploaded: (record: FoodRecord) => void;
}
