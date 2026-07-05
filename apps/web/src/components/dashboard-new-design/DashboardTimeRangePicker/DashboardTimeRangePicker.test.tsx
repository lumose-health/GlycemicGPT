import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { serializeTimeRangeClipboardValue } from "@/lib/glucose/time-range-clipboard";
import { DashboardTimeRangePicker } from "./DashboardTimeRangePicker";

describe("DashboardTimeRangePicker", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("applies a preset range", () => {
    const onChange = jest.fn();

    render(
      <DashboardTimeRangePicker
        selection={{ kind: "preset", range: "24h" }}
        currentWindow={{
          from: "2026-07-04T08:00:00.000Z",
          to: "2026-07-05T08:00:00.000Z",
        }}
        timeZone="UTC"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /time range selected/i }));
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));

    expect(onChange).toHaveBeenCalledWith({ kind: "preset", range: "7d" });
  });

  it("pastes a copied time range into the absolute fields", async () => {
    const onChange = jest.fn();
    const readText = jest.fn().mockResolvedValue(
      serializeTimeRangeClipboardValue({
        from: "2026-07-04T10:00:00.000Z",
        to: "2026-07-04T11:00:00.000Z",
      })
    );

    Object.assign(navigator, {
      clipboard: {
        readText,
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });

    render(
      <DashboardTimeRangePicker
        selection={{ kind: "preset", range: "24h" }}
        currentWindow={{
          from: "2026-07-04T08:00:00.000Z",
          to: "2026-07-05T08:00:00.000Z",
        }}
        timeZone="UTC"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /time range selected/i }));
    fireEvent.click(screen.getByRole("button", { name: "Paste" }));

    await waitFor(() => {
      expect(screen.getAllByRole("textbox")[0]).toHaveValue("2026-07-04T10:00:00.000Z");
    });

    fireEvent.click(screen.getByRole("button", { name: "Apply time range" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      kind: "custom",
      raw: {
        from: "2026-07-04T10:00:00.000Z",
        to: "2026-07-04T11:00:00.000Z",
      },
    }));
  });
});
