import type uPlot from "uplot";

export const MIN_CHART_ZOOM_SELECT_PX = 8;
export const MIN_CHART_ZOOM_MS = 15 * 60 * 1000;

export type ChartZoomDomain = [number, number];
export type ChartZoomChangeHandler = (domain: ChartZoomDomain | null) => void;

export function createChartZoomInteraction(
  cursorSyncKey: string,
  showYCursor: boolean,
): Pick<uPlot.Options, "cursor" | "select"> {
  return {
    cursor: {
      x: true,
      y: showYCursor,
      drag: {
        x: true,
        y: false,
        setScale: false,
        dist: MIN_CHART_ZOOM_SELECT_PX,
      },
      points: { show: false },
      sync: {
        key: cursorSyncKey,
        scales: ["x", null],
        setSeries: false,
      },
    },
    select: {
      show: true,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    },
  };
}

export function finishChartZoomSelection(
  chart: uPlot,
): ChartZoomDomain | null {
  if (chart.select.width < MIN_CHART_ZOOM_SELECT_PX) {
    chart.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
    return null;
  }

  const fromMs = chart.posToVal(chart.select.left, "x") * 1000;
  const toMs = chart.posToVal(
    chart.select.left + chart.select.width,
    "x",
  ) * 1000;

  chart.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);

  if (toMs - fromMs < MIN_CHART_ZOOM_MS) {
    return null;
  }

  return [fromMs, toMs];
}

export function updateLocalHorizontalCursor(chart: uPlot): void {
  const horizontalCursor = chart.over?.querySelector<HTMLElement>(
    ".u-cursor-y",
  );

  horizontalCursor?.classList.toggle(
    "u-off",
    chart.cursor.event == null,
  );
}
