import { fireEvent, render, screen } from "@testing-library/react";
import type { FoodRecord } from "@/lib/api";
import {
  MealCorrectionSection,
  MealIdentitySection,
} from "./MealEditor";

const record = {
  carbs_high: 55,
  carbs_low: 40,
  confirmed_food_name: null,
  food_description: "Oatmeal",
  id: "meal-1",
  identity_confirmed: false,
  safety_qualifier: "Never dose from this estimate.",
  suggested_identity: null,
} as FoodRecord;

describe("MealEditor", () => {
  it("opens the carb correction form with the current range", () => {
    render(
      <MealCorrectionSection onUpdated={jest.fn()} record={record} />,
    );

    fireEvent.click(screen.getByTestId("meal-correct-button"));
    expect(screen.getByTestId("meal-correct-low")).toHaveValue(40);
    expect(screen.getByTestId("meal-correct-high")).toHaveValue(55);
    expect(screen.getByText(/never fed to IoB/i)).toBeInTheDocument();
  });

  it("offers distinct identity confirmation and correction actions", () => {
    render(<MealIdentitySection onUpdated={jest.fn()} record={record} />);

    expect(screen.getByTestId("meal-identity-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("meal-identity-correct")).toBeInTheDocument();
  });
});
