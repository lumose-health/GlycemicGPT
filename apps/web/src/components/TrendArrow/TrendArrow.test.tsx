/**
 * Tests for the TrendArrow component.
 *
 * Story 4.3: Trend Arrow Component
 */

import { render, screen } from "@testing-library/react";
import {
  TrendArrow,
  TREND_ARROWS,
  TREND_DESCRIPTIONS,
  getTrendArrow,
  getTrendDescription,
  isRising,
  isFalling,
  isRapidChange,
  isStable,
  isUnknown,
  type TrendDirection,
} from "@/components/TrendArrow";
import TrendArrowDefault from "./TrendArrow";

// Mock framer-motion
const mockUseReducedMotion = jest.fn(() => false);

jest.mock("framer-motion", () => ({
  motion: {
    span: ({
      children,
      className,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      [key: string]: unknown;
    }) => (
      <span className={className} {...props}>
        {children}
      </span>
    ),
  },
  useReducedMotion: () => mockUseReducedMotion(),
}));

beforeEach(() => {
  mockUseReducedMotion.mockReturnValue(false);
});

describe("TREND_ARROWS constant", () => {
  it("contains all trend directions", () => {
    expect(TREND_ARROWS.RisingFast).toBe("↑↑");
    expect(TREND_ARROWS.Rising).toBe("↗");
    expect(TREND_ARROWS.Stable).toBe("→");
    expect(TREND_ARROWS.Falling).toBe("↘");
    expect(TREND_ARROWS.FallingFast).toBe("↓↓");
    expect(TREND_ARROWS.Unknown).toBe("?");
  });
});

describe("TREND_DESCRIPTIONS constant", () => {
  it("contains all trend descriptions", () => {
    expect(TREND_DESCRIPTIONS.RisingFast).toBe("rising fast");
    expect(TREND_DESCRIPTIONS.Rising).toBe("rising");
    expect(TREND_DESCRIPTIONS.Stable).toBe("stable");
    expect(TREND_DESCRIPTIONS.Falling).toBe("falling");
    expect(TREND_DESCRIPTIONS.FallingFast).toBe("falling fast");
    expect(TREND_DESCRIPTIONS.Unknown).toBe("unknown trend");
  });
});

describe("getTrendArrow", () => {
  it.each([
    ["RisingFast", "↑↑"],
    ["Rising", "↗"],
    ["Stable", "→"],
    ["Falling", "↘"],
    ["FallingFast", "↓↓"],
    ["Unknown", "?"],
  ] as const)("returns %s arrow for %s direction", (direction, expectedArrow) => {
    expect(getTrendArrow(direction)).toBe(expectedArrow);
  });
});

describe("getTrendDescription", () => {
  it.each([
    ["RisingFast", "rising fast"],
    ["Rising", "rising"],
    ["Stable", "stable"],
    ["Falling", "falling"],
    ["FallingFast", "falling fast"],
    ["Unknown", "unknown trend"],
  ] as const)("returns %s description for %s direction", (direction, expectedDesc) => {
    expect(getTrendDescription(direction)).toBe(expectedDesc);
  });
});

describe("isRising", () => {
  it("returns true for RisingFast", () => {
    expect(isRising("RisingFast")).toBe(true);
  });

  it("returns true for Rising", () => {
    expect(isRising("Rising")).toBe(true);
  });

  it("returns false for Stable", () => {
    expect(isRising("Stable")).toBe(false);
  });

  it("returns false for Falling", () => {
    expect(isRising("Falling")).toBe(false);
  });

  it("returns false for FallingFast", () => {
    expect(isRising("FallingFast")).toBe(false);
  });

  it("returns false for Unknown", () => {
    expect(isRising("Unknown")).toBe(false);
  });
});

