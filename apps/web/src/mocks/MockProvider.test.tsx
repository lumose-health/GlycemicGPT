import { useEffect } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";

import { startMockWorker } from "./browser";
import { MockProvider } from "./MockProvider";
import { setMockRuntimeState } from "./state";

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
    window.localStorage.clear();
    startMockWorkerMock.mockReset();
    startMockWorkerMock.mockResolvedValue(undefined);
  });

  it("does not mount the dev panel when mock runtime is inactive", () => {
    render(
      <MockProvider>
        <div>App content</div>
      </MockProvider>,
    );

    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(screen.queryByText(/Mock panel/)).not.toBeInTheDocument();
  });

  it("mounts the dev panel as active when the worker starts", async () => {
    render(
      <MockProvider initialShouldMock>
        <div>App content</div>
      </MockProvider>,
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
      </MockProvider>,
    );

    expect(await screen.findByText("Mock panel inactive")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to start mock runtime",
      expect.any(Error),
    );

    consoleError.mockRestore();
  });

  it("remounts application content when mock runtime state changes", async () => {
    const onMount = jest.fn();

    function MountProbe() {
      useEffect(() => {
        onMount();
      }, []);

      return <div>App content</div>;
    }

    render(
      <MockProvider initialShouldMock>
        <MountProbe />
      </MockProvider>,
    );

    expect(await screen.findByText("App content")).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);

    act(() => {
      setMockRuntimeState({ cgmSources: ["glooko"], enabled: true });
    });

    await waitFor(() => expect(onMount).toHaveBeenCalledTimes(2));
  });

  it("remounts application content when the mocked user role changes", async () => {
    const onMount = jest.fn();

    function MountProbe() {
      useEffect(() => {
        onMount();
      }, []);

      return <div>App content</div>;
    }

    render(
      <MockProvider initialShouldMock>
        <MountProbe />
      </MockProvider>,
    );

    expect(await screen.findByText("App content")).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);

    act(() => {
      setMockRuntimeState({ userRole: "caregiver", enabled: true });
    });

    await waitFor(() => expect(onMount).toHaveBeenCalledTimes(2));
  });

  it("remounts application content when API availability changes", async () => {
    const onMount = jest.fn();

    function MountProbe() {
      useEffect(() => {
        onMount();
      }, []);

      return <div>App content</div>;
    }

    render(
      <MockProvider initialShouldMock>
        <MountProbe />
      </MockProvider>,
    );

    expect(await screen.findByText("App content")).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);

    act(() => {
      setMockRuntimeState({ apiUnavailable: true, enabled: true });
    });

    await waitFor(() => expect(onMount).toHaveBeenCalledTimes(2));
  });

  it("remounts application content when the knowledge document count changes", async () => {
    const onMount = jest.fn();

    function MountProbe() {
      useEffect(() => {
        onMount();
      }, []);

      return <div>App content</div>;
    }

    render(
      <MockProvider initialShouldMock>
        <MountProbe />
      </MockProvider>,
    );

    expect(await screen.findByText("App content")).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);

    act(() => {
      setMockRuntimeState({ knowledgeDocumentCount: 45, enabled: true });
    });

    await waitFor(() => expect(onMount).toHaveBeenCalledTimes(2));
  });

  it("remounts application content when automatic Tandem sync fails", async () => {
    const onMount = jest.fn();

    function MountProbe() {
      useEffect(() => {
        onMount();
      }, []);

      return <div>App content</div>;
    }

    render(
      <MockProvider initialShouldMock>
        <MountProbe />
      </MockProvider>,
    );

    expect(await screen.findByText("App content")).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);

    act(() => {
      setMockRuntimeState({
        tandemAutomaticSyncShouldFail: true,
        enabled: true,
      });
    });

    await waitFor(() => expect(onMount).toHaveBeenCalledTimes(2));
  });

  it("remounts application content when the unrecognized bolus review event type scenario changes", async () => {
    const onMount = jest.fn();

    function MountProbe() {
      useEffect(() => {
        onMount();
      }, []);

      return <div>App content</div>;
    }

    render(
      <MockProvider initialShouldMock>
        <MountProbe />
      </MockProvider>,
    );

    expect(await screen.findByText("App content")).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);

    act(() => {
      setMockRuntimeState({
        bolusReviewIncludeUnknownEventType: true,
        enabled: true,
      });
    });

    await waitFor(() => expect(onMount).toHaveBeenCalledTimes(2));
  });

  it("does not remount application content for profile-only state changes", async () => {
    const onMount = jest.fn();

    function MountProbe() {
      useEffect(() => {
        onMount();
      }, []);

      return <div>App content</div>;
    }

    render(
      <MockProvider initialShouldMock>
        <MountProbe />
      </MockProvider>,
    );

    expect(await screen.findByText("App content")).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);

    act(() => {
      setMockRuntimeState({ displayName: "Mechabeetus" });
    });

    expect(onMount).toHaveBeenCalledTimes(1);
  });
});
