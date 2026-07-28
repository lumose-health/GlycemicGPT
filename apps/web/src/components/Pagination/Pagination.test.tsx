import { fireEvent, render, screen } from "@testing-library/react";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("emits page navigation and exposes the current page", () => {
    const onNext = jest.fn();
    const onPrevious = jest.fn();

    render(
      <Pagination
        onNext={onNext}
        onPrevious={onPrevious}
        page={2}
        totalPages={4}
      />,
    );

    expect(screen.getByText("Page 2 of 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("disables navigation at the available boundaries", () => {
    const { rerender } = render(
      <Pagination
        onNext={jest.fn()}
        onPrevious={jest.fn()}
        page={1}
        totalPages={2}
      />,
    );

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    rerender(
      <Pagination
        onNext={jest.fn()}
        onPrevious={jest.fn()}
        page={2}
        totalPages={2}
      />,
    );

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
