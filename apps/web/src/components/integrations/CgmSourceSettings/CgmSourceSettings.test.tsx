import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCgmSources } from "@/hooks/use-cgm";
import { updatePrimaryCgmSource } from "@/lib/api";
import { CgmSourceSettings } from "./CgmSourceSettings";

jest.mock("@/hooks/use-cgm", () => ({ useCgmSources: jest.fn() }));
jest.mock("@/lib/api", () => ({ updatePrimaryCgmSource: jest.fn() }));

describe("CgmSourceSettings", () => {
  it("labels the shared picker and persists a source change", async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    jest.mocked(useCgmSources).mockReturnValue({
      cgm: {
        multiple_sources: true,
        primary_source: "dexcom",
        sources: [
          {
            kind: "dexcom",
            label: "Dexcom",
            role: "primary",
            source: "dexcom",
          },
          {
            kind: "nightscout",
            label: "Nightscout",
            role: "secondary",
            source: "nightscout",
          },
        ],
      },
      error: null,
      isLoading: false,
      refresh,
    });
    jest
      .mocked(updatePrimaryCgmSource)
      .mockResolvedValue({ primary_source: "nightscout" });

    render(<CgmSourceSettings />);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Primary CGM source" }),
      {
        target: { value: "nightscout" },
      },
    );

    await waitFor(() =>
      expect(updatePrimaryCgmSource).toHaveBeenCalledWith("nightscout"),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stays hidden when only one source exists", () => {
    jest.mocked(useCgmSources).mockReturnValue({
      cgm: { multiple_sources: false, primary_source: "dexcom", sources: [] },
      error: null,
      isLoading: false,
      refresh: jest.fn(),
    });
    const { container } = render(<CgmSourceSettings />);
    expect(container).toBeEmptyDOMElement();
  });
});
