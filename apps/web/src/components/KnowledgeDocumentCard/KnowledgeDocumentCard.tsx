import { Icon } from "@/base";
import { DestructiveButton } from "@/components/DestructiveButton";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import { LoadingState } from "@/components/LoadingState";
import { MarkdownContent } from "@/components/MarkdownContent";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusBadge } from "@/components/StatusBadge";
import type { KnowledgeDocumentCardProps } from "./KnowledgeDocumentCard.types";
import {
  getKnowledgeTierLabel,
  getKnowledgeTierVariant,
} from "./knowledge-tiers";

function isSafeSourceUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function KnowledgeDocumentCard({
  chunkError,
  chunks,
  deleting = false,
  document,
  expanded,
  loadingChunks,
  onDelete,
  onToggle,
}: KnowledgeDocumentCardProps) {
  const isUserOwned =
    document.source_type === "ai_research" ||
    document.source_type === "user_upload";
  const sourceUrl =
    document.source_url && isSafeSourceUrl(document.source_url)
      ? document.source_url
      : null;

  return (
    <article className="overflow-hidden rounded-panel border border-border-default bg-surface-elevated">
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge variant={getKnowledgeTierVariant(document.trust_tier)}>
              {getKnowledgeTierLabel(document.trust_tier)}
            </StatusBadge>
            {document.injection_risk_count > 0 ? (
              <StatusBadge variant="error">Risk flagged</StatusBadge>
            ) : null}
          </div>
          <h2 className="font_poppins font_header_4 text-foreground-primary">
            {document.source_name}
          </h2>
          {sourceUrl ? (
            <a
              className="font_metric_caption mt-1 inline-flex max-w-full items-center gap-1 text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active"
              href={sourceUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="truncate">{sourceUrl}</span>
              <Icon
                className="h-3.5 w-3.5 shrink-0"
                decorative
                icon="link-external"
              />
            </a>
          ) : null}
          <dl className="font_metric_caption mt-3 flex flex-wrap gap-x-4 gap-y-1 text-foreground-primary">
            <div>
              <dt className="sr-only">Chunks</dt>
              <dd>{document.chunk_count} chunks</dd>
            </div>
            <div>
              <dt className="sr-only">Size</dt>
              <dd>{(document.total_content_length / 1024).toFixed(1)} KB</dd>
            </div>
            <div>
              <dt className="sr-only">
                {document.last_updated ? "Updated" : "Added"}
              </dt>
              <dd>
                {document.last_updated ? "Updated" : "Added"}{" "}
                {new Date(
                  document.last_updated ?? document.first_created,
                ).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SecondaryButton
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Hide ${document.source_name} content`
                : `Preview ${document.source_name} content`
            }
            onClick={onToggle}
            size="icon"
          >
            <Icon
              className={expanded ? "h-4 w-4 -rotate-90" : "h-4 w-4 rotate-90"}
              decorative
              icon="chevron"
            />
          </SecondaryButton>
          {isUserOwned ? (
            <DestructiveButton
              aria-label={`Delete ${document.source_name}`}
              className="h-8 w-8 p-0"
              disabled={deleting}
              onClick={onDelete}
            >
              {deleting ? (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-pill border-2 border-border-default border-t-signal-error-text"
                />
              ) : (
                <Icon className="h-4 w-4" decorative icon="trash" />
              )}
            </DestructiveButton>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="space-y-4 border-t border-border-default bg-surface-primary p-4">
          {chunkError ? (
            <FeedbackMessage
              message={chunkError}
              title="Excerpts could not be loaded"
              variant="error"
            />
          ) : loadingChunks ? (
            <LoadingState
              className="min-h-32"
              label="Loading document content"
            />
          ) : chunks.length === 0 ? (
            <p className="font_poppins font_body_3 py-4 text-center text-foreground-secondary">
              No content available
            </p>
          ) : (
            chunks.map((chunk, index) => (
              <section
                className="rounded-panel border border-border-default bg-surface-elevated p-4"
                key={chunk.id}
              >
                <div className="font_metric_caption mb-3 flex flex-wrap items-center justify-between gap-2 text-foreground-primary">
                  <span>
                    Chunk {index + 1} of {chunks.length} ({chunk.content_length}{" "}
                    chars)
                  </span>
                  {chunk.injection_risk ? (
                    <span className="text-signal-error-text">
                      Injection risk
                    </span>
                  ) : null}
                </div>
                <MarkdownContent content={chunk.content} />
              </section>
            ))
          )}
        </div>
      ) : null}
    </article>
  );
}
