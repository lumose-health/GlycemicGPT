import type uPlot from "uplot";
import {
  drawAlternatingDayBands,
  getSharedTimeSplitsForTimeZone,
} from "./chart-axis";

describe("shared chart calendar alignment", () => {
  it("aligns daily splits to local midnight across daylight saving time", () => {
    const scaleMin = Date.parse("2026-03-07T12:00:00.000Z") / 1000;
    const scaleMax = Date.parse("2026-03-10T12:00:00.000Z") / 1000;
    const chart = {
      bbox: { width: 300 },
    } as unknown as uPlot;

    expect(
      getSharedTimeSplitsForTimeZone(
        chart,
        scaleMin,
        scaleMax,
        "America/New_York",
      ),
    ).toEqual([
      Date.parse("2026-03-08T05:00:00.000Z") / 1000,
      Date.parse("2026-03-09T04:00:00.000Z") / 1000,
      Date.parse("2026-03-10T04:00:00.000Z") / 1000,
    ]);
  });

  it("draws the spring transition day as a 23 hour local calendar band", () => {
    const scaleMin = Date.parse("2026-03-07T12:00:00.000Z") / 1000;
    const scaleMax = Date.parse("2026-03-10T12:00:00.000Z") / 1000;
    const context = {
      fillRect: jest.fn(),
      fillStyle: "",
      globalAlpha: 1,
      restore: jest.fn(),
      save: jest.fn(),
    };

    drawAlternatingDayBands(
      {
        bbox: {
          height: 100,
          left: 0,
          top: 0,
          width: scaleMax - scaleMin,
        },
        ctx: context,
        scales: { x: { min: scaleMin, max: scaleMax } },
        valToPos: (value: number) => value - scaleMin,
      } as unknown as uPlot,
      "rgb(230, 232, 230)",
      "America/New_York",
    );

    expect(context.fillRect).toHaveBeenCalledWith(
      expect.any(Number),
      0,
      23 * 60 * 60,
      100,
    );
  });
});
