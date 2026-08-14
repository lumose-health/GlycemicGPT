import { fireEvent, render, screen } from "@testing-library/react";
import type { FoodRecord } from "@/lib/api";
import { MealAuditPanel } from "./MealAuditPanel";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFoodRecordAudit: jest.fn(() => new Promise(() => {})),
}));

const record = {
  corrected_at: null,
  id: "meal-1",
  identity_confirmed: false,
  safety_qualifier: "Never dose from this estimate.",
  source: "ai_estimate",
} as FoodRecord;

describe("MealAuditPanel", () => {
  it("renders the safety qualifier and lazily requests details", () => {
    render(<MealAuditPanel record={record} />);

    expect(screen.getByTestId("meal-audit-safety-qualifier")).toHaveTextContent(
      "Never dose",
    );
    fireEvent.click(screen.getByTestId("meal-audit-toggle"));
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
