import { render, screen } from "@testing-library/react";
import { SettingsReadOnlyValue } from "./SettingsReadOnlyValue";

describe("SettingsReadOnlyValue", () => {
  it("renders a valid description list value", () => {
    render(
      <dl>
        <SettingsReadOnlyValue
          label="Email"
          labelClassName="custom-label"
          value="user@example.com"
        />
      </dl>,
    );

    expect(screen.getByText("Email")).toHaveClass("custom-label");
    expect(screen.getByText("Email").tagName).toBe("DT");
    expect(screen.getByText("user@example.com").tagName).toBe("DD");
  });
});
