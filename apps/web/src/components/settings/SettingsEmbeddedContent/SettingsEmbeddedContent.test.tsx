import { render, screen } from "@testing-library/react";
import { SettingsEmbeddedContent } from "./SettingsEmbeddedContent";

describe("SettingsEmbeddedContent", () => {
  it("provides a semantic wrapper for embedded settings content", () => {
    render(
      <SettingsEmbeddedContent data-testid="embedded-settings">
        <div data-settings-back-link>Back</div>
        <div data-settings-page-header>Legacy header</div>
        <p>Settings content</p>
      </SettingsEmbeddedContent>,
    );

    expect(screen.getByTestId("embedded-settings")).toHaveClass(
      "font_poppins",
      "text-foreground-primary",
      "[&_[data-settings-back-link]]:hidden",
      "[&_[data-settings-page-header]]:hidden",
    );
    expect(screen.getByText("Settings content")).toBeInTheDocument();
  });
});
