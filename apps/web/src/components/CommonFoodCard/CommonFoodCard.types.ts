import type { CommonFood } from "@/lib/api";

export interface CommonFoodCardProps {
  delay?: number;
  food: CommonFood;
  onDeleted: () => void;
  onEdited: () => void;
}
