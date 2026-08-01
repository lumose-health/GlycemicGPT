import { render, screen } from "@testing-library/react";
import { SettingsRow } from "./SettingsRow";

describe("SettingsRow", () => {
  it("associates the control with its label and description", () => {
    render(
      <SettingsRow
        control={<button type="button">Change</button>}
        description="Used throughout Lumose"
        label="Glucose unit"
        labelId="glucose-unit-label"
      />,
    );

    expect(screen.getByText("Glucose unit")).toHaveAttribute(
      "id",
      "glucose-unit-label",
    );
    expect(
      screen.getByText("Glucose unit").parentElement?.parentElement,
    ).toHaveClass("md:grid-cols-[minmax(0,1fr)_minmax(12rem,24rem)]");
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
  });

  it("supports a settings section heading label", () => {
    render(
      <SettingsRow
        control={<button type="button">Change</button>}
        label="Meal Intelligence"
        labelAs="h2"
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Meal Intelligence",
      }),
    ).toHaveClass("font_header_3");
  });
});
