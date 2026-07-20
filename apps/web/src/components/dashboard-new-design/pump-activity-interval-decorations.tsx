import { Icon, type IconName } from "@/base/Icon";
import { twMerge } from "@/lib/ui/twMerge";
import { CHART_X_AXIS_SIZE_PX, CHART_Y_AXIS_SIZE_PX } from "./chart-axis";
import type { PumpActivityLaneInterval } from "./insulin-timeline-data";

const DEFAULT_ACTIVITY_ICON_SIZE_PX = 16;
const DEFAULT_ACTIVITY_ICON_MIN_GAP_PX = 16;
const ACTIVITY_ICON_EDGE_PADDING_PX = 4;
const ACTIVITY_ICON_MIN_EDGE_SPACE_PX = 6;

const activityDecorationByKind: Record<
  PumpActivityLaneInterval["kind"],
  {
    className: string;
    icon: IconName;
    iconClassName: string;
    iconMinEdgeSpacePx?: number;
    iconMinGapPx: number;
    iconSizePx: number;
  }
> = {
  exercise: {
    icon: "exercise-dumbbell",
    className: "text-data-insulin-mode-exercise",
    iconClassName: "size-8",
    iconMinGapPx: 24,
    iconSizePx: 32,
  },
  sleep: {
    icon: "sleep-zzz",
    className: "text-data-insulin-mode-sleep",
    iconClassName: "size-4",
    iconMinGapPx: DEFAULT_ACTIVITY_ICON_MIN_GAP_PX,
    iconSizePx: DEFAULT_ACTIVITY_ICON_SIZE_PX,
  },
  suspension: {
    icon: "circle-slash",
    className: "text-signal-error-text",
    iconClassName: "size-4",
    iconMinGapPx: DEFAULT_ACTIVITY_ICON_MIN_GAP_PX,
    iconSizePx: DEFAULT_ACTIVITY_ICON_SIZE_PX,
  },
};

const compactActivityIconByKind: Record<
  PumpActivityLaneInterval["kind"],
  {
    iconClassName: string;
    iconMinEdgeSpacePx: number;
    iconMinGapPx: number;
    iconSizePx: number;
  }
> = {
  exercise: {
    iconClassName: "size-6",
    iconMinEdgeSpacePx: 2,
    iconMinGapPx: 20,
    iconSizePx: 24,
  },
  sleep: {
    iconClassName: "size-3.5",
    iconMinEdgeSpacePx: 2,
    iconMinGapPx: 14,
    iconSizePx: 14,
  },
  suspension: {
    iconClassName: "size-3.5",
    iconMinEdgeSpacePx: 2,
    iconMinGapPx: 14,
    iconSizePx: 14,
  },
};

export interface PumpActivityDecorationLayout {
  className: string;
  height: number;
  iconCount: number;
  iconClassName: string;
  iconName: IconName;
  key: string;
  left: number;
  top: number;
  width: number;
}

interface PumpActivityIntervalDecorationsProps {
  chartHeight: number;
  chartWidth: number;
  compactIcons?: boolean;
  intervals: PumpActivityLaneInterval[];
  plotInsets?: {
    left: number;
    right: number;
  };
  showXAxis: boolean;
  trackLayout?: {
    barHeight: number;
    rowHeight: number;
    top: number;
  };
  xDomain: readonly [number, number];
}

export function getActivityIconCount(
  intervalWidthPx: number,
  iconSizePx = DEFAULT_ACTIVITY_ICON_SIZE_PX,
  iconMinGapPx = DEFAULT_ACTIVITY_ICON_MIN_GAP_PX,
  iconMinEdgeSpacePx = ACTIVITY_ICON_MIN_EDGE_SPACE_PX,
): number {
  const innerWidth = Math.max(
    0,
    intervalWidthPx - ACTIVITY_ICON_EDGE_PADDING_PX * 2,
  );
  const minimumSingleIconWidth =
    iconSizePx + iconMinEdgeSpacePx * 2;

  if (innerWidth < minimumSingleIconWidth) return 0;

  return Math.max(
    1,
    Math.floor(
      (innerWidth - iconSizePx) / (iconSizePx + iconMinGapPx),
    ),
  );
}

