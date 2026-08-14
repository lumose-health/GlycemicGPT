import { fireEvent, render, screen } from "@testing-library/react";
import { SegmentedControl } from "./SegmentedControl";

describe("SegmentedControl", () => {
  it("renders the selected option and emits a new value", () => {
    const onChange = jest.fn();
    render(
      <SegmentedControl
        aria-label="Filter insights"
        onChange={onChange}
        options={[
          { label: "All", value: "all" },
          { label: "Daily briefs", value: "briefs" },
        ]}
        value="all"
      />,
    );

    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Daily briefs" }));
    expect(onChange).toHaveBeenCalledWith("briefs");
  });

  it("supports arrow key navigation", () => {
    const onChange = jest.fn();
    render(
      <SegmentedControl
        aria-label="Filter insights"
        onChange={onChange}
        options={[
          { label: "All", value: "all" },
          { label: "Daily briefs", value: "briefs" },
        ]}
        value="all"
      />,
    );

    fireEvent.keyDown(screen.getByRole("tab", { name: "All" }), {
      key: "ArrowRight",
    });
    expect(onChange).toHaveBeenCalledWith("briefs");
  });
});
