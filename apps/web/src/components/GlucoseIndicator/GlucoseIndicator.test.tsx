import { STATIC_ASSET_ICON_SPRITE_PATH } from "@/lib/staticAssets";
import { render, screen } from "@testing-library/react";
import { GlucoseIndicator } from "./GlucoseIndicator";

describe("GlucoseIndicator", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders a formatted mg/dL value with the active unit", () => {
    render(<GlucoseIndicator value={142.4} trend="Stable" showAge={false} />);

    expect(screen.getByTestId("glucose-indicator-value")).toHaveTextContent("142");
    expect(screen.getByTestId("glucose-indicator-unit")).toHaveTextContent("mg/dL");
  });

  it.each([19, 501])("hides an out of range reading of %s mg/dL", (value) => {
    render(<GlucoseIndicator value={value} trend="Stable" showAge={false} />);

    expect(screen.getByTestId("glucose-indicator-value")).toHaveTextContent("--");
  });

  it("does not show an unknown trend marker when no reading exists", () => {
    render(<GlucoseIndicator value={null} trend="Unknown" showAge={false} />);

    expect(screen.getByTestId("glucose-indicator-value")).toHaveTextContent("--");
    expect(
      screen.queryByTestId("glucose-indicator-unknown-trend"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Trend unavailable")).not.toBeInTheDocument();
  });

  it("keeps the value on primary foreground while the shape carries range color", () => {
    render(<GlucoseIndicator value={142.4} trend="Stable" showAge={false} />);

    expect(screen.getByTestId("glucose-indicator-value")).toHaveClass(
      "text-foreground-primary",
    );
    expect(screen.getByTestId("glucose-indicator-shape")).toHaveClass(
      "text-signal-check-fill",
    );
  });

  it("uses neutral styling and keeps a delayed value visible", () => {
    render(
      <GlucoseIndicator isDelayed value={210} trend="Rising" showAge={false} />,
    );

    expect(screen.getByTestId("glucose-indicator")).toHaveAttribute(
      "data-freshness",
      "delayed",
    );
    expect(screen.getByTestId("glucose-indicator-shape")).toHaveClass(
      "text-foreground-primary",
    );
    expect(screen.getByTestId("glucose-indicator-shape")).not.toHaveClass(
      "text-signal-warning-fill",
      "animate-glucose-pulse-subtle",
    );
    expect(screen.getByTestId("glucose-indicator-value")).toHaveClass(
      "text-foreground-primary",
    );
    expect(screen.getByTestId("glucose-indicator-value")).toHaveTextContent(
      "210",
    );
  });

  it("uses neutral styling and keeps a stale value visible", () => {
    render(
      <GlucoseIndicator isStale value={210} trend="Rising" showAge={false} />,
    );

    expect(screen.getByTestId("glucose-indicator")).toHaveAttribute(
      "data-freshness",
      "stale",
    );
    expect(screen.getByTestId("glucose-indicator-shape")).toHaveClass(
      "text-foreground-primary",
    );
    expect(screen.getByTestId("glucose-indicator-shape")).not.toHaveClass(
      "text-signal-warning-fill",
      "animate-glucose-pulse-subtle",
    );
    expect(screen.getByTestId("glucose-indicator-value")).toHaveClass(
      "text-foreground-primary",
    );
    expect(screen.getByTestId("glucose-indicator-value")).toHaveTextContent(
      "210",
    );
  });

  it("gives stale freshness precedence over delayed freshness", () => {
    render(
      <GlucoseIndicator
        isDelayed
        isStale
        value={120}
        trend="Stable"
        showAge={false}
      />,
    );

    expect(screen.getByTestId("glucose-indicator")).toHaveAttribute(
      "data-freshness",
      "stale",
    );
  });

  it("uses the darker warning fill for high glucose indicator shapes", () => {
    render(<GlucoseIndicator value={210} trend="Stable" showAge={false} />);

    expect(screen.getByTestId("glucose-indicator-shape")).toHaveClass(
      "text-signal-warning-fill",
    );
  });

  it("renders mmol values without changing the canonical mg/dL input", () => {
    render(
      <GlucoseIndicator
        value={180}
        trend="Stable"
        unit="mmol"
        showAge={false}
      />,
    );

    expect(screen.getByTestId("glucose-indicator-value")).toHaveTextContent("10.0");
    expect(screen.getByTestId("glucose-indicator-unit")).toHaveTextContent("mmol/L");
  });

  it("shows stale placeholder and reading age when the timestamp is too old", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-25T12:20:00.000Z"));

    render(
      <GlucoseIndicator
        value={98}
        trend="Stable"
        timestamp="2026-03-25T12:00:00.000Z"
      />,
    );

    expect(screen.getByTestId("glucose-indicator-value")).toHaveTextContent("--");
    expect(screen.getByTestId("glucose-indicator-age")).toHaveTextContent("20m ago");
  });

  it("rotates the indicator shape for falling trends", () => {
    const { container } = render(
      <GlucoseIndicator value={98} trend="Falling" showAge={false} />,
    );

    expect(screen.getByTestId("glucose-indicator-shape")).toHaveStyle({
      transform: "rotate(45deg)",
    });
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      `${STATIC_ASSET_ICON_SPRITE_PATH}#glucose`,
    );
  });

  it.each(["Unknown", "not_computable"])(
    "renders %s differently from a stable trend",
    (trend) => {
      const { rerender } = render(
        <GlucoseIndicator value={98} trend={trend} showAge={false} />,
      );

      expect(
        screen.getByTestId("glucose-indicator-unknown-trend"),
      ).toHaveTextContent("?");
      expect(screen.getByText("Trend unavailable")).toHaveClass("sr-only");
      expect(screen.getByTestId("glucose-indicator-shape")).toHaveStyle({
        opacity: "0.55",
      });

      rerender(
        <GlucoseIndicator value={98} trend="Stable" showAge={false} />,
      );

      expect(
        screen.queryByTestId("glucose-indicator-unknown-trend"),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("glucose-indicator-shape")).toHaveStyle({
        opacity: "1",
      });
    },
  );

  it("supports fit to container sizing", () => {
    render(
      <GlucoseIndicator
        value={98}
        trend="Stable"
        fitToContainer
        fitPlacement="center start"
        showAge={false}
        showUnit={false}
      />,
    );

    expect(screen.getByTestId("glucose-indicator")).toHaveStyle({
      height: "100%",
      overflow: "hidden",
      placeItems: "center start",
      width: "100%",
    });
    expect(screen.getByTestId("glucose-indicator")).toHaveStyle({
      "--glucose-indicator-size": "clamp(4rem, min(92cqw, 92cqh), 40rem)",
    });
  });
});
