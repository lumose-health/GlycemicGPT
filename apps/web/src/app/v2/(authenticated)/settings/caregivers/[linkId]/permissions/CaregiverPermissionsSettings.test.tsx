import { render, waitFor } from "@testing-library/react";
import { getCaregiverPermissions, listLinkedCaregivers } from "@/lib/api";
import { CaregiverPermissionsSettings } from "./CaregiverPermissionsSettings";

const mockRouterReplace = jest.fn();
const mockRouter = { replace: mockRouterReplace };

jest.mock("next/navigation", () => ({
  useParams: () => ({ linkId: "link-1" }),
  usePathname: () => "/settings/care-sharing",
  useRouter: () => mockRouter,
}));

jest.mock("@/lib/api", () => ({
  getCaregiverPermissions: jest.fn(),
  listLinkedCaregivers: jest.fn(),
  updateCaregiverPermissions: jest.fn(),
}));

const mockGetCaregiverPermissions = jest.mocked(getCaregiverPermissions);
const mockListLinkedCaregivers = jest.mocked(listLinkedCaregivers);

describe("CaregiverPermissionsSettings session handling", () => {
  it("redirects when loading permissions reports a 401", async () => {
    mockGetCaregiverPermissions.mockRejectedValue(
      new Error("401: Session expired"),
    );
    mockListLinkedCaregivers.mockResolvedValue({ caregivers: [], count: 0 });

    render(<CaregiverPermissionsSettings />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        "/login?expired=true&redirect=%2Fsettings%2Fcare-sharing",
      );
    });
  });
});
