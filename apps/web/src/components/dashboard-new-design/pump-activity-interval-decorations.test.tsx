import { render } from "@testing-library/react";
import type { PumpActivityLaneInterval } from "./insulin-timeline-data";
import {
  getActivityIconCount,
  getPumpActivityDecorationLayout,
  PumpActivityIntervalDecorations,
} from "./pump-activity-interval-decorations";

const intervals: PumpActivityLaneInterval[] = [
  {
    endMs: 250,
    hasConfirmedResume: true,
    kind: "sleep",
    lane: 0,
    startMs: 0,
  },
  {
    endMs: 1000,
    hasConfirmedResume: true,
    kind: "exercise",
    lane: 0,
    startMs: 250,
  },
];

describe("PumpActivityIntervalDecorations", () => {
  it("adds more evenly spaced icons as interval width increases", () => {
    expect(getActivityIconCount(35)).toBe(0);
    expect(getActivityIconCount(40)).toBe(1);
    expect(getActivityIconCount(88)).toBe(2);
    expect(getActivityIconCount(184, 32, 24)).toBeLessThan(
      getActivityIconCount(184),
    );
    expect(getActivityIconCount(40, 24, 20)).toBe(0);
    expect(getActivityIconCount(40, 24, 20, 2)).toBe(1);
  });

  it("aligns decorations to the visible chart plot", () => {
    const layout = getPumpActivityDecorationLayout({
      chartHeight: 96,
      chartWidth: 640,
      intervals,
      showXAxis: true,
      xDomain: [0, 1000],
    });

    expect(layout).toHaveLength(2);
    expect(layout[0].left).toBe(36);
    expect(layout[1].left).toBe(187);
    expect(layout[1].width).toBeGreaterThan(layout[0].width);
    expect(layout[1].iconCount).toBeGreaterThan(layout[0].iconCount);
    expect(layout[0].iconClassName).toBe("size-4");
    expect(layout[1].iconClassName).toBe("size-8");
  });

  it("renders the shared sprite icon on each activity line", () => {
    const { container } = render(
      <PumpActivityIntervalDecorations
        chartHeight={96}
        chartWidth={640}
        intervals={intervals}
        showXAxis
        xDomain={[0, 1000]}
      />,
    );
    const decorations = Array.from(
      container.querySelectorAll<HTMLElement>("[data-icon-count]"),
    );
    const expectedIconCount = decorations.reduce(
      (count, decoration) => count + Number(decoration.dataset.iconCount ?? 0),
      0,
    );
    const icons = container.querySelectorAll("use");
    const sleepIcons = container.querySelectorAll(
      ".text-data-insulin-mode-sleep use",
    );
    const exerciseIcons = container.querySelectorAll(
      ".text-data-insulin-mode-exercise use",
    );

    expect(decorations).toHaveLength(2);
    expect(container.querySelector(".justify-evenly")).not.toBeNull();
    expect(container.querySelector(".border-t")).toBeNull();
    expect(icons).toHaveLength(expectedIconCount);
    expect(sleepIcons.length).toBeGreaterThan(0);
    expect(exerciseIcons.length).toBeGreaterThan(0);
    expect(sleepIcons[0].closest("svg")).toHaveClass("size-4");
    expect(exerciseIcons[0].closest("svg")).toHaveClass("size-8");
    expect(exerciseIcons[0].closest("svg")).not.toHaveClass("h-6", "w-6");
    sleepIcons.forEach((icon) => {
      expect(icon).toHaveAttribute(
        "href",
        "/static_assets/iconSprite.svg#sleep-zzz",
      );
    });
    exerciseIcons.forEach((icon) => {
      expect(icon).toHaveAttribute(
        "href",
        "/static_assets/iconSprite.svg#exercise-dumbbell",
      );
    });
  });

  it("supports a fixed track below the plot with custom side insets", () => {
    const layout = getPumpActivityDecorationLayout({
      chartHeight: 320,
      chartWidth: 390,
      intervals: [
        intervals[0],
        { ...intervals[1], lane: 1 },
      ],
      plotInsets: { left: 32, right: 32 },
      showXAxis: true,
      trackLayout: { barHeight: 32, rowHeight: 36, top: 200 },
      xDomain: [0, 1000],
    });

    expect(layout[0]).toEqual(
      expect.objectContaining({ height: 32, left: 32, top: 200 }),
    );
    expect(layout[1]).toEqual(
      expect.objectContaining({ height: 32, top: 236 }),
    );
  });

  it("uses smaller icons only when compact rendering is requested", () => {
    const layout = getPumpActivityDecorationLayout({
      chartHeight: 96,
      chartWidth: 640,
      compactIcons: true,
      intervals,
      showXAxis: true,
      xDomain: [0, 1000],
    });

    expect(layout[0].iconClassName).toBe("size-3.5");
    expect(layout[1].iconClassName).toBe("size-6");
  });

  it("fits one compact workout icon in a 40 pixel interval", () => {
    const layout = getPumpActivityDecorationLayout({
      chartHeight: 96,
      chartWidth: 40,
      compactIcons: true,
      intervals: [{ ...intervals[1], startMs: 0 }],
      plotInsets: { left: 0, right: 0 },
      showXAxis: true,
      xDomain: [0, 1000],
    });

    expect(layout[0]).toEqual(
      expect.objectContaining({ iconCount: 1, iconClassName: "size-6" }),
    );
  });
});
