import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForecast } from "@/hooks/use-forecast";
import { updateForecastSource } from "@/lib/api";
import { ForecastSourceSettings } from "./ForecastSourceSettings";

jest.mock("@/hooks/use-forecast", () => ({ useForecast: jest.fn() }));
jest.mock("@/lib/api", () => ({ updateForecastSource: jest.fn() }));

describe("ForecastSourceSettings", () => {
  it("labels the shared picker and persists a forecast preference", async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    jest.mocked(useForecast).mockReturnValue({
      error: null,
      forecast: {
        available_sources: ["loop"],
        effective_source: "loop",
        forecast: null,
        forecast_unavailable_reason: null,
        source_preference: "auto",
      },
      isLoading: false,
      refresh,
    });
    jest
      .mocked(updateForecastSource)
      .mockResolvedValue({ source_preference: "loop" });

    render(<ForecastSourceSettings />);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Forecast source" }),
      {
        target: { value: "loop" },
      },
    );

    await waitFor(() =>
      expect(updateForecastSource).toHaveBeenCalledWith("loop"),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("preserves a preferred source that has no recent forecast", () => {
    jest.mocked(useForecast).mockReturnValue({
      error: null,
      forecast: {
        available_sources: ["loop"],
        effective_source: null,
        forecast: null,
        forecast_unavailable_reason: "source_silent",
        source_preference: "aaps",
      },
      isLoading: false,
      refresh: jest.fn(),
    });

    render(<ForecastSourceSettings />);

    const picker = screen.getByRole("combobox", { name: "Forecast source" });
    expect(picker).toHaveValue("aaps");
    expect(
      screen.getByRole("option", {
        name: "AAPS (no recent forecast)",
      }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("option", { name: "AAPS" })).toHaveLength(0);
  });

  it.each([
    ["needs_pick" as const, "Multiple sources available: pick one to see its forecast."],
    [
      "stale" as const,
      "Your forecast data is older than 30 minutes: no overlay until fresher data arrives.",
    ],
  ])("uses readable punctuation for %s status copy", (reason, message) => {
    jest.mocked(useForecast).mockReturnValue({
      error: null,
      forecast: {
        available_sources: ["loop", "aaps"],
        effective_source: null,
        forecast: null,
        forecast_unavailable_reason: reason,
        source_preference: "auto",
      },
      isLoading: false,
      refresh: jest.fn(),
    });

    render(<ForecastSourceSettings />);

    expect(screen.getByTestId("forecast-picker-hint")).toHaveTextContent(
      message,
    );
  });
});
