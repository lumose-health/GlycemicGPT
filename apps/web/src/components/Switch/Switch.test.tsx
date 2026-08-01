import { fireEvent, render, screen } from "@testing-library/react";
import { Switch } from "./Switch";

describe("Switch", () => {
  it("uses native checkbox behavior with switch semantics", () => {
    const onCheckedChange = jest.fn();

    render(
      <Switch
        checked={false}
        label="Enable Meal Intelligence"
        onCheckedChange={onCheckedChange}
      />,
    );

    const control = screen.getByRole("switch", {
      name: "Enable Meal Intelligence",
    });
    fireEvent.click(control);

    expect(control).toHaveAttribute("type", "checkbox");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("centers the thumb evenly inside the bordered track", () => {
    render(<Switch checked label="Enabled setting" />);

    const control = screen.getByRole("switch", {
      name: "Enabled setting",
    });

    expect(control.nextElementSibling).toHaveClass(
      "after:left-px",
      "after:top-px",
      "after:h-5",
      "after:w-5",
      "peer-checked:after:translate-x-5",
    );
  });

  it("exposes disabled state", () => {
    render(<Switch disabled label="Unavailable setting" />);

    expect(
      screen.getByRole("switch", { name: "Unavailable setting" }),
    ).toBeDisabled();
  });
});
