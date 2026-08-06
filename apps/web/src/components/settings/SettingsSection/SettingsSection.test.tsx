import { createRef } from "react";
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

  it("exposes its heading for focus management", () => {
    const headingRef = createRef<HTMLHeadingElement>();
    render(
      <SettingsSection
        headingRef={headingRef}
        headingTabIndex={-1}
        title="Permissions"
      >
        Content
      </SettingsSection>,
    );

    headingRef.current?.focus();
    expect(headingRef.current).toHaveFocus();
    expect(headingRef.current).toHaveAttribute("tabindex", "-1");
  });
});
