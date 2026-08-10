import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DashboardTimeRangeProvider,
  useDashboardTimeRange,
} from "./DashboardTimeRangeProvider";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

const mockUsePathname = jest.mocked(usePathname);
const mockUseRouter = jest.mocked(useRouter);
const mockUseSearchParams = jest.mocked(useSearchParams);
const replace = jest.fn();

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
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue("/dashboard");
    mockUseRouter.mockReturnValue({ replace } as unknown as ReturnType<
      typeof useRouter
    >);
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>,
    );
  });

  it("writes the default selection and committed changes to the URL", async () => {
    render(
      <DashboardTimeRangeProvider>
        <Consumer />
      </DashboardTimeRangeProvider>,
    );

    expect(screen.getByText("Last 24 hours")).toBeInTheDocument();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/dashboard?from=now-24h&to=now&timezone=browser",
        { scroll: false },
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Select week" }));
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(replace).toHaveBeenLastCalledWith(
      "/dashboard?from=now-168h&to=now&timezone=browser",
      { scroll: false },
    );
  });

  it("restores a preset from URL parameters", () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(
        "from=now-168h&to=now&timezone=browser",
      ) as unknown as ReturnType<typeof useSearchParams>,
    );

    render(
      <DashboardTimeRangeProvider>
        <Consumer />
      </DashboardTimeRangeProvider>,
    );

    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not replace the dashboard range while visiting another page", () => {
    mockUsePathname.mockReturnValue("/settings/account");

    render(
      <DashboardTimeRangeProvider>
        <Consumer />
      </DashboardTimeRangeProvider>,
    );

    expect(screen.getByText("Last 24 hours")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("rejects required context access outside the provider", () => {
    expect(() => render(<Consumer />)).toThrow(
      "useDashboardTimeRange must be used inside DashboardTimeRangeProvider",
    );
  });
});
