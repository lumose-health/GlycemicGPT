import { render, screen } from "@testing-library/react";
import { SettingsSection } from "./SettingsSection";

describe("SettingsSection", () => {
  it("labels its region and supports a separated presentation", () => {
    render(
      <SettingsSection
        description="Settings description"
        descriptionClassName="custom-description"
        separated
        title="Preferences"
      >
        Content
      </SettingsSection>,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Preferences" }),
    ).toHaveClass("font_header_3");
    expect(screen.getByRole("region", { name: "Preferences" })).toHaveClass(
      "relative",
      "before:-top-6",
      "before:border-t",
      "before:border-border-default",
    );
    expect(screen.getByText("Settings description")).toHaveClass(
      "custom-description",
    );
  });
});
