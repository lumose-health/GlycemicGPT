import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DevMockPanel } from "./DevMockPanel";
import {
  MOCK_NOTIFICATION_EVENT_NAME,
  MOCK_NOTIFICATION_QUEUE_SIZE,
} from "./notification-controls";
import type { MockNotificationRequest } from "./notification-controls.types";
import { getMockRuntimeState } from "./state";

jest.mock("./browser", () => ({
  startMockWorker: jest.fn().mockResolvedValue(undefined),
}));

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

  it("applies multiple CGM and insulin delivery connections immediately", async () => {
    const user = userEvent.setup();
    render(<DevMockPanel runtimeActive />);

    const cgmTab = await screen.findByRole("tab", {
      name: /CGM connections/i,
    });
    const pumpTab = screen.getByRole("tab", {
      name: /Insulin pump connections/i,
    });
    const cgmConnections = screen.getByRole("tabpanel", {
      name: /CGM connections/i,
    });
    const nightscout = within(cgmConnections).getByRole("checkbox", {
      name: /Nightscout Loop/i,
    });

    expect(cgmTab).toHaveAttribute("aria-selected", "true");
    expect(pumpTab).toHaveAttribute("aria-selected", "false");
    await user.click(nightscout);
    expect(getMockRuntimeState()).toMatchObject({
      enabled: true,
      cgmSources: ["dexcom", "nightscout-loop"],
    });

    await user.click(pumpTab);
    const insulinConnections = screen.getByRole("tabpanel", {
      name: /Insulin pump connections/i,
    });
    const mdi = within(insulinConnections).getByRole("checkbox", {
      name: /Insulin pens/i,
    });

    expect(pumpTab).toHaveAttribute("aria-selected", "true");
    await user.click(mdi);
    expect(getMockRuntimeState()).toMatchObject({
      enabled: true,
      pumpSources: ["tandem", "mdi"],
    });
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  });

  it("toggles the mocked account into caregiver view", async () => {
    const user = userEvent.setup();
    render(<DevMockPanel runtimeActive />);

    const caregiverView = await screen.findByRole("switch", {
      name: "Caregiver view",
    });

    expect(caregiverView).not.toBeChecked();
    await user.click(caregiverView);

    expect(caregiverView).toBeChecked();
    expect(getMockRuntimeState()).toMatchObject({
      enabled: true,
      userRole: "caregiver",
    });
  });

  it("allows the final CGM connection to be disconnected", async () => {
    const user = userEvent.setup();
    render(<DevMockPanel runtimeActive />);

    const cgmConnections = await screen.findByRole("tabpanel", {
      name: /CGM connections/i,
    });
    const dexcom = within(cgmConnections).getByRole("checkbox", {
      checked: true,
    });

    expect(dexcom).toBeChecked();
    expect(dexcom).toBeEnabled();

    await user.click(dexcom);

    expect(dexcom).not.toBeChecked();
    expect(getMockRuntimeState().cgmSources).toEqual([]);
    expect(
      within(cgmConnections).getByText("No CGM source connected"),
    ).toBeInTheDocument();
  });

  it("opens as a full width half viewport bottom sheet", async () => {
    const user = userEvent.setup();
    render(<DevMockPanel runtimeActive />);

    const backdrop = screen.getByTestId("mock-data-backdrop");
    const panel = await screen.findByRole("complementary", {
      name: /Development mock data controls/i,
    });

    expect(backdrop).toHaveClass("bg-overlay-subtle", "opacity-100");
    expect(panel).toHaveClass("inset-x-0", "h-[50dvh]", "w-full");
    expect(panel).toHaveClass("translate-y-0");

    await user.click(backdrop);

    expect(backdrop).toHaveClass("pointer-events-none", "opacity-0");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveClass("translate-y-full");
    expect(
      screen.getByRole("button", { name: "Mock data" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mock data" })).toHaveClass(
      "bottom-[calc(5rem+env(safe-area-inset-bottom))]",
      "lg:bottom-4",
    );

    await user.click(screen.getByRole("button", { name: "Mock data" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(panel).toHaveAttribute("aria-hidden", "true");
  });

  it("can force the next Tandem sync request to fail", async () => {
    const user = userEvent.setup();
    render(<DevMockPanel runtimeActive />);
    await user.click(await screen.findByRole("tab", { name: "API" }));

    const failureToggle = await screen.findByRole("checkbox", {
      name: "Fail manual Tandem sync",
    });

    expect(failureToggle).not.toBeChecked();

    await user.click(failureToggle);

    expect(getMockRuntimeState().tandemSyncShouldFail).toBe(true);
  });

  it("can trigger an automatic Tandem sync failure", async () => {
    const user = userEvent.setup();
    render(<DevMockPanel runtimeActive />);
    await user.click(await screen.findByRole("tab", { name: "API" }));

    await user.click(
      screen.getByRole("button", {
        name: "Trigger automatic pump sync failure",
      }),
    );

    expect(getMockRuntimeState().tandemAutomaticSyncShouldFail).toBe(true);
    expect(
      screen.getByRole("button", {
        name: "Clear automatic pump sync failure",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("dispatches every V2 notification variant", async () => {
    const user = userEvent.setup();
    const requests: MockNotificationRequest[] = [];
    const handleRequest = (event: Event) => {
      requests.push((event as CustomEvent<MockNotificationRequest>).detail);
    };
    window.addEventListener(MOCK_NOTIFICATION_EVENT_NAME, handleRequest);

    render(<DevMockPanel runtimeActive />);
    await user.click(await screen.findByRole("tab", { name: "Notifications" }));

    for (const label of ["Neutral", "Success", "Warning", "Error"]) {
      await user.click(await screen.findByRole("button", { name: label }));
    }

    expect(requests.map((request) => request.variant)).toEqual([
      "neutral",
      "success",
      "warning",
      "error",
    ]);

    window.removeEventListener(MOCK_NOTIFICATION_EVENT_NAME, handleRequest);
  });

  it("dispatches six persistent notifications for queue testing", async () => {
    const user = userEvent.setup();
    const requests: MockNotificationRequest[] = [];
    const handleRequest = (event: Event) => {
      requests.push((event as CustomEvent<MockNotificationRequest>).detail);
    };
    window.addEventListener(MOCK_NOTIFICATION_EVENT_NAME, handleRequest);

    render(<DevMockPanel runtimeActive />);
    await user.click(await screen.findByRole("tab", { name: "Notifications" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Fill notification queue",
      }),
    );

    expect(requests).toHaveLength(MOCK_NOTIFICATION_QUEUE_SIZE);
    expect(requests[0]).toMatchObject({
      options: { durationMs: null },
      title: "Queue notification 1",
      variant: "neutral",
    });
    expect(requests.at(-1)?.title).toBe("Queue notification 6");

    window.removeEventListener(MOCK_NOTIFICATION_EVENT_NAME, handleRequest);
  });

  it("separates glucose, notification, and API controls into tabs", async () => {
    const user = userEvent.setup();
    render(<DevMockPanel runtimeActive />);

    expect(
      await screen.findByRole("tabpanel", { name: "Connections" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tabpanel", { name: "Glucose event" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Glucose event" }));
    expect(
      screen.getByRole("tabpanel", { name: "Glucose event" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Trigger low" }));
    expect(getMockRuntimeState().glucoseEvent).toBe("low");
  });

  it("selects AI chat response scenarios immediately", async () => {
    const user = userEvent.setup();
    render(<DevMockPanel runtimeActive />);

    await user.click(screen.getByRole("tab", { name: "AI chat" }));
    const aiChatPanel = screen.getByRole("tabpanel", { name: "AI chat" });
    const providerError = within(aiChatPanel).getByRole("button", {
      name: "Provider error",
    });
    expect(
      within(aiChatPanel).getByRole("button", { name: "Slow response" }),
    ).toBeInTheDocument();

    await user.click(providerError);

    expect(providerError).toHaveAttribute("aria-pressed", "true");
    expect(getMockRuntimeState().aiChatScenario).toBe("provider-error");
    expect(
      within(aiChatPanel).getByText(
        "The provider is configured but message generation fails",
      ),
    ).toBeInTheDocument();
  });

  it("keeps glucose and notification actions compact and wrapping", async () => {
    const user = userEvent.setup();
    render(<DevMockPanel runtimeActive />);

    await user.click(screen.getByRole("tab", { name: "Glucose event" }));
    const glucoseAction = screen.getByRole("button", { name: "Trigger low" });
    expect(glucoseAction).toHaveClass("min-w-40");
    expect(glucoseAction.parentElement).toHaveClass("flex", "flex-wrap");

    await user.click(screen.getByRole("tab", { name: "Notifications" }));
    expect(screen.getByRole("button", { name: "Neutral" })).toHaveClass(
      "min-w-40",
    );
    expect(
      screen.getByRole("button", { name: "Fill notification queue" }),
    ).toHaveClass("min-w-52");
  });

  it("can kill and restore every mocked API route", async () => {
    const user = userEvent.setup();
    render(<DevMockPanel runtimeActive />);
    await user.click(await screen.findByRole("tab", { name: "API" }));

    await user.click(screen.getByRole("button", { name: "Kill mock API" }));

    expect(getMockRuntimeState().apiUnavailable).toBe(true);
    expect(
      screen.getByText("Mock API offline. Every /api/* request returns 503."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore mock API" }));

    expect(getMockRuntimeState().apiUnavailable).toBe(false);
    expect(screen.getByText("Mock API available.")).toBeInTheDocument();
  });

  it("runs an API request test and displays its result", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      statusText: "",
    });
    Object.defineProperty(global, "fetch", {
      configurable: true,
      value: fetchMock,
    });
    render(<DevMockPanel runtimeActive />);
    await user.click(await screen.findByRole("tab", { name: "API" }));

    await user.click(screen.getByRole("button", { name: "Run Current user" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", undefined);
    expect(await screen.findByText("PASS 200")).toBeInTheDocument();

    delete (global as unknown as { fetch?: typeof fetch }).fetch;
  });
});
