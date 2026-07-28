"use client";

import { useState, useEffect, useCallback } from "react";
import { ActionLink } from "@/components/ActionLink";
import { ContentPage } from "@/components/ContentPage";
import { EmptyState } from "@/components/EmptyState";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import {
  KNOWLEDGE_TIERS,
  KnowledgeDocumentCard,
} from "@/components/KnowledgeDocumentCard";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { Pagination } from "@/components/Pagination";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SelectField } from "@/components/SelectField";
import { TextInput } from "@/components/TextInput";
import {
  getKnowledgeDocuments,
  getKnowledgeDocumentChunks,
  deleteKnowledgeDocument,
  getKnowledgeStats,
  type KnowledgeDocument,
  type KnowledgeChunkItem,
  type KnowledgeStats,
} from "@/lib/api";

export default function KnowledgeBasePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Expanded documents
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [docChunks, setDocChunks] = useState<Record<string, KnowledgeChunkItem[]>>({});
  const [loadingChunks, setLoadingChunks] = useState<Set<string>>(new Set());

  const docKey = (doc: KnowledgeDocument) => `${doc.source_name}||${doc.source_url || ""}`;

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const PAGE_SIZE = 20;

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [docsData, statsData] = await Promise.all([
        getKnowledgeDocuments({
          trust_tier: tierFilter || undefined,
          search: debouncedSearch || undefined,
          page,
          page_size: PAGE_SIZE,
        }),
        getKnowledgeStats(),
      ]);
      setDocuments(docsData.documents);
      setStats(statsData);
      setTotalPages(Math.max(1, Math.ceil(docsData.total_documents / PAGE_SIZE)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load knowledge base");
    } finally {
      setLoading(false);
    }
  }, [tierFilter, debouncedSearch, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleExpand = useCallback((doc: KnowledgeDocument) => {
    const key = docKey(doc);

    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

    // Load chunks if expanding and not already loaded (uses functional update to avoid stale closure)
    setDocChunks((currentChunks) => {
      if (currentChunks[key]) return currentChunks; // Already loaded

      // Check if we're expanding (not collapsing)
      setExpandedDocs((currentExpanded) => {
        if (currentExpanded.has(key) && !currentChunks[key]) {
          setLoadingChunks((prev) => new Set(prev).add(key));
          getKnowledgeDocumentChunks(doc.source_name, doc.source_url)
            .then((data) => {
              setDocChunks((prev) => ({ ...prev, [key]: data.chunks }));
            })
            .catch(() => {
              setDocChunks((prev) => ({ ...prev, [key]: [] }));
            })
            .finally(() => {
              setLoadingChunks((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
              });
            });
        }
        return currentExpanded; // Don't modify, just read
      });

      return currentChunks; // Don't modify, just trigger the check
    });
  }, []);

  const handleDelete = useCallback(async (doc: KnowledgeDocument) => {
    const key = docKey(doc);
    if (deleting) return; // Prevent double-click
    if (!confirm(`Delete "${doc.source_name}"? This will remove all ${doc.chunk_count} chunks from the knowledge base.`)) {
      return;
    }
    setDeleting(key);
    setError(null);
    try {
      const result = await deleteKnowledgeDocument(doc.source_name, doc.source_url);
      setSuccess(`Deleted: ${result.chunks_invalidated} chunks removed`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document");
    } finally {
      setDeleting(null);
    }
  }, [loadData, deleting]);

  if (loading) {
    return (
      <ContentPage>
        <LoadingState label="Loading knowledge base..." />
      </ContentPage>
    );
  }

  return (
    <PageTransition>
      <ContentPage>
        <PageHeader
          actions={
            <>
              <SecondaryButton onClick={loadData}>Refresh</SecondaryButton>
              <SecondaryButton
                disabled
                title="Coming in a future update"
              >
                Upload Document
              </SecondaryButton>
            </>
          }
          description={
            stats
              ? `${stats.total_documents} documents, ${stats.total_chunks} chunks`
              : "Your AI's clinical knowledge and reference materials"
          }
          icon="book-open"
          title="Knowledge Base"
        />

        {error ? (
          <FeedbackMessage
            message={error}
            title="Knowledge base could not be loaded"
            variant="error"
          />
        ) : null}
        {success ? (
          <FeedbackMessage message={success} variant="success" />
        ) : null}

        <section
          aria-label="Knowledge base filters"
          className="space-y-4 rounded-panel border border-border-default bg-surface-elevated p-4"
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <TextInput
              label="Search knowledge base"
              labelClassName="sr-only"
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search knowledge base..."
              type="search"
              value={searchText}
            />
            <SelectField
              label="Trust tier"
              onChange={(event) => setTierFilter(event.target.value)}
              options={[
                { label: "All Tiers", value: "" },
                ...KNOWLEDGE_TIERS.map((option) => ({
                  label: option.label,
                  value: option.value,
                })),
              ]}
              value={tierFilter}
              visuallyHideLabel
            />
          </div>

          {stats && Object.keys(stats.by_tier).length > 0 ? (
            <SegmentedControl
              aria-label="Filter by trust tier"
              className="w-full"
              onChange={setTierFilter}
              options={[
                { label: "All tiers", value: "" },
                ...KNOWLEDGE_TIERS.filter(
                  (tier) => stats.by_tier[tier.value] !== undefined,
                ).map((tier) => ({
                  label: tier.label,
                  meta: `${stats.by_tier[tier.value]} chunks`,
                  value: tier.value,
                })),
              ]}
              value={tierFilter}
            />
          ) : null}
        </section>

        {documents.length === 0 ? (
          <EmptyState
            action={
              !searchText && !tierFilter ? (
                <ActionLink href="/settings/ai">
                  Configure Research Sources
                </ActionLink>
              ) : null
            }
            description={
              searchText || tierFilter
                ? "No documents match your search criteria."
                : "Your AI's knowledge base is empty. Configure research sources to start building it."
            }
            icon="book-open"
            title="No Knowledge Yet"
          />
        ) : (
          <section aria-label="Knowledge documents" className="space-y-3">
            {documents.map((document) => {
              const key = docKey(document);
              return (
                <KnowledgeDocumentCard
                  chunks={docChunks[key] || []}
                  deleting={deleting === key}
                  document={document}
                  expanded={expandedDocs.has(key)}
                  key={key}
                  loadingChunks={loadingChunks.has(key)}
                  onDelete={() => handleDelete(document)}
                  onToggle={() => handleToggleExpand(document)}
                />
              );
            })}
          </section>
        )}

        <Pagination
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          page={page}
          totalPages={totalPages}
        />
      </ContentPage>
    </PageTransition>
  );
}
