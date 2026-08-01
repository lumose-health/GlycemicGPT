import { fireEvent, render, screen } from "@testing-library/react";
import { TimeRangeQuickSelect } from "./TimeRangeQuickSelect";

const options = [
  { accessibleLabel: "Last 7 days", label: "7d", value: "7d" },
  { accessibleLabel: "Last 14 days", label: "14d", value: "14d" },
  { accessibleLabel: "Last 30 days", label: "30d", value: "30d" },
] as const;

describe("TimeRangeQuickSelect", () => {
  it("marks the active option and emits a new range", () => {
    const onChange = jest.fn();

    render(
      <TimeRangeQuickSelect
        className="grid-cols-3"
        onChange={onChange}
        options={options}
        value="14d"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Last 14 days" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));

    expect(onChange).toHaveBeenCalledWith("7d");
  });

  it("disables every option", () => {
    render(
      <TimeRangeQuickSelect
        disabled
        onChange={jest.fn()}
        options={options}
      />,
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
