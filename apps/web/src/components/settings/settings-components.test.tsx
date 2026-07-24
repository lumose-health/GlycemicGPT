import { render, screen } from "@testing-library/react";
import {
  SettingsEmbeddedContent,
  SettingsPage,
  SettingsPageHeader,
  SettingsReadOnlyValue,
  SettingsRow,
  SettingsSection,
} from ".";

describe("settings components", () => {
  it("provides the shared page width, header, section, row, and read only structure", () => {
    render(
      <SettingsPage data-testid="settings-page">
        <SettingsPageHeader
          description="Manage your account"
          title="Profile"
        />
        <SettingsSection
          description="Settings description"
          descriptionClassName="custom-description"
          separated
          title="Preferences"
        >
          <SettingsRow
            control={<button type="button">Change</button>}
            description="Used throughout Lumose"
            label="Glucose unit"
          />
          <dl>
            <SettingsReadOnlyValue
              label="Email"
              labelClassName="text-foreground-primary"
              value="user@example.com"
            />
          </dl>
        </SettingsSection>
      </SettingsPage>,
    );

    expect(screen.getByTestId("settings-page")).toHaveClass(
      "mx-auto",
      "w-full",
      "max-w-5xl",
      "pt-8",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Profile" }),
    ).toHaveClass("font_header_1");
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
    expect(screen.getByText("Glucose unit").parentElement?.parentElement).toHaveClass(
      "md:grid-cols-[minmax(0,1fr)_minmax(12rem,24rem)]",
    );
    expect(screen.getByText("Email")).toHaveClass("text-foreground-primary");
    expect(screen.getByText("Email").tagName).toBe("DT");
    expect(screen.getByText("user@example.com").tagName).toBe("DD");
  });

  it("renders an optional decorative header icon in the theme accent", () => {
    render(
      <SettingsPageHeader
        description="Manage your account"
        icon="person"
        title="Account"
      />,
    );

    const header = screen.getByRole("heading", { name: "Account" }).closest("header");
    const icon = header
      ?.querySelector('use[href="/static_assets/iconSprite.svg#person"]')
      ?.closest("svg");

    expect(header).toHaveClass("flex", "items-start", "gap-4");
    expect(icon).toHaveClass("h-20", "w-20", "text-accent");
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("provides a semantic wrapper for embedded legacy settings content", () => {
    render(
      <SettingsEmbeddedContent data-testid="embedded-settings">
        <div data-settings-back-link>Back</div>
        <div data-settings-page-header>Legacy header</div>
        <p>Settings content</p>
      </SettingsEmbeddedContent>,
    );

    expect(screen.getByTestId("embedded-settings")).toHaveClass(
      "text-foreground-primary",
      "[&_[data-settings-back-link]]:hidden",
      "[&_[data-settings-page-header]]:hidden",
    );
    expect(screen.getByText("Settings content")).toBeInTheDocument();
  });
});
