import { fireEvent, render, screen } from "@testing-library/react";
import { TextInput } from "./TextInput";

describe("TextInput", () => {
  it("renders an accessible label and placeholder", () => {
    render(
      <TextInput
        label="Glucose target"
        onChange={jest.fn()}
        placeholder="112 mg/dL"
      />,
    );

    const input = screen.getByRole("textbox", { name: "Glucose target" });

    expect(input).toHaveAttribute("placeholder", "112 mg/dL");
    expect(input).toHaveClass("bg-surface-primary");
    expect(input).toHaveClass("font_ui_input");
    expect(input).toHaveClass("placeholder:text-foreground-primary/60");
    expect(input).toHaveClass("rounded-panel");
  });

  it("connects error text to the input", () => {
    render(
      <TextInput
        errorMessage="Enter a value between 70 and 180 mg/dL."
        id="glucose-target"
        label="Glucose target"
      />,
    );

    const input = screen.getByRole("textbox", { name: "Glucose target" });
    const error = screen.getByText("Enter a value between 70 and 180 mg/dL.");
    const errorList = error.closest("ul");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "glucose-target-error");
    expect(errorList).toHaveAttribute("id", "glucose-target-error");
    expect(errorList).toHaveClass("text-signal-error-text");
    expect(errorList).toHaveAttribute("role", "alert");
    expect(errorList).toHaveAttribute("aria-live", "polite");
  });

  it("preserves described by references and forwards change handlers", () => {
    const onChange = jest.fn();

    render(
      <>
        <p id="glucose-help">Use your configured target range.</p>
        <TextInput
          aria-describedby="glucose-help"
          id="glucose-target"
          label="Glucose target"
          onChange={onChange}
        />
      </>,
    );

    const input = screen.getByRole("textbox", { name: "Glucose target" });
    fireEvent.change(input, { target: { value: "120" } });

    expect(input).toHaveAttribute("aria-describedby", "glucose-help");
    expect(onChange).toHaveBeenCalled();
  });

  it("connects helper and error text without dropping existing descriptions", () => {
    render(
      <TextInput
        aria-describedby="external-help"
        errorMessage="Name is too long"
        helperText="Maximum 100 characters"
        id="display-name"
        label="Display name"
      />,
    );

    expect(screen.getByLabelText("Display name")).toHaveAttribute(
      "aria-describedby",
      "external-help display-name-helper display-name-error",
    );
  });

  it("renders multiple errors as one accessible vertical list", () => {
    render(
      <TextInput
        errorMessages={[
          "Display name must be at least 2 characters.",
          "Use only letters, numbers, spaces, and hyphens.",
        ]}
        id="display-name"
        label="Display name"
      />,
    );

    const input = screen.getByLabelText("Display name");
    const errorList = screen.getByRole("alert");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "display-name-error");
    expect(errorList).toHaveAttribute("id", "display-name-error");
    expect(errorList).toHaveClass(
      "gap-1",
      "transition-[gap,padding]",
      "duration-300",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("supports reusable leading and trailing adornments", () => {
    render(
      <TextInput
        label="API token"
        leadingAdornment={<span data-testid="leading">Key</span>}
        trailingAdornment={<button type="button">Show</button>}
      />,
    );

    expect(screen.getByLabelText("API token")).toHaveClass("pl-10", "pr-10");
    expect(screen.getByTestId("leading")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show" })).toBeInTheDocument();
  });
});
