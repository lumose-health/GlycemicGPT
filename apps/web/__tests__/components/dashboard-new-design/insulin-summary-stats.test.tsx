import { fireEvent, render, screen } from "@testing-library/react";
import { InsulinSummaryStats } from "@/components/dashboard-new-design/insulin-summary-stats";

const mockSetPeriod = jest.fn();
const mockRefetch = jest.fn();
let mockDashboardTimeRange: {
  currentWindow: { from: string; to: string };
  label: string;
} | null = {
  currentWindow: {
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-07-08T00:00:00.000Z",
  },
  label: "Last 7 days",
};
let mockHookReturn = {
  data: {
    tdd: 42.5,
    basal_units: 18.2,
    basal_injection_units: 0,
    basal_injection_count: 0,
    bolus_units: 20.1,
    correction_units: 4.2,
    basal_pct: 43,
    bolus_pct: 57,
    bolus_count: 70,
    correction_count: 14,
    period_days: 7,
  },
  isLoading: false,
  error: null as string | null,
  period: "14d" as const,
  setPeriod: mockSetPeriod,
  refetch: mockRefetch,
};

jest.mock("@/hooks/use-insulin-summary", () => ({
  useInsulinSummary: () => mockHookReturn,
  INSULIN_PERIOD_LABELS: {
    "24h": "24 Hours",
    "3d": "3 Days",
    "7d": "7 Days",
    "14d": "14 Days",
    "30d": "30 Days",
    "90d": "90 Days",
  },
}));

