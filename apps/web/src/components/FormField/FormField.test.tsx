import { act, fireEvent, render, screen } from "@testing-library/react";
import { FormField } from "./FormField";

describe("FormField", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

    expect(
      screen.getByLabelText("Display name (Optional)"),
    ).toBeInTheDocument();
    expect(screen.getByText("(Optional)")).toHaveClass(
      "font_body_4",
      "text-foreground-secondary",
    );
    expect(screen.getByText("Shown on your account")).toHaveAttribute(
      "id",
      "display-name-helper",
    );
    const error = screen.getByText("Enter a valid name");
    const errorList = error.closest("ul");

    expect(errorList).toHaveAttribute(
      "id",
      "display-name-error",
    );
    expect(errorList?.parentElement).toHaveClass("pt-1.5");
    expect(errorList?.parentElement?.parentElement).toHaveClass(
      "min-h-0",
      "overflow-visible",
    );
    expect(
      errorList?.parentElement?.parentElement?.parentElement,
    ).toHaveClass(
      "-mt-1.5",
      "duration-300",
      "ease-in-out",
      "transition-[grid-template-rows,opacity,translate]",
    );
  });

  it("animates an error added while another error is already visible", () => {
    const animationFrames: FrameRequestCallback[] = [];
    jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation();

    const { rerender } = render(
      <FormField
        errorMessages={["First error"]}
        inputId="display-name"
        label="Display name"
      >
        <input id="display-name" />
      </FormField>,
    );

    act(() => {
      animationFrames.shift()?.(0);
    });

    rerender(
      <FormField
        errorMessages={["First error", "Second error"]}
        inputId="display-name"
        label="Display name"
      >
        <input id="display-name" />
      </FormField>,
    );

    const secondErrorTransition =
      screen.getByText("Second error").closest("li")?.firstElementChild;

    expect(secondErrorTransition).toHaveClass(
      "grid-rows-[0fr]",
      "-translate-y-2",
      "opacity-0",
      "transition-[grid-template-rows,opacity,translate]",
    );

    act(() => {
      animationFrames.shift()?.(0);
    });

    expect(secondErrorTransition).toHaveClass(
      "grid-rows-[1fr]",
      "translate-y-0",
      "opacity-100",
    );
  });

  it("keeps a removed error mounted until its exit transition completes", () => {
    const animationFrames: FrameRequestCallback[] = [];
    jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation();

    const { rerender } = render(
      <FormField
        errorMessages={["First error", "Second error"]}
        inputId="display-name"
        label="Display name"
      >
        <input id="display-name" />
      </FormField>,
    );

    act(() => {
      while (animationFrames.length > 0) {
        animationFrames.shift()?.(0);
      }
    });

    rerender(
      <FormField
        errorMessages={["First error"]}
        inputId="display-name"
        label="Display name"
      >
        <input id="display-name" />
      </FormField>,
    );

    const removedError = screen.getByText("Second error");
    const removedErrorItem = removedError.closest("li");
    const removedErrorTransition = removedErrorItem?.firstElementChild;
    const errorList = screen.getByRole("alert");

    expect(removedErrorItem).toHaveAttribute("aria-hidden", "true");
    expect(errorList).toHaveClass(
      "gap-0",
      "transition-[gap,padding]",
      "duration-300",
    );
    expect(removedErrorTransition).toHaveClass(
      "grid-rows-[0fr]",
      "-translate-y-2",
      "opacity-0",
    );

    const transitionEnd = new Event("transitionend", { bubbles: true });
    Object.defineProperty(transitionEnd, "propertyName", {
      value: "grid-template-rows",
    });
    fireEvent(removedErrorTransition!, transitionEnd);

    expect(screen.queryByText("Second error")).not.toBeInTheDocument();
  });
});
