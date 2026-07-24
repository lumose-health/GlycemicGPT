import { fireEvent, render, screen } from "@testing-library/react";
import { FeedbackMessage } from "./FeedbackMessage";

describe("FeedbackMessage", () => {
  it("renders success feedback as a polite status", () => {
    render(
      <FeedbackMessage
        message="Display name updated"
        title="Saved"
        variant="success"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "SavedDisplay name updated",
    );
  });

  it("renders offline feedback as an alert with a retry action", () => {
    const onAction = jest.fn();
    render(
      <FeedbackMessage
        actionLabel="Retry connection"
        message="Profile management is unavailable."
        onAction={onAction}
        variant="offline"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));

    expect(screen.getByRole("alert")).toHaveClass(
      "border-signal-warning-text",
    );
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
