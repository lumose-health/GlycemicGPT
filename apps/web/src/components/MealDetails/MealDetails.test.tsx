import { render, screen } from "@testing-library/react";
import {
  MealErrorPanel,
  MealIdentityConfirmedBadge,
  MealSafetyQualifier,
  MealSourceBadge,
} from "./index";

describe("meal detail presentation", () => {
  it("renders semantic source and identity badges", () => {
    render(
      <>
        <MealSourceBadge source="user_corrected" />
        <MealIdentityConfirmedBadge />
      </>,
    );

    expect(screen.getByText("You corrected this")).toBeInTheDocument();
    expect(screen.getByText("Identity confirmed")).toBeInTheDocument();
  });

  it("keeps the safety qualifier visible as a named note", () => {
    render(<MealSafetyQualifier qualifier="Never use this to dose." />);

    expect(screen.getByRole("note")).toHaveTextContent(
      "Safety note Never use this to dose.",
    );
  });

  it("links provider setup failures to the canonical settings page", () => {
    render(
      <MealErrorPanel
        info={{
          kind: "no_provider",
          message: "Configure a provider.",
          retryable: false,
          settingsHref: "/settings/ai",
          title: "No provider",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute(
      "href",
      "/settings/ai",
    );
  });
});
