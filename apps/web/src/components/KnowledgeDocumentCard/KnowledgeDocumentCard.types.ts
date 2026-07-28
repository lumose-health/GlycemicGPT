import type {
  KnowledgeChunkItem,
  KnowledgeDocument,
} from "@/lib/api";

export interface KnowledgeDocumentCardProps {
  chunks: KnowledgeChunkItem[];
  deleting?: boolean;
  document: KnowledgeDocument;
  expanded: boolean;
  loadingChunks: boolean;
  onDelete: () => void;
  onToggle: () => void;
}
