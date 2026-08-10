import { render, screen } from "@testing-library/react";
import type { FoodRecord } from "@/lib/api";
import { MealCard } from "./MealCard";

jest.mock("@/components/MealPhoto", () => ({
  MealPhoto: () => <div data-testid="photo" />,
}));

const record = {
  carbs_high: 55,
  carbs_low: 40,
  confidence: "medium",
  corrected_carbs_high: null,
  corrected_carbs_low: null,
  food_description: "Oatmeal",
  id: "meal-1",
  identity_confirmed: false,
  meal_timestamp: "2026-01-01T08:00:00Z",
  safety_qualifier: "Never dose from this estimate.",
  source: "ai_estimate",
} as FoodRecord;

describe("MealCard", () => {
  it("links to the meal and renders its descriptive safety data", () => {
    render(<MealCard record={record} />);

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/dashboard/meals/meal-1",
    );
    expect(screen.getByRole("heading", { name: "Oatmeal" })).toBeInTheDocument();
    expect(screen.getByTestId("meal-carb-range")).toHaveTextContent("g carbs");
    expect(screen.getByTestId("meal-safety-qualifier")).toHaveTextContent(
      "Never dose",
    );
  });
});