export function getActivityLaneRange(
  lane: number,
  laneCount: number,
): [number, number] {
  if (laneCount <= 1) {
    return [0.78, 0.22];
  }

  const top = 0.94;
  const bottom = 0.06;
  const gap = 0.08;
  const laneHeight = (top - bottom - gap * (laneCount - 1)) / laneCount;
  const laneTop = top - lane * (laneHeight + gap);
  return [laneTop, laneTop - laneHeight];
}

export function getPumpActivityDecorationLayout({
  chartHeight,
  chartWidth,
  compactIcons = false,
  intervals,
  plotInsets,
  showXAxis,
  trackLayout,
  xDomain,
}: PumpActivityIntervalDecorationsProps): PumpActivityDecorationLayout[] {
  const domainDuration = xDomain[1] - xDomain[0];
  const plotLeft = plotInsets?.left ?? CHART_Y_AXIS_SIZE_PX;
  const plotRight = plotInsets?.right ?? 0;
  const plotWidth = Math.max(0, chartWidth - plotLeft - plotRight);
  const plotHeight = Math.max(
    0,
    chartHeight - (showXAxis ? CHART_X_AXIS_SIZE_PX : 0),
  );

  if (
    domainDuration <= 0 ||
    plotWidth <= 0 ||
    (!trackLayout && plotHeight <= 0)
  ) return [];

  const laneCount = intervals.reduce(
    (count, interval) => Math.max(count, interval.lane + 1),
    1,
  );

  return intervals.flatMap((interval) => {
    const visibleStart = Math.max(interval.startMs, xDomain[0]);
    const visibleEnd = Math.min(interval.endMs, xDomain[1]);
    if (visibleEnd <= visibleStart) return [];

    const left =
      plotLeft +
      ((visibleStart - xDomain[0]) / domainDuration) * plotWidth;
    const width = ((visibleEnd - visibleStart) / domainDuration) * plotWidth;
    const [laneTop, laneBottom] = getActivityLaneRange(
      interval.lane,
      laneCount,
    );
    const decoration = activityDecorationByKind[interval.kind];
    const iconDecoration = compactIcons
      ? compactActivityIconByKind[interval.kind]
      : decoration;

    return [
      {
        className: decoration.className,
        height: trackLayout
          ? trackLayout.barHeight
          : (laneTop - laneBottom) * plotHeight,
        iconCount: getActivityIconCount(
          width,
          iconDecoration.iconSizePx,
          iconDecoration.iconMinGapPx,
          iconDecoration.iconMinEdgeSpacePx ??
            ACTIVITY_ICON_MIN_EDGE_SPACE_PX,
        ),
        iconClassName: iconDecoration.iconClassName,
        iconName: decoration.icon,
        key: `${interval.kind}-${interval.startMs}-${interval.endMs}-${interval.lane}`,
        left,
        top: trackLayout
          ? trackLayout.top + interval.lane * trackLayout.rowHeight
          : (1 - laneTop) * plotHeight,
        width,
      },
    ];
  });
}

export function PumpActivityIntervalDecorations(
  props: PumpActivityIntervalDecorationsProps,
) {
  const decorations = getPumpActivityDecorationLayout(props);

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {decorations.map((decoration) => (
        <div
          key={decoration.key}
          className={twMerge("absolute overflow-hidden", decoration.className)}
          data-icon-count={decoration.iconCount}
          style={{
            height: decoration.height,
            left: decoration.left,
            top: decoration.top,
            width: decoration.width,
          }}
        >
          <span className="absolute inset-x-1 top-1/2 flex -translate-y-1/2 items-center justify-evenly">
            {Array.from({ length: decoration.iconCount }, (_, index) => (
              <Icon
                key={index}
                className={twMerge(
                  "relative z-10",
                  decoration.iconClassName,
                )}
                decorative
                icon={decoration.iconName}
              />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
