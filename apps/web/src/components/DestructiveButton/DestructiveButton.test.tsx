import { fireEvent, render, screen } from "@testing-library/react";
import { DestructiveButton } from "./DestructiveButton";

describe("DestructiveButton", () => {
  it("emits clicks and uses the semantic error treatment", () => {
    const onClick = jest.fn();
    render(
      <DestructiveButton onClick={onClick}>Delete</DestructiveButton>,
    );

    const button = screen.getByRole("button", { name: "Delete" });
    expect(button).toHaveClass(
      "border-signal-error-text",
      "text-signal-error-text",
    );
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
