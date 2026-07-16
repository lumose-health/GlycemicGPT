import { render, screen } from "@testing-library/react";

import { startMockWorker } from "./browser";
import { MockProvider } from "./MockProvider";

jest.mock("./browser", () => ({
  startMockWorker: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./DevMockPanel", () => ({
  DevMockPanel: ({ runtimeActive }: { runtimeActive?: boolean }) => (
    <div>Mock panel {runtimeActive ? "active" : "inactive"}</div>
  ),
}));

const startMockWorkerMock = jest.mocked(startMockWorker);

describe("MockProvider", () => {
  beforeEach(() => {
    startMockWorkerMock.mockReset();
    startMockWorkerMock.mockResolvedValue(undefined);
  });

  it("does not mount the dev panel when mock runtime is inactive", () => {
    render(
      <MockProvider>
        <div>App content</div>
      </MockProvider>
    );

    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(screen.queryByText(/Mock panel/)).not.toBeInTheDocument();
  });

  it("mounts the dev panel as active when the worker starts", async () => {
    render(
      <MockProvider initialShouldMock>
        <div>App content</div>
      </MockProvider>
    );

    expect(await screen.findByText("Mock panel active")).toBeInTheDocument();
  });

  it("marks the runtime inactive when the worker fails to start", async () => {
    startMockWorkerMock.mockRejectedValue(new Error("worker start failed"));
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <MockProvider initialShouldMock>
        <div>App content</div>
      </MockProvider>
    );

    expect(await screen.findByText("Mock panel inactive")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to start mock runtime",
      expect.any(Error)
    );

    consoleError.mockRestore();
  });
});
