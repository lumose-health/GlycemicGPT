import { fireEvent, render, screen } from "@testing-library/react";
import { SettingsOfflineNotice } from "./SettingsOfflineNotice";

describe("SettingsOfflineNotice", () => {
  it("announces the offline state and exposes retry behavior", () => {
    const onRetry = jest.fn();

    render(<SettingsOfflineNotice onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Connection unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables the action while retrying", () => {
    render(<SettingsOfflineNotice isRetrying onRetry={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
  });
});
