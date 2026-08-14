import { fireEvent, render, screen } from "@testing-library/react";
import {
  InsulinDoseTimeline,
  InsulinOnBoardTimeline,
  PumpActivityModeTimeline,
  PumpBasalRateTimeline,
} from "./ExpandedInsulinTimeline";

jest.mock("uplot", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const sharedProps = {
  cursorSyncKey: "test",
  multiDay: false,
  onHoverChange: jest.fn(),
  onZoomChange: jest.fn(),
  showXAxis: false,
  xDomain: [0, 3_600_000] as [number, number],
};

describe("expanded insulin timelines", () => {
  it("renders accessible regions for each timeline", () => {
    render(
      <>
        <InsulinDoseTimeline
          {...sharedProps}
          error={null}
          isLoading={false}
          longActingBasalInjections={[]}
          onRetry={jest.fn()}
          rapidDoses={[]}
        />
        <InsulinOnBoardTimeline {...sharedProps} samples={[]} />
        <PumpBasalRateTimeline
          {...sharedProps}
          error={null}
          isLoading={false}
          isPossiblyTruncated={false}
          onRetry={jest.fn()}
          segments={[]}
        />
        <PumpActivityModeTimeline
          {...sharedProps}
          intervals={[]}
          suspensionIntervals={[]}
        />
      </>,
    );

    expect(
      screen.getByRole("region", { name: "Insulin doses" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Insulin on board" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Pump basal rate" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Pump activity mode" }),
    ).toBeInTheDocument();
  });

  it("emits retry from a failed dose timeline", () => {
    const onRetry = jest.fn();
    render(
      <InsulinDoseTimeline
        {...sharedProps}
        error="offline"
        isLoading={false}
        longActingBasalInjections={[]}
        onRetry={onRetry}
        rapidDoses={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
