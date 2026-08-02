import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

jest.mock("next/link", () => {
  const Link = ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
  Link.displayName = "Link";
  return Link;
});

const mockGetDocuments = jest.fn();
const mockGetStats = jest.fn();
const mockGetChunks = jest.fn();

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  deleteKnowledgeDocument: jest.fn(),
  getKnowledgeDocumentChunks: (...args: unknown[]) => mockGetChunks(...args),
  getKnowledgeDocuments: (...args: unknown[]) => mockGetDocuments(...args),
  getKnowledgeStats: (...args: unknown[]) => mockGetStats(...args),
}));

import KnowledgeBasePage from "@/app/v2/(authenticated)/dashboard/knowledge-base/page";

describe("V2 Knowledge Base page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDocuments.mockResolvedValue({
      documents: [
        {
          chunk_count: 4,
          first_created: "2026-01-01T00:00:00Z",
          injection_risk_count: 0,
          last_updated: "2026-01-02T00:00:00Z",
          source_name: "Clinical guide",
          source_type: "authoritative",
          source_url: "https://example.com/guide",
          total_content_length: 4096,
          trust_tier: "AUTHORITATIVE",
        },
      ],
      total_documents: 1,
    });
    mockGetStats.mockResolvedValue({
      by_tier: { AUTHORITATIVE: 4 },
      total_chunks: 4,
      total_documents: 1,
    });
  });

  it("renders document data with the redesigned filters", async () => {
    await act(async () => {
      render(<KnowledgeBasePage />);
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Knowledge Base" }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("searchbox", { name: "Search knowledge base" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Trust tier")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Clinical guide" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Manage the clinical references and documents used to ground your AI insights.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the empty setup path", async () => {
    mockGetDocuments.mockResolvedValue({
      documents: [],
      total_documents: 0,
    });
    mockGetStats.mockResolvedValue({
      by_tier: {},
      total_chunks: 0,
      total_documents: 0,
    });

    await act(async () => {
      render(<KnowledgeBasePage />);
    });

    expect(
      await screen.findByRole("heading", { name: "No Knowledge Yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Configure Research Sources" }),
    ).toHaveAttribute("href", "/settings/ai");
  });

  it("keeps the newest search result when requests resolve out of order", async () => {
    jest.useFakeTimers();
    let resolveOld: (value: unknown) => void;
    let resolveNew: (value: unknown) => void;
    const oldRequest = new Promise((resolve) => {
      resolveOld = resolve;
    });
    const newRequest = new Promise((resolve) => {
      resolveNew = resolve;
    });

    render(<KnowledgeBasePage />);
    await act(async () => {
      await Promise.resolve();
    });
    await screen.findByRole("heading", { name: "Clinical guide" });

    mockGetDocuments.mockImplementation(
      ({ search }: { search?: string }) =>
        search === "old" ? oldRequest : newRequest,
    );

    const searchInput = screen.getByRole("searchbox", {
      name: "Search knowledge base",
    });
    fireEvent.change(searchInput, { target: { value: "old" } });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.change(searchInput, { target: { value: "new" } });
    act(() => {
      jest.advanceTimersByTime(300);
    });

    await act(async () => {
      resolveNew!({
        documents: [
          {
            chunk_count: 1,
            first_created: "2026-01-01T00:00:00Z",
            injection_risk_count: 0,
            last_updated: "2026-01-02T00:00:00Z",
            source_name: "New result",
            source_type: "authoritative",
            source_url: "https://example.com/new",
            total_content_length: 100,
            trust_tier: "AUTHORITATIVE",
          },
        ],
        total_documents: 1,
      });
    });
    expect(await screen.findByRole("heading", { name: "New result" })).toBeVisible();

    await act(async () => {
      resolveOld!({
        documents: [
          {
            chunk_count: 1,
            first_created: "2026-01-01T00:00:00Z",
            injection_risk_count: 0,
            last_updated: "2026-01-02T00:00:00Z",
            source_name: "Old result",
            source_type: "authoritative",
            source_url: "https://example.com/old",
            total_content_length: 100,
            trust_tier: "AUTHORITATIVE",
          },
        ],
        total_documents: 1,
      });
    });

    expect(screen.getByRole("heading", { name: "New result" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Old result" })).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  it("does not start duplicate chunk requests while one is pending", async () => {
    mockGetChunks.mockReturnValue(new Promise(() => {}));

    render(<KnowledgeBasePage />);

    const toggle = await screen.findByRole("button", {
      name: /Clinical guide/i,
    });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(mockGetChunks).toHaveBeenCalledTimes(1);
  });
});
