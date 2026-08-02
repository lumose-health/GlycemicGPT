import { render, screen } from "@testing-library/react";
import { CaregiverDashboard } from "./CaregiverDashboard";
import { listLinkedPatients } from "@/lib/api";

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
});
