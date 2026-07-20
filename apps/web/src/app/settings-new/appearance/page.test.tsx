import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/providers";
import AppearancePage from "./page";

beforeEach(() => {
  window.localStorage.clear();
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
});

describe("AppearancePage", () => {
  it("renders the theme configuration", () => {
    render(
      <ThemeProvider>
        <AppearancePage />
      </ThemeProvider>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Appearance" }),
    ).toHaveClass("font_poppins", "font_header_1");
    const themeHeading = screen.getByRole("heading", {
      level: 2,
      name: "Theme",
    });

    expect(themeHeading).toHaveClass("font_poppins", "font_header_3");
    expect(themeHeading.closest("section")).not.toHaveClass(
      "rounded-panel",
      "border",
      "bg-surface-elevated",
    );
    expect(
      screen.getByRole("radiogroup", { name: "Theme selection" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect(
      screen.getByRole("heading", { level: 3, name: "Additional themes" }),
    ).toBeInTheDocument();
  });
});
