import { render, screen } from "@testing-library/react";
import { listCaregiverInvitations, listLinkedCaregivers } from "@/lib/api";
import { CaregiversSettings } from "./CaregiversSettings";

const mockRouter = { replace: jest.fn() };

jest.mock("next/navigation", () => ({
  usePathname: () => "/settings/care-sharing",
  useRouter: () => mockRouter,
}));

jest.mock("@/lib/api", () => ({
  createCaregiverInvitation: jest.fn(),
  listCaregiverInvitations: jest.fn(),
  listLinkedCaregivers: jest.fn(),
  revokeCaregiverInvitation: jest.fn(),
}));

const mockListCaregiverInvitations = jest.mocked(listCaregiverInvitations);
const mockListLinkedCaregivers = jest.mocked(listLinkedCaregivers);

describe("CaregiversSettings", () => {
  it("gives pending invitation revoke buttons distinct names", async () => {
    mockListCaregiverInvitations.mockResolvedValue({
      count: 2,
      invitations: [
        {
          accepted_by_email: null,
          created_at: "2026-08-01T10:00:00.000Z",
          expires_at: "2026-08-08T10:00:00.000Z",
          id: "invite-1",
          status: "pending",
        },
        {
          accepted_by_email: null,
          created_at: "2026-08-02T10:00:00.000Z",
          expires_at: "2026-08-09T10:00:00.000Z",
          id: "invite-2",
          status: "pending",
        },
      ],
    });
    mockListLinkedCaregivers.mockResolvedValue({ caregivers: [], count: 0 });

    render(<CaregiversSettings />);

    const revokeButtons = await screen.findAllByRole("button", {
      name: /^Revoke invitation created/,
    });
    expect(revokeButtons).toHaveLength(2);
    expect(revokeButtons[0]).not.toHaveAccessibleName(
      revokeButtons[1].getAttribute("aria-label") ?? "",
    );
  });
});
