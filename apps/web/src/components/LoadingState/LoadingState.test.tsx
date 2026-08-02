import { render, screen } from "@testing-library/react";
import { LoadingState } from "./LoadingState";

describe("LoadingState", () => {
  it("announces its loading label", () => {
    render(<LoadingState label="Loading meals..." />);

    expect(
      screen.getByRole("status", { name: "Loading meals..." }),
    ).toBeVisible();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText("Loading meals...")).toBeVisible();
  });
});
