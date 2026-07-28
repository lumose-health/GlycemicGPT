import { fireEvent, render, screen } from "@testing-library/react";
import type { FoodRecord } from "@/lib/api";
import { MealCommonFoodSection } from "./MealCommonFoodSection";

const record = {
  carbs_high: 55,
  carbs_low: 40,
  common_food_id: null,
  food_description: "Oatmeal",
  id: "meal-1",
} as FoodRecord;

describe("MealCommonFoodSection", () => {
  it("opens the save form with the current meal name", () => {
    render(
      <MealCommonFoodSection onUpdated={jest.fn()} record={record} />,
    );

    fireEvent.click(screen.getByTestId("meal-save-as-common-food"));
    expect(screen.getByTestId("meal-save-as-name")).toHaveValue("Oatmeal");
    expect(screen.getByTestId("meal-common-food-note")).toBeInTheDocument();
  });
});
