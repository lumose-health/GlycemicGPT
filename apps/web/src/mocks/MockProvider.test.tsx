import { render, screen } from "@testing-library/react";

import { MockProvider } from "./MockProvider";

jest.mock("./browser", () => ({
  startMockWorker: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./DevMockPanel", () => ({
  DevMockPanel: () => <div>Mock panel mounted</div>,
}));

describe("MockProvider", () => {
  it("does not mount the dev panel when mock runtime is inactive", () => {
    render(
      <MockProvider>
        <div>App content</div>
      </MockProvider>
    );

    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(screen.queryByText("Mock panel mounted")).not.toBeInTheDocument();
  });

  it("mounts the dev panel when mock runtime is active", () => {
    render(
      <MockProvider initialShouldMock>
        <div>App content</div>
      </MockProvider>
    );

    expect(screen.getByText("Mock panel mounted")).toBeInTheDocument();
  });
});
