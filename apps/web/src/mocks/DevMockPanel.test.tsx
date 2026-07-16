import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DevMockPanel } from "./DevMockPanel";
import { getMockRuntimeState } from "./state";

describe("DevMockPanel", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      configurable: true,
    });
  });

  it("applies CGM and insulin delivery selections immediately", async () => {
    const user = userEvent.setup();
    render(<DevMockPanel runtimeActive />);

    const cgmSelect = await screen.findByRole("combobox", {
      name: /CGM connection/i,
    });
    const pumpSelect = screen.getByRole("combobox", {
      name: /Insulin delivery/i,
    });

    await user.selectOptions(cgmSelect, "glooko");
    expect(getMockRuntimeState()).toMatchObject({
      enabled: true,
      cgmSource: "glooko",
    });

    await user.selectOptions(pumpSelect, "mdi");
    expect(getMockRuntimeState()).toMatchObject({
      enabled: true,
      pumpSource: "mdi",
    });
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
  });
});
