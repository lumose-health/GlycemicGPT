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

  it("resets the V2 content scroll position when the page changes", () => {
    const { rerender } = render(
      <main data-dashboard-scroll-container>
        <Pagination
          onNext={jest.fn()}
          onPrevious={jest.fn()}
          page={1}
          totalPages={3}
        />
      </main>,
    );
    const main = screen.getByRole("main");
    main.scrollTop = 720;

    rerender(
      <main data-dashboard-scroll-container>
        <Pagination
          onNext={jest.fn()}
          onPrevious={jest.fn()}
          page={2}
          totalPages={3}
        />
      </main>,
    );

    expect(main.scrollTop).toBe(0);
  });

  it("resets scroll when pagination disappears after results shrink", () => {
    const { rerender } = render(
      <main data-dashboard-scroll-container>
        <Pagination
          onNext={jest.fn()}
          onPrevious={jest.fn()}
          page={2}
          totalPages={2}
        />
      </main>,
    );
    const main = screen.getByRole("main");
    main.scrollTop = 720;

    rerender(
      <main data-dashboard-scroll-container>
        <Pagination
          onNext={jest.fn()}
          onPrevious={jest.fn()}
          page={1}
          totalPages={1}
        />
      </main>,
    );

    expect(main.scrollTop).toBe(0);
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });
});
