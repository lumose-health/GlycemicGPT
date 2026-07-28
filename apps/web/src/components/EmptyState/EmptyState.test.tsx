import { render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders an accessible heading, description, and action", () => {
    render(
      <EmptyState
        action={<a href="/settings">Open settings</a>}
        description="Configure this feature to continue."
        icon="gear"
        title="Setup required"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Setup required" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Configure this feature to continue."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});
