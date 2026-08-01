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
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /time range selected/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));

    expect(onChange).toHaveBeenCalledWith({ kind: "preset", range: "7d" });
  });

  it("pastes a copied time range into the absolute fields", async () => {
    const onChange = jest.fn();
    const readText = jest.fn().mockResolvedValue(
      serializeTimeRangeClipboardValue({
        from: "2026-07-04T10:00:00.000Z",
        to: "2026-07-04T11:00:00.000Z",
      }),
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
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /time range selected/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Paste" }));

    await waitFor(() => {
      expect(screen.getAllByRole("textbox")[0]).toHaveValue(
        "2026-07-04T10:00:00.000Z",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Apply time range" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "custom",
        raw: {
          from: "2026-07-04T10:00:00.000Z",
          to: "2026-07-04T11:00:00.000Z",
        },
      }),
    );
  });

  it("supports constrained inline reuse without changing dashboard defaults", () => {
    render(
      <DashboardTimeRangePicker
        currentWindow={{
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-07-28T23:59:59.000Z",
        }}
        maxRangeDays={31}
        onChange={jest.fn()}
        panelMode="inline"
        presetRanges={["7d", "14d", "30d"]}
        quickRangeOptions={[
          { display: "Last 7 days", from: "now-6d/d", to: "now" },
          { display: "Last 14 days", from: "now-13d/d", to: "now" },
          { display: "Last 30 days", from: "now-29d/d", to: "now" },
        ]}
        selection={{
          kind: "custom",
          label: "2026-07-01 to 2026-07-28",
          raw: { from: "2026-07-01", to: "2026-07-28" },
          window: {
            from: "2026-07-01T00:00:00.000Z",
            to: "2026-07-28T23:59:59.000Z",
          },
        }}
        showNavigationControls={false}
        timeZone="UTC"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Move time range backwards" }),
    ).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", {
      name: /time range selected/i,
    });
    const transition = screen.getByTestId(
      "dashboard-time-range-picker-transition",
    );

    expect(trigger).toHaveClass(
      "cursor-pointer",
      "border-border-default",
      "bg-surface-primary",
      "h-10",
    );
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(transition).toHaveClass(
      "grid-rows-[0fr]",
      "opacity-0",
      "transition-[grid-template-rows,opacity,translate,margin]",
      "motion-reduce:transition-none",
    );
    expect(transition).toHaveAttribute("aria-hidden", "true");
    expect(transition).toHaveAttribute("inert");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(transition).toHaveClass(
      "relative",
      "w-full",
      "grid-rows-[1fr]",
      "translate-y-0",
      "opacity-100",
      "mt-2",
    );
    expect(transition).not.toHaveAttribute("inert");
    expect(screen.getByTestId("dashboard-time-range-picker-panel")).toHaveClass(
      "border-border-default",
      "bg-surface-primary",
    );
    expect(screen.getByRole("button", { name: "Copy" })).toHaveClass(
      "cursor-pointer",
      "border-border-default",
      "bg-surface-primary",
    );
    expect(screen.getByRole("button", { name: "Paste" })).toHaveClass(
      "cursor-pointer",
      "border-border-default",
      "bg-surface-primary",
    );
    expect(
      screen.getByRole("button", { name: "Apply time range" }),
    ).toHaveClass(
      "cursor-pointer",
      "border-border-default",
      "bg-surface-primary",
    );
    expect(screen.getByRole("button", { name: "7 days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "14 days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "3 hours" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Last 7 days" }),
    ).toBeInTheDocument();
  });

  it("does not open when disabled", () => {
    render(
      <DashboardTimeRangePicker
        currentWindow={null}
        disabled
        onChange={jest.fn()}
        selection={{ kind: "preset", range: "30d" }}
        timeZone="UTC"
      />,
    );

    const trigger = screen.getByRole("button", {
      name: /time range selected/i,
    });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByTestId("dashboard-time-range-picker-transition"),
    ).toHaveClass("grid-rows-[0fr]", "opacity-0");
    expect(
      screen.getByTestId("dashboard-time-range-picker-transition"),
    ).toHaveAttribute("inert");
  });
});
