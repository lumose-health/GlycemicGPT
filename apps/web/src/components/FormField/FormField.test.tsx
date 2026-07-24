import { render, screen } from "@testing-library/react";
import { FormField } from "./FormField";

describe("FormField", () => {
  it("renders a visible label, helper text, optional text, and error", () => {
    render(
      <FormField
        errorMessage="Enter a valid name"
        helperText="Shown on your account"
        inputId="display-name"
        label="Display name"
        optionalText="Optional"
      >
        <input id="display-name" />
      </FormField>,
    );

    expect(screen.getByLabelText("Display name Optional")).toBeInTheDocument();
    expect(screen.getByText("Shown on your account")).toHaveAttribute(
      "id",
      "display-name-helper",
    );
    expect(screen.getByText("Enter a valid name")).toHaveAttribute(
      "id",
      "display-name-error",
    );
  });
});
