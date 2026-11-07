import { render, screen } from "@testing-library/react";

import { NumericRow as RedesignedNumericRow } from "@/components/integrations/NightscoutOnboarding/NightscoutOnboarding";
import { NumericRow as LegacyNumericRow } from "@/components/integrations/nightscout-onboarding-wizard";

const REASON = "Nightscout DIA 10 h is outside the 2-8 h range";
const baseProps = {
  label: "DIA",
  unitsHint: "hours",
  checked: false,
  onToggle: jest.fn(),
  current: 4,
  proposed: 10,
  reason: REASON,
  override: "",
  onOverrideChange: jest.fn(),
  field: "dia_hours",
};

describe.each([
  ["legacy", LegacyNumericRow],
  ["redesigned", RedesignedNumericRow],
])("%s Nightscout onboarding", (_name, NumericRow) => {
  it("shows why an out-of-range DIA is not selected", () => {
    render(<NumericRow {...baseProps} />);

    expect(screen.getByTestId("wizard-reason-dia_hours")).toHaveTextContent(
      REASON,
    );
    expect(screen.getByTestId("wizard-import-dia_hours")).not.toBeChecked();
    expect(screen.getByTestId("wizard-import-dia_hours")).toBeDisabled();
    expect(screen.getByTestId("wizard-override-dia_hours")).toBeEnabled();
    expect(screen.getByTestId("wizard-override-dia_hours")).toHaveAttribute(
      "placeholder",
      "Enter 2–8",
    );
  });

  it("enables DIA import only after a replacement is entered", () => {
    const { rerender } = render(<NumericRow {...baseProps} />);

    rerender(<NumericRow {...baseProps} override="6" />);

    expect(screen.getByTestId("wizard-import-dia_hours")).toBeEnabled();
  });

  it("rejects a DIA override outside 2-8 hours", () => {
    render(<NumericRow {...baseProps} checked override="10" />);

    expect(
      screen.getByText("DIA must be between 2 and 8 hours."),
    ).toBeInTheDocument();
  });
});
