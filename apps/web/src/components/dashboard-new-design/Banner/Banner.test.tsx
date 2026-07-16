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

  it("renders the mock data theme", () => {
    render(<Banner theme="mock" />);

    const banner = screen.getByText(
      "Mock data is active. All data shown is generated and is not your own.",
    );

    expect(banner).toHaveClass("bg-surface-fixed-critical");
    expect(banner).toHaveClass("text-foreground-fixed-light");
    expect(banner).toHaveClass("h-auto");
    expect(banner).not.toHaveClass("bg-surface-fixed-dark");
  });

  it("merges custom class names", () => {
    render(<Banner className="mt-2" />);

    expect(screen.getByText("Not medical advice")).toHaveClass("mt-2");
  });
});
