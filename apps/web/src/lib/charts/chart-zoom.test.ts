import type uPlot from "uplot";
import {
  createChartZoomInteraction,
  finishChartZoomSelection,
  updateLocalHorizontalCursor,
} from "./chart-zoom";

describe("shared chart zoom", () => {
  it("configures synchronized horizontal selection", () => {
    const interaction = createChartZoomInteraction("timeline", false);

    expect(interaction.cursor).toMatchObject({
      x: true,
      y: false,
      drag: {
        x: true,
        y: false,
        setScale: false,
      },
      sync: {
        key: "timeline",
        scales: ["x", null],
      },
    });
    expect(interaction.select).toMatchObject({
      show: true,
      width: 0,
    });
  });

  it("turns a completed selection into a shared time domain", () => {
    const setSelect = jest.fn();
    const chart = {
      posToVal: (position: number) => 1_000 + position * 60,
      select: { left: 10, width: 20 },
      setSelect,
    } as unknown as uPlot;

    expect(finishChartZoomSelection(chart)).toEqual([
      1_600_000,
      2_800_000,
    ]);
    expect(setSelect).toHaveBeenCalledWith(
      { left: 0, top: 0, width: 0, height: 0 },
      false,
    );
  });

  it("clears a rejected narrow selection", () => {
    const setSelect = jest.fn();
    const chart = {
      select: { left: 10, width: 4 },
      setSelect,
    } as unknown as uPlot;

    expect(finishChartZoomSelection(chart)).toBeNull();
    expect(setSelect).toHaveBeenCalledWith(
      { left: 0, top: 0, width: 0, height: 0 },
      false,
    );
  });

  it("shows the horizontal guide only for the locally hovered chart", () => {
    const horizontalCursor = document.createElement("div");
    horizontalCursor.className = "u-cursor-y";
    const over = document.createElement("div");
    over.append(horizontalCursor);
    const chart = {
      cursor: { event: null },
      over,
    } as unknown as uPlot;

    updateLocalHorizontalCursor(chart);
    expect(horizontalCursor).toHaveClass("u-off");

    chart.cursor.event = new MouseEvent("mousemove");
    updateLocalHorizontalCursor(chart);
    expect(horizontalCursor).not.toHaveClass("u-off");
  });
});
