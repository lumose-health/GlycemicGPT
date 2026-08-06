import { render, screen } from "@testing-library/react";

import { DashboardQueryStatus } from "./DashboardQueryStatus";

describe("DashboardQueryStatus", () => {
  it("keeps an empty live region mounted while inactive", () => {
    render(
      <DashboardQueryStatus hasBackgroundError={false} isUpdating={false} />,
    );

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("announces an updating range", () => {
    render(
      <DashboardQueryStatus
        hasBackgroundError={false}
        isUpdating
        rangeLabel="Last 7 Days"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Updating to Last 7 Days",
    );
  });

  it("prioritizes the background error message", () => {
    render(
      <DashboardQueryStatus
        hasBackgroundError
        isUpdating
        rangeLabel="24 Hours"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Unable to refresh. Showing previously loaded data.",
    );
  });
});
