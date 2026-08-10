import type { StatusBadgeVariant } from "@/components/StatusBadge";

export const KNOWLEDGE_TIERS = [
  { label: "Authoritative", value: "AUTHORITATIVE" },
  { label: "AI Researched", value: "RESEARCHED" },
  { label: "User Upload", value: "USER_PROVIDED" },
  { label: "Extracted", value: "EXTRACTED" },
] as const;

const TIER_VARIANTS: Record<string, StatusBadgeVariant> = {
  AUTHORITATIVE: "success",
  RESEARCHED: "neutral",
  USER_PROVIDED: "warning",
  EXTRACTED: "neutral",
};

export function getKnowledgeTierLabel(tier: string) {
  return KNOWLEDGE_TIERS.find((option) => option.value === tier)?.label ?? tier;
}

export function getKnowledgeTierVariant(tier: string) {
  return TIER_VARIANTS[tier] ?? "neutral";
}
