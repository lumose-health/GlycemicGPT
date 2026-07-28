import { fireEvent, render, screen } from "@testing-library/react";
import type { KnowledgeDocument } from "@/lib/api";
import { KnowledgeDocumentCard } from "./KnowledgeDocumentCard";

const document: KnowledgeDocument = {
  chunk_count: 2,
  first_created: "2026-01-01T00:00:00Z",
  injection_risk_count: 0,
  last_updated: "2026-01-02T00:00:00Z",
  change_summary: null,
  source_name: "Clinical guide",
  source_type: "user_upload",
  source_url: "https://example.com/guide",
  total_content_length: 2048,
  trust_tier: "AUTHORITATIVE",
  update_source: null,
};

describe("KnowledgeDocumentCard", () => {
  it("renders document metadata and emits preview and delete actions", () => {
    const onDelete = jest.fn();
    const onToggle = jest.fn();
    render(
      <KnowledgeDocumentCard
        chunks={[]}
        document={document}
        expanded={false}
        loadingChunks={false}
        onDelete={onDelete}
        onToggle={onToggle}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Clinical guide" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Authoritative")).toBeInTheDocument();
    expect(screen.getByText("2 chunks")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Preview Clinical guide content",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Clinical guide" }),
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("renders expanded chunk content and its safety status", () => {
    render(
      <KnowledgeDocumentCard
        chunks={[
          {
            content: "**Review this**",
            content_preview: "Review this",
            content_length: 15,
            created_at: "2026-01-01T00:00:00Z",
            id: "chunk-1",
            injection_risk: true,
            retrieved_at: null,
            source_url: null,
          },
        ]}
        document={document}
        expanded
        loadingChunks={false}
        onDelete={jest.fn()}
        onToggle={jest.fn()}
      />,
    );

    expect(screen.getByTestId("markdown-content")).toHaveTextContent(
      "**Review this**",
    );
    expect(screen.getByText("Injection risk")).toBeInTheDocument();
  });
});
