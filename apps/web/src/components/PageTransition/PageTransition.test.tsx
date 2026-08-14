import { render, screen } from "@testing-library/react";
import { PageTransition } from "./PageTransition";

describe("PageTransition", () => {
  it("renders children and skips the fade for reduced motion", () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });

    render(
      <PageTransition className="page-content">
        <main>Dashboard</main>
      </PageTransition>,
    );

    const wrapper = screen.getByRole("main").parentElement;
    expect(wrapper).toHaveClass("page-content");
    expect(wrapper).toHaveStyle({ opacity: "1" });
  });
});
