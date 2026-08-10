import { render, screen } from "@testing-library/react";
import { ContentPage } from "./ContentPage";

describe("ContentPage", () => {
  it("renders page content inside the shared width boundary", () => {
    render(<ContentPage data-testid="page">Content</ContentPage>);

    expect(screen.getByTestId("page")).toHaveClass("max-w-5xl");
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("merges custom classes", () => {
    render(<ContentPage className="max-w-3xl" data-testid="page" />);

    expect(screen.getByTestId("page")).toHaveClass("max-w-3xl");
    expect(screen.getByTestId("page")).not.toHaveClass("max-w-5xl");
  });
});
