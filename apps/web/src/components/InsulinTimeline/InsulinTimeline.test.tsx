import { fireEvent, render, screen } from "@testing-library/react";
import type { BolusReviewItem } from "@/lib/api";
import { InsulinTimeline, transformInsulinEvents } from "./InsulinTimeline";

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

describe("transformInsulinEvents", () => {
  function makeItem(overrides: Partial<BolusReviewItem> = {}): BolusReviewItem {
    return {
      event_timestamp: "2026-07-12T08:00:00.000Z",
      event_type: "bolus",
      units: 3,
      is_automated: false,
      control_iq_reason: null,
      pump_activity_mode: null,
      iob_at_event: null,
      bg_at_event: null,
      ...overrides,
    };
  }

  it("never narrows an unrecognized event_type to a known insulin-delivery kind (GLY-180)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const events = transformInsulinEvents([
      makeItem({ event_type: "carbs" }),
      makeItem({
        event_timestamp: "2026-07-12T09:00:00.000Z",
        units: 4,
      }),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({ units: 4, kind: "bolus" }));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("carbs"));

    warnSpy.mockRestore();
  });
});
