import { render, screen } from "@testing-library/react";
import { getAlertEscalationTimeline } from "@/lib/api";
import { EscalationTimeline } from "./EscalationTimeline";

jest.mock("@/lib/api", () => ({
  getAlertEscalationTimeline: jest.fn(),
}));

const mockGetTimeline = jest.mocked(getAlertEscalationTimeline);

describe("EscalationTimeline", () => {
  it("loads and labels escalation history", async () => {
    mockGetTimeline.mockResolvedValue({
      alert_id: "alert-1",
      count: 1,
      events: [
        {
          id: "event-1",
          alert_id: "alert-1",
          tier: "reminder",
          notification_status: "sent",
          triggered_at: "2026-07-25T08:00:00Z",
          message_content: "Reminder",
          contacts_notified: [],
          created_at: "2026-07-25T08:00:00Z",
        },
      ],
    });

    render(<EscalationTimeline alertId="alert-1" />);

    expect(
      screen.getByText("Loading escalation timeline..."),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText("Escalation timeline"),
    ).toHaveTextContent("Reminder Sent");
    expect(mockGetTimeline).toHaveBeenCalledWith("alert-1");
  });

  it("announces a failed request", async () => {
    mockGetTimeline.mockRejectedValue(new Error("offline"));
    render(<EscalationTimeline alertId="alert-2" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Escalation timeline unavailable",
    );
  });
});
