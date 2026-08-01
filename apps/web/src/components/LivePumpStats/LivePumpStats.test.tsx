import { render, screen } from "@testing-library/react";
import { LivePumpStats } from "@/components/LivePumpStats";

describe("LivePumpStats", () => {
  it("renders pump values as horizontal label and value rows with separators", () => {
    render(
      <LivePumpStats
        iob={1.234}
        basalRate={0.8}
        batteryPct={74.6}
        reservoirUnits={119.8}
      />,
    );

    const rows = screen.getAllByTestId("live-pump-stats-row");

    expect(screen.getByTestId("live-pump-stats")).toHaveClass(
      "divide-y",
      "divide-border-default",
    );
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveClass("flex", "items-center", "justify-between");
    expect(screen.getByText("IOB:")).toBeInTheDocument();
    expect(screen.getByTestId("live-pump-iob-value")).toHaveTextContent("1.23u");
    expect(screen.getByTestId("live-pump-basal-value")).toHaveTextContent(
      "0.80 u/hr",
    );
    expect(screen.getByTestId("live-pump-battery-value")).toHaveTextContent(
      "75%",
    );
    expect(screen.getByTestId("live-pump-reservoir-value")).toHaveTextContent(
      "120u",
    );
  });

  it("shows unavailable values and adds COB only when available", () => {
    const { rerender } = render(
      <LivePumpStats
        iob={null}
        basalRate={Number.NaN}
        batteryPct={null}
        reservoirUnits={-1}
      />,
    );

    expect(screen.getByTestId("live-pump-iob-value")).toHaveTextContent("--");
    expect(screen.getByTestId("live-pump-basal-value")).toHaveTextContent("--");
    expect(screen.getByTestId("live-pump-battery-value")).toHaveTextContent("--");
    expect(screen.getByTestId("live-pump-reservoir-value")).toHaveTextContent(
      "--",
    );
    expect(screen.queryByTestId("live-pump-cob-value")).not.toBeInTheDocument();

    rerender(
      <LivePumpStats
        iob={null}
        basalRate={null}
        batteryPct={null}
        reservoirUnits={null}
        cobGrams={24.4}
      />,
    );

    expect(screen.getByText("COB:")).toBeInTheDocument();
    expect(screen.getByTestId("live-pump-cob-value")).toHaveTextContent("24g");
  });

  it("shows the insulin automation state with its source", () => {
    render(
      <LivePumpStats
        iob={1.2}
        basalRate={0.8}
        batteryPct={75}
        reservoirUnits={120}
        loopStatus={{
          state: "looping",
          source: "aaps",
          issuedAt: "2026-07-04T10:00:00.000Z",
        }}
      />,
    );

    const row = screen.getByTestId("live-pump-automation-row");

    expect(row).toHaveAccessibleName("AAPS insulin automation: active");
    expect(row).toHaveTextContent("AUTOMATION:");
    expect(row).toHaveTextContent("Active");
    expect(row).toHaveTextContent("AAPS");
  });

  it("shows a supported override as an active therapy mode", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-04T10:00:00.000Z"));

    try {
      render(
        <LivePumpStats
          iob={1.2}
          basalRate={0.8}
          batteryPct={75}
          reservoirUnits={120}
          override={{
            name: "Exercise",
            startedAt: "2026-07-04T09:30:00.000Z",
            endsAt: "2026-07-04T11:15:00.000Z",
          }}
        />,
      );

      const row = screen.getByTestId("live-pump-active-mode-row");

      expect(row).toHaveAccessibleName(
        "Active therapy mode: Exercise, 1h 15m left",
      );
      expect(row).toHaveTextContent("MODE:");
      expect(row).toHaveTextContent("Exercise");
      expect(row).toHaveTextContent("1h 15m left");
    } finally {
      jest.useRealTimers();
    }
  });
});
