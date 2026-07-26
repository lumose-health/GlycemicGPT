import { render, screen } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("provides the shared settings page width and spacing", () => {
    render(<SettingsPage data-testid="settings-page">Content</SettingsPage>);

    expect(screen.getByTestId("settings-page")).toHaveClass(
      "mx-auto",
      "w-full",
      "max-w-5xl",
      "pt-8",
    );
  });
});
