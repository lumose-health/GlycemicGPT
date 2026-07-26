import { render } from "@testing-library/react";
import { ChartLegendSwatch } from "./ChartLegendSwatch";

describe("ChartLegendSwatch", () => {
  it("renders a decorative square color indicator", () => {
    const { container } = render(
      <ChartLegendSwatch className="bg-data-insulin-bolus" />,
    );
    const swatch = container.firstElementChild;

    expect(swatch).toHaveAttribute("aria-hidden", "true");
    expect(swatch).toHaveClass(
      "inline-block",
      "size-3",
      "shrink-0",
      "rounded-xs",
      "bg-data-insulin-bolus",
    );
  });
});
