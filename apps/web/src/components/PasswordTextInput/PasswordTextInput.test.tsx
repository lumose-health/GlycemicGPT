import { fireEvent, render, screen } from "@testing-library/react";
import { PasswordTextInput } from "./PasswordTextInput";

describe("PasswordTextInput", () => {
  it("uses the shared TextInput and toggles password visibility", () => {
    render(
      <PasswordTextInput
        errorMessages={["Password is required."]}
        id="connection-password"
        label="Connection password"
        onChange={() => undefined}
        value=""
      />,
    );

    const input = screen.getByLabelText("Connection password");

    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveClass("font_ui_input", "bg-surface-primary", "pr-12");
    expect(screen.getByText("Password is required.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect(input).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "Hide password" })
        .querySelector("use"),
    ).toHaveAttribute("href", "/static_assets/iconSprite.svg#eye-slash");
  });
});
