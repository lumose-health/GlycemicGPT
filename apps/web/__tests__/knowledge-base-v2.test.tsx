import { act, render, screen, waitFor } from "@testing-library/react";

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
    expect(screen.getByText("1 documents, 4 chunks")).toBeInTheDocument();
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
});
