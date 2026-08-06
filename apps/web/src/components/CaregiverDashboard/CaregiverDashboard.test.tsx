import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CaregiverDashboard } from "./CaregiverDashboard";
import {
  getCaregiverPatientStatus,
  listLinkedPatients,
  sendCaregiverChat,
  type CaregiverPatientStatus,
} from "@/lib/api";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock("@/providers/user-provider", () => ({
  useUserContext: () => ({
    isLoading: false,
    user: { role: "caregiver" },
  }),
}));

jest.mock("@/lib/api", () => ({
  getCaregiverPatientStatus: jest.fn(),
  listLinkedPatients: jest.fn(),
  sendCaregiverChat: jest.fn(),
}));

const mockListLinkedPatients = listLinkedPatients as jest.MockedFunction<
  typeof listLinkedPatients
>;
const mockGetCaregiverPatientStatus =
  getCaregiverPatientStatus as jest.MockedFunction<
    typeof getCaregiverPatientStatus
  >;
const mockSendCaregiverChat = sendCaregiverChat as jest.MockedFunction<
  typeof sendCaregiverChat
>;

function makeStatus(
  patientId: string,
  patientEmail: string,
): CaregiverPatientStatus {
  return {
    glucose: {
      is_stale: false,
      minutes_ago: 1,
      reading_timestamp: "2026-08-02T10:00:00.000Z",
      trend: "Flat",
      trend_rate: 0,
      value: patientId === "patient-a" ? 111 : 222,
    },
    glucose_unit: "mgdl",
    iob: null,
    patient_email: patientEmail,
    patient_id: patientId,
    permissions: {
      can_receive_alerts: false,
      can_view_ai_suggestions: true,
      can_view_glucose: true,
      can_view_history: true,
      can_view_iob: false,
    },
  };
}

const linkedPatients = {
  count: 2,
  patients: [
    {
      linked_at: "2026-08-01T00:00:00.000Z",
      patient_email: "a@example.com",
      patient_id: "patient-a",
    },
    {
      linked_at: "2026-08-01T00:00:00.000Z",
      patient_email: "b@example.com",
      patient_id: "patient-b",
    },
  ],
};

describe("CaregiverDashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses the shared content loading state", () => {
    mockListLinkedPatients.mockReturnValue(new Promise(() => undefined));

    render(<CaregiverDashboard />);

    expect(
      screen.getByRole("status", { name: "Loading caregiver dashboard..." }),
    ).toBeVisible();
  });

  it("renders an accessible empty state when no patients are linked", async () => {
    mockListLinkedPatients.mockResolvedValue({ count: 0, patients: [] });

    render(<CaregiverDashboard />);

    expect(
      await screen.findByRole("heading", { name: "No patients linked" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: "Caregiver Dashboard" }),
    ).toBeVisible();
  });

  it("does not apply a stale status response after switching patients", async () => {
    const statusA = makeStatus("patient-a", "a@example.com");
    const statusB = makeStatus("patient-b", "b@example.com");
    let resolveRefreshA: (status: CaregiverPatientStatus) => void;
    const refreshA = new Promise<CaregiverPatientStatus>((resolve) => {
      resolveRefreshA = resolve;
    });

    mockListLinkedPatients.mockResolvedValue(linkedPatients);
    mockGetCaregiverPatientStatus.mockImplementation((patientId) =>
      Promise.resolve(patientId === "patient-a" ? statusA : statusB),
    );

    render(<CaregiverDashboard />);

    await screen.findByRole("button", { name: "View details for a@example.com" });
    await waitFor(() => {
      expect(mockGetCaregiverPatientStatus).toHaveBeenCalledTimes(2);
    });

    let detailACalls = 0;
    mockGetCaregiverPatientStatus.mockImplementation((patientId) => {
      if (patientId === "patient-a") {
        detailACalls += 1;
        return detailACalls === 1 ? Promise.resolve(statusA) : refreshA;
      }
      return Promise.resolve(statusB);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "View details for a@example.com" }),
    );
    await screen.findByRole("button", { name: "All patients" });
    expect(screen.getByText("a@example.com", { selector: "span" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    fireEvent.click(screen.getByRole("button", { name: "All patients" }));
    fireEvent.click(
      screen.getByRole("button", { name: "View details for b@example.com" }),
    );

    await screen.findByText("222");
    expect(screen.getByText("b@example.com", { selector: "span" })).toBeVisible();

    await act(async () => {
      resolveRefreshA!(statusA);
    });

    expect(screen.getByText("b@example.com", { selector: "span" })).toBeVisible();
    expect(screen.queryByText("a@example.com", { selector: "span" })).not.toBeInTheDocument();
  });

  it("does not render a chat response after switching patients", async () => {
    const statusA = makeStatus("patient-a", "a@example.com");
    const statusB = makeStatus("patient-b", "b@example.com");
    let resolveChatA: (response: { response: string; disclaimer: string }) => void;
    const chatA = new Promise<{ response: string; disclaimer: string }>(
      (resolve) => {
        resolveChatA = resolve;
      },
    );

    mockListLinkedPatients.mockResolvedValue(linkedPatients);
    mockGetCaregiverPatientStatus.mockImplementation((patientId) =>
      Promise.resolve(patientId === "patient-a" ? statusA : statusB),
    );
    mockSendCaregiverChat.mockReturnValue(chatA);

    render(<CaregiverDashboard />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "View details for a@example.com",
      }),
    );
    await screen.findByRole("button", { name: "All patients" });

    fireEvent.change(screen.getByLabelText("Ask AI about your patient"), {
      target: { value: "How are they doing?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    fireEvent.click(screen.getByRole("button", { name: "All patients" }));
    fireEvent.click(
      screen.getByRole("button", { name: "View details for b@example.com" }),
    );
    await screen.findByText("222");

    await act(async () => {
      resolveChatA!({
        disclaimer: "Patient A disclaimer",
        response: "Patient A response",
      });
    });

    expect(screen.queryByText("Patient A response")).not.toBeInTheDocument();
    expect(screen.getByText("b@example.com", { selector: "span" })).toBeVisible();
  });
});
