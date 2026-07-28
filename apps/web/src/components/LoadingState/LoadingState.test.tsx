import { render, screen } from "@testing-library/react";
import { LoadingState } from "./LoadingState";

describe("LoadingState", () => {
  it("announces its loading label", () => {
    render(<LoadingState label="Loading meals..." />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading meals...");
  });
});
