import { fireEvent, render, screen } from "@testing-library/react";
import {
  DashboardTimeRangeProvider,
  useDashboardTimeRange,
} from "./DashboardTimeRangeProvider";

function Consumer() {
  const { label, setSelection } = useDashboardTimeRange();

  return (
    <>
      <output>{label}</output>
      <button
        onClick={() => setSelection({ kind: "preset", range: "7d" })}
        type="button"
      >
        Select week
      </button>
    </>
  );
}

describe("DashboardTimeRangeProvider", () => {
  it("provides the default selection and updates it", () => {
    render(
      <DashboardTimeRangeProvider>
        <Consumer />
      </DashboardTimeRangeProvider>,
    );

    expect(screen.getByText("Last 24 hours")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select week" }));
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
  });

  it("rejects required context access outside the provider", () => {
    expect(() => render(<Consumer />)).toThrow(
      "useDashboardTimeRange must be used inside DashboardTimeRangeProvider",
    );
  });
});
