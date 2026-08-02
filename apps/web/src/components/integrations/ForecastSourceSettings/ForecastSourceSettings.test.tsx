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
});
