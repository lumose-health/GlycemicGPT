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

  it("keeps the value on primary foreground while the shape carries range color", () => {
    render(<GlucoseIndicator value={142.4} trend="Stable" showAge={false} />);

    expect(screen.getByTestId("glucose-indicator-value")).toHaveClass(
      "text-foreground-primary",
    );
    expect(screen.getByTestId("glucose-indicator-shape")).toHaveClass(
      "text-signal-check-fill",
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
      "/static_assets/iconSprite.svg#glucose",
    );
  });

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
