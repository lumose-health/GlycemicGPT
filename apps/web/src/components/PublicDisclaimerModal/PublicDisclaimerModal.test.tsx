import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { DisclaimerContent } from "@/lib/api";

const mockAcknowledgeDisclaimer = jest.fn();
const mockGetDisclaimerContent = jest.fn();
const mockGetDisclaimerStatus = jest.fn();
const mockGetSessionId = jest.fn();

jest.mock("@/lib/api", () => ({
  acknowledgeDisclaimer: (...args: unknown[]) =>
    mockAcknowledgeDisclaimer(...args),
  getDisclaimerContent: (...args: unknown[]) =>
    mockGetDisclaimerContent(...args),
  getDisclaimerStatus: (...args: unknown[]) => mockGetDisclaimerStatus(...args),
}));

jest.mock("@/lib/session", () => ({
  getSessionId: () => mockGetSessionId(),
}));

import { PublicDisclaimerModal } from "./PublicDisclaimerModal";

const DISCLAIMER_CONTENT: DisclaimerContent = {
  version: "test-version",
  title: "Important Safety Information",
  warnings: [
    {
      icon: "alert",
      title: "Verify AI output",
      text: "GlycemicGPT suggestions require verification.",
    },
  ],
  checkboxes: [
    { id: "checkbox_experimental", label: "Experimental software" },
    { id: "checkbox_not_medical_advice", label: "Not medical advice" },
    { id: "checkbox_ai_data_flow", label: "Data may leave my network" },
  ],
  button_text: "Accept safety information",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSessionId.mockReturnValue("session-1");
  mockGetDisclaimerContent.mockResolvedValue(DISCLAIMER_CONTENT);
  mockGetDisclaimerStatus.mockResolvedValue({ acknowledged: false });
  mockAcknowledgeDisclaimer.mockResolvedValue({ success: true });
});

describe("PublicDisclaimerModal", () => {
  it("does not open when the current session already acknowledged it", async () => {
    mockGetDisclaimerStatus.mockResolvedValue({ acknowledged: true });

    render(<PublicDisclaimerModal />);

    await waitFor(() => {
      expect(mockGetDisclaimerStatus).toHaveBeenCalledWith("session-1");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("requires every confirmation and saves the public acknowledgment", async () => {
    const onAcknowledge = jest.fn();
    render(<PublicDisclaimerModal onAcknowledge={onAcknowledge} />);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Important Safety Information");
    expect(dialog.parentElement).toHaveClass("bg-overlay-primary");
    expect(
      screen.getByText(/Review every item before using Lumose/).parentElement,
    ).toHaveClass("pt-8");
    expect(screen.getByText("Verify AI output")).toBeInTheDocument();
    expect(
      screen.getByText("Lumose suggestions require verification."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/GlycemicGPT/)).not.toBeInTheDocument();

    const acceptButton = screen.getByRole("button", {
      name: "Accept safety information",
    });
    expect(acceptButton).toBeDisabled();

    screen.getAllByRole("checkbox").forEach((checkbox) => {
      fireEvent.click(checkbox);
    });

    expect(acceptButton).toBeEnabled();
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(mockAcknowledgeDisclaimer).toHaveBeenCalledWith({
        session_id: "session-1",
        checkbox_experimental: true,
        checkbox_not_medical_advice: true,
        checkbox_ai_data_flow: true,
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  it("uses safe fallback content when the content request fails", async () => {
    mockGetDisclaimerContent.mockRejectedValue(new Error("offline"));

    render(<PublicDisclaimerModal />);

    expect(
      await screen.findByRole("heading", {
        name: "Important Safety Information",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Photo Carb Estimates Are Guesses"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(
      screen.getByRole("button", { name: "I Understand and Accept" }),
    ).toBeDisabled();
  });
});
