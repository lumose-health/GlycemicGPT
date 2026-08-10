import { fireEvent, render, screen } from "@testing-library/react";
import type { CommonFood } from "@/lib/api";
import { CommonFoodCard } from "./CommonFoodCard";

const food = {
  carbs_high: 55,
  carbs_low: 40,
  id: "food-1",
  name: "Oatmeal",
  updated_at: "2026-01-01T00:00:00Z",
} as CommonFood;

describe("CommonFoodCard", () => {
  it("renders the baseline and opens its editor", () => {
    render(
      <CommonFoodCard
        food={food}
        onDeleted={jest.fn()}
        onEdited={jest.fn()}
      />,
    );

    expect(screen.getByText("Oatmeal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Oatmeal" }));
    expect(screen.getByTestId("common-food-editor")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Oatmeal");
  });
});