describe("isFalling", () => {
  it("returns true for FallingFast", () => {
    expect(isFalling("FallingFast")).toBe(true);
  });

  it("returns true for Falling", () => {
    expect(isFalling("Falling")).toBe(true);
  });

  it("returns false for Stable", () => {
    expect(isFalling("Stable")).toBe(false);
  });

  it("returns false for Rising", () => {
    expect(isFalling("Rising")).toBe(false);
  });

  it("returns false for RisingFast", () => {
    expect(isFalling("RisingFast")).toBe(false);
  });

  it("returns false for Unknown", () => {
    expect(isFalling("Unknown")).toBe(false);
  });
});

describe("isRapidChange", () => {
  it("returns true for RisingFast", () => {
    expect(isRapidChange("RisingFast")).toBe(true);
  });

  it("returns true for FallingFast", () => {
    expect(isRapidChange("FallingFast")).toBe(true);
  });

  it("returns false for Rising", () => {
    expect(isRapidChange("Rising")).toBe(false);
  });

  it("returns false for Falling", () => {
    expect(isRapidChange("Falling")).toBe(false);
  });

  it("returns false for Stable", () => {
    expect(isRapidChange("Stable")).toBe(false);
  });

  it("returns false for Unknown", () => {
    expect(isRapidChange("Unknown")).toBe(false);
  });
});

describe("isStable", () => {
  it("returns true for Stable", () => {
    expect(isStable("Stable")).toBe(true);
  });

  it("returns false for Rising", () => {
    expect(isStable("Rising")).toBe(false);
  });

  it("returns false for RisingFast", () => {
    expect(isStable("RisingFast")).toBe(false);
  });

  it("returns false for Falling", () => {
    expect(isStable("Falling")).toBe(false);
  });

  it("returns false for FallingFast", () => {
    expect(isStable("FallingFast")).toBe(false);
  });

  it("returns false for Unknown", () => {
    expect(isStable("Unknown")).toBe(false);
  });
});

describe("isUnknown", () => {
  it("returns true for Unknown", () => {
    expect(isUnknown("Unknown")).toBe(true);
  });

  it("returns false for Stable", () => {
    expect(isUnknown("Stable")).toBe(false);
  });

  it("returns false for Rising", () => {
    expect(isUnknown("Rising")).toBe(false);
  });

  it("returns false for RisingFast", () => {
    expect(isUnknown("RisingFast")).toBe(false);
  });

  it("returns false for Falling", () => {
    expect(isUnknown("Falling")).toBe(false);
  });

  it("returns false for FallingFast", () => {
    expect(isUnknown("FallingFast")).toBe(false);
  });
});

