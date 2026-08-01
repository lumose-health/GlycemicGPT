import { fireEvent, render, screen } from "@testing-library/react";
import { SettingsTabs } from "./SettingsTabs";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const items = [
  {
    href: "/settings/connections?tab=cgm",
    icon: "cgm",
    label: "CGM integrations",
    value: "cgm",
  },
  {
    href: "/settings/connections?tab=insulin-pumps",
    icon: "insulin-pump",
    label: "Insulin pumps",
    value: "insulin-pumps",
  },
  {
    href: "/settings/connections?tab=third-party",
    icon: "link",
    label: "Third party integrations",
    value: "third-party",
  },
] as const;

describe("SettingsTabs", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders linkable tabs with the selected tab exposed", () => {
    render(
      <SettingsTabs
        aria-label="Connection types"
        idPrefix="connections"
        items={[...items]}
        value="insulin-pumps"
      />,
    );

    expect(screen.getByRole("tab", { name: "Insulin pumps" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("tab", { name: "Third party integrations" }),
    ).toHaveAttribute("href", "/settings/connections?tab=third-party");

    const selectedIcon = screen
      .getByRole("tab", { name: "Insulin pumps" })
      .querySelector("svg");

    expect(selectedIcon).toHaveAttribute("aria-hidden", "true");
    expect(selectedIcon?.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#insulin-pump",
    );
  });

  it("updates the URL when navigating with arrow keys", () => {
    render(
      <SettingsTabs
        aria-label="Connection types"
        idPrefix="connections"
        items={[...items]}
        value="cgm"
      />,
    );

    fireEvent.keyDown(screen.getByRole("tab", { name: "CGM integrations" }), {
      key: "ArrowRight",
    });

    expect(mockPush).toHaveBeenCalledWith(
      "/settings/connections?tab=insulin-pumps",
    );
  });
});
