import { fireEvent, render, screen } from "@testing-library/react";
import { DashboardTimeRangeQuickSelect } from "./DashboardTimeRangeQuickSelect";

describe("DashboardTimeRangeQuickSelect", () => {
  it("renders every requested quick range and marks the active preset", () => {
    render(
      <DashboardTimeRangeQuickSelect
        selection={{ kind: "preset", range: "24h" }}
        timeZone="UTC"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(9);
    expect(
      screen.getByRole("button", { name: "Last 24 hours" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Last 90 days" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("selects an existing preset range", () => {
    const onChange = jest.fn();

    render(
      <DashboardTimeRangeQuickSelect
        selection={{ kind: "preset", range: "24h" }}
        timeZone="UTC"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));

    expect(onChange).toHaveBeenCalledWith({ kind: "preset", range: "7d" });
  });

  it("renders only the configured mobile ranges", () => {
    render(
      <DashboardTimeRangeQuickSelect
        ranges={["3h", "6h", "12h", "24h"]}
        selection={{ kind: "preset", range: "24h" }}
        timeZone="UTC"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Last 3 hours" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 24 hours" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Last 3 days" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Last 90 days" })).not.toBeInTheDocument();
  });

  it("resolves 90 days as a custom window", () => {
    const onChange = jest.fn();

    render(
      <DashboardTimeRangeQuickSelect
        selection={{ kind: "preset", range: "24h" }}
        timeZone="UTC"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Last 90 days" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "custom",
        label: "Last 90 days",
        raw: { from: "now-90d", to: "now" },
        window: expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
        }),
      }),
    );
  });
});