describe("TrendArrow component", () => {
  describe("arrow display", () => {
    it.each([
      ["RisingFast", "↑↑"],
      ["Rising", "↗"],
      ["Stable", "→"],
      ["Falling", "↘"],
      ["FallingFast", "↓↓"],
      ["Unknown", "?"],
    ] as const)(
      "displays correct arrow for %s direction",
      (direction: TrendDirection, expectedArrow: string) => {
        render(<TrendArrow direction={direction} />);

        const arrow = screen.getByTestId("trend-arrow");
        expect(arrow).toHaveTextContent(expectedArrow);
      }
    );

    it("sets data-direction attribute", () => {
      render(<TrendArrow direction="Stable" />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveAttribute("data-direction", "Stable");
    });
  });

  describe("size variants", () => {
    it("uses md size by default", () => {
      render(<TrendArrow direction="Stable" />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveClass("font_header_3");
    });

    it("applies sm size class", () => {
      render(<TrendArrow direction="Stable" size="sm" />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveClass("font_body_1");
    });

    it("applies lg size class", () => {
      render(<TrendArrow direction="Stable" size="lg" />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveClass("font_header_1");
    });

    it("applies xl size class", () => {
      render(<TrendArrow direction="Stable" size="xl" />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveClass("font_header_1");
    });
  });

  describe("color handling", () => {
    it("uses trend-based color when useTrendColor is true", () => {
      render(<TrendArrow direction="Stable" useTrendColor />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveClass("text-signal-check-text");
    });

    it("uses red for RisingFast when useTrendColor is true", () => {
      render(<TrendArrow direction="RisingFast" useTrendColor />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveClass("text-signal-error-text");
    });

    it("uses amber for Rising when useTrendColor is true", () => {
      render(<TrendArrow direction="Rising" useTrendColor />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveClass("text-signal-warning-text");
    });

    it("uses red for FallingFast when useTrendColor is true", () => {
      render(<TrendArrow direction="FallingFast" useTrendColor />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveClass("text-signal-error-text");
    });

    it("uses slate for Unknown when useTrendColor is true", () => {
      render(<TrendArrow direction="Unknown" useTrendColor />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveClass("text-foreground-secondary");
    });

    it("uses custom colorClass when provided", () => {
      render(<TrendArrow direction="Stable" colorClass="text-blue-500" />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveClass("text-blue-500");
    });

    it("colorClass overrides useTrendColor", () => {
      render(
        <TrendArrow direction="Stable" useTrendColor colorClass="text-purple-500" />
      );

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveClass("text-purple-500");
      expect(arrow).not.toHaveClass("text-signal-check-text");
    });
  });

  describe("accessibility", () => {
    it("is decorative by default (aria-hidden)", () => {
      render(<TrendArrow direction="Stable" />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveAttribute("aria-hidden", "true");
    });

    it("does not have role when decorative", () => {
      render(<TrendArrow direction="Stable" decorative />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).not.toHaveAttribute("role");
    });

    it("has role=img when not decorative", () => {
      render(<TrendArrow direction="Stable" decorative={false} />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveAttribute("role", "img");
    });

    it("has aria-label when not decorative", () => {
      render(<TrendArrow direction="Rising" decorative={false} />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveAttribute("aria-label", "Glucose trend: rising");
    });

    it("has correct aria-label for all directions when not decorative", () => {
      const directions: TrendDirection[] = [
        "RisingFast",
        "Rising",
        "Stable",
        "Falling",
        "FallingFast",
        "Unknown",
      ];

      directions.forEach((direction) => {
        const { unmount } = render(
          <TrendArrow direction={direction} decorative={false} />
        );

        const arrow = screen.getByTestId("trend-arrow");
        expect(arrow).toHaveAttribute(
          "aria-label",
          `Glucose trend: ${TREND_DESCRIPTIONS[direction]}`
        );

        unmount();
      });
    });
  });

  describe("custom className", () => {
    it("applies additional className", () => {
      render(<TrendArrow direction="Stable" className="my-custom-class" />);

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveClass("my-custom-class");
    });

    it("combines className with size class", () => {
      render(
        <TrendArrow direction="Stable" size="lg" className="font-bold" />
      );

      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toHaveClass("font_header_1", "font-bold");
    });
  });

  describe("animation", () => {
    it("renders without animation by default", () => {
      render(<TrendArrow direction="RisingFast" />);

      // Should render as regular span, not motion.span
      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow.tagName.toLowerCase()).toBe("span");
    });

    it("renders animated when animated=true", () => {
      render(<TrendArrow direction="RisingFast" animated />);

      // Component should still render (motion.span becomes span in mock)
      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toBeInTheDocument();
    });

    it("respects reduced motion preference", () => {
      mockUseReducedMotion.mockReturnValue(true);

      render(<TrendArrow direction="RisingFast" animated />);

      // Should render as regular span when reduced motion is preferred
      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toBeInTheDocument();
    });

    it("does not animate Stable direction", () => {
      render(<TrendArrow direction="Stable" animated />);

      // Stable has no animation defined
      const arrow = screen.getByTestId("trend-arrow");
      expect(arrow).toBeInTheDocument();
    });
  });

  describe("exports", () => {
    it("default export works", () => {
      render(<TrendArrowDefault direction="Stable" />);

      expect(screen.getByTestId("trend-arrow")).toBeInTheDocument();
    });
  });
});
