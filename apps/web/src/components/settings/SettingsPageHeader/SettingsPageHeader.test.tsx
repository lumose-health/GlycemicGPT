import { render, screen } from "@testing-library/react";
import { SettingsPageHeader } from "./SettingsPageHeader";

describe("SettingsPageHeader", () => {
  it("renders a page heading and optional decorative icon", () => {
    render(
      <SettingsPageHeader
        description="Manage your account"
        icon="person"
        title="Account"
      />,
    );

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Account",
    });
    const header = heading.closest("header");
    const icon = header
      ?.querySelector('use[href="/static_assets/iconSprite.svg#person"]')
      ?.closest("svg");

    expect(heading).toHaveClass("font_header_1");
    expect(header).toHaveClass("flex", "items-start", "gap-4");
    expect(icon).toHaveClass("h-20", "w-20", "text-accent");
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });
});
