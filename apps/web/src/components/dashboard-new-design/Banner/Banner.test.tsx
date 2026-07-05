import { render, screen } from "@testing-library/react";
import { Banner } from "./Banner";

describe("Banner", () => {
  it("renders the default medical disclaimer", () => {
    render(<Banner />);

    expect(screen.getByText("Not medical advice")).toBeInTheDocument();
    expect(screen.getByText("Not medical advice")).toHaveClass("h-8");
    expect(screen.getByText("Not medical advice")).toHaveClass(
      "bg-surface-fixed-dark",
    );
    expect(screen.getByText("Not medical advice")).toHaveClass(
      "text-foreground-fixed-light",
    );
  });

  it("renders a custom message", () => {
    render(<Banner message="Review with your clinician" />);

    expect(screen.getByText("Review with your clinician")).toBeInTheDocument();
  });

  it("merges custom class names", () => {
    render(<Banner className="mt-2" />);

    expect(screen.getByText("Not medical advice")).toHaveClass("mt-2");
  });
});
