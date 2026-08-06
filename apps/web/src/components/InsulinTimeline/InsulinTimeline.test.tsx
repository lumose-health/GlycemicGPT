import { fireEvent, render, screen } from "@testing-library/react";
import { InsulinTimeline } from "./InsulinTimeline";

jest.mock("uplot", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const baseProps = {
  cursorSyncKey: "test",
  data: [],
  error: null,
  isLoading: false,
  multiDay: false,
  onHoverChange: jest.fn(),
  onRetry: jest.fn(),
  xDomain: [0, 3_600_000] as [number, number],
};

describe("InsulinTimeline", () => {
  it("describes an empty dose range", () => {
    render(<InsulinTimeline {...baseProps} />);

    expect(
      screen.getByRole("img", {
        name: "Insulin timeline with no recorded doses in this time range",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No insulin doses in this time range"),
    ).toBeInTheDocument();
  });

  it("renders a retry action for failures", () => {
    const onRetry = jest.fn();
    render(
      <InsulinTimeline {...baseProps} error="offline" onRetry={onRetry} />,
    );

    expect(screen.getByText("Unable to load insulin doses")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