jest.mock("@/components/dashboard-new-design/dashboard-time-range-context", () => ({
  useOptionalDashboardTimeRange: () => mockDashboardTimeRange,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockDashboardTimeRange = {
    currentWindow: {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-08T00:00:00.000Z",
    },
    label: "Last 7 days",
  };
  mockHookReturn = {
    data: {
      tdd: 42.5,
      basal_units: 18.2,
      basal_injection_units: 0,
      basal_injection_count: 0,
      bolus_units: 20.1,
      correction_units: 4.2,
      basal_pct: 43,
      bolus_pct: 57,
      bolus_count: 70,
      correction_count: 14,
      period_days: 7,
    },
    isLoading: false,
    error: null,
    period: "14d",
    setPeriod: mockSetPeriod,
    refetch: mockRefetch,
  };
});

describe("new dashboard InsulinSummaryStats", () => {
  it("renders the Panel wrapped total daily dose ring", () => {
    render(<InsulinSummaryStats />);

    expect(screen.getByRole("region", { name: "Insulin Summary" })).toBeInTheDocument();
    expect(screen.queryByText("Last 7 days")).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: /Total daily dose 42\.5 units per day\. Basal: 18\.2 units per day, Bolus: 20\.1 units per day, Corrections: 4\.2 units per day/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("42.5")).toBeInTheDocument();
    expect(screen.getByText("U/day")).toBeInTheDocument();
  });

  it("uses sharp segment ends on the dose ring", () => {
    render(<InsulinSummaryStats />);

    const ring = screen.getByRole("img", { name: /Total daily dose/i });
    const segments = ring.querySelectorAll("circle[stroke-dasharray]");

    expect(segments).toHaveLength(3);
    segments.forEach((segment) => {
      expect(segment).toHaveAttribute("stroke-linecap", "butt");
    });
  });

  it("highlights the matching ring segment and dims peers when a metric is hovered", () => {
    render(<InsulinSummaryStats />);

    const basalCard = screen.getByRole("group", { name: "Basal: 18.2 units per day" });
    const bolusCard = screen.getByRole("group", { name: "Bolus: 20.1 units per day" });
    const correctionsCard = screen.getByRole("group", { name: "Corrections: 4.2 units per day" });
    const ring = screen.getByRole("img", { name: /Total daily dose/i });
    const [basalSegment, bolusSegment, correctionsSegment] = Array.from(
      ring.querySelectorAll("circle[stroke-dasharray]"),
    );

    fireEvent.mouseEnter(bolusCard);

    expect(bolusCard).toHaveClass("md:ring-border-active", "md:bg-surface-primary");
    expect(basalCard).toHaveClass("md:brightness-75", "md:saturate-50");
    expect(correctionsCard).toHaveClass("md:brightness-75", "md:saturate-50");
    expect(bolusSegment).toHaveClass("md:drop-shadow-sm");
    expect(bolusSegment).toHaveAttribute("stroke-width", "16");
    expect(basalSegment).toHaveClass("md:opacity-25", "md:saturate-50");
    expect(correctionsSegment).toHaveClass("md:opacity-25", "md:saturate-50");

    fireEvent.mouseLeave(bolusCard);

    expect(bolusCard).not.toHaveClass("md:ring-border-active");
    expect(basalCard).not.toHaveClass("md:brightness-75");
    expect(bolusSegment).not.toHaveClass("md:drop-shadow-sm");
    expect(bolusSegment).toHaveAttribute("stroke-width", "14");
    expect(basalSegment).not.toHaveClass("md:opacity-25");
  });

  it("highlights the matching metric card when a ring segment is hovered", () => {
    render(<InsulinSummaryStats />);

    const basalCard = screen.getByRole("group", { name: "Basal: 18.2 units per day" });
    const bolusCard = screen.getByRole("group", { name: "Bolus: 20.1 units per day" });
    const correctionsCard = screen.getByRole("group", { name: "Corrections: 4.2 units per day" });
    const ring = screen.getByRole("img", { name: /Total daily dose/i });
    const [basalSegment, bolusSegment, correctionsSegment] = Array.from(
      ring.querySelectorAll("circle[stroke-dasharray]"),
    );

    fireEvent.mouseEnter(correctionsSegment);

    expect(correctionsCard).toHaveClass("md:ring-border-active", "md:bg-surface-primary");
    expect(basalCard).toHaveClass("md:brightness-75", "md:saturate-50");
    expect(bolusCard).toHaveClass("md:brightness-75", "md:saturate-50");
    expect(correctionsSegment).toHaveClass("md:drop-shadow-sm");
    expect(correctionsSegment).toHaveAttribute("stroke-width", "16");
    expect(basalSegment).toHaveClass("md:opacity-25", "md:saturate-50");
    expect(bolusSegment).toHaveClass("md:opacity-25", "md:saturate-50");

    fireEvent.mouseLeave(correctionsSegment);

    expect(correctionsCard).not.toHaveClass("md:ring-border-active");
    expect(basalCard).not.toHaveClass("md:brightness-75");
    expect(correctionsSegment).not.toHaveClass("md:drop-shadow-sm");
    expect(correctionsSegment).toHaveAttribute("stroke-width", "14");
  });

  it("shows basal, bolus, correction, and count values from the summary API", () => {
    render(<InsulinSummaryStats />);

    expect(screen.getByRole("group", { name: "Basal: 18.2 units per day" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Bolus: 20.1 units per day" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Corrections: 4.2 units per day" })).toBeInTheDocument();
    const bolusCount = screen.getByRole("group", {
      name: "Bolus count: 10.0 per day average, 70 total",
    });
    const correctionCount = screen.getByRole("group", {
      name: "Correction count: 2.0 per day average, 14 total",
    });

    expect(bolusCount).toBeInTheDocument();
    expect(correctionCount).toBeInTheDocument();
    expect(
      screen.getByText("10.0/day", { selector: "p" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Total count: 70", { selector: "p" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("2.0/day", { selector: "p" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Total count: 14", { selector: "p" }),
    ).toBeInTheDocument();
  });

  it("hides the local period selector when the page time range is present", () => {
    render(<InsulinSummaryStats />);

    expect(
      screen.queryByRole("radiogroup", { name: /insulin summary time period/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the local period selector as a fallback outside the page time range", () => {
    mockDashboardTimeRange = null;

    render(<InsulinSummaryStats />);

    expect(
      screen.getByRole("radiogroup", { name: /insulin summary time period/i }),
    ).toBeInTheDocument();
  });
});
