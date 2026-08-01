"use client";

import { useState, useEffect, useCallback } from "react";
import { AIInsightCard, type InsightData } from "@/components/AIInsightCard";
import { ContentPage } from "@/components/ContentPage";
import { EmptyState } from "@/components/EmptyState";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SegmentedControl } from "@/components/SegmentedControl";

import {
  apiFetch,
  getInsightDetail,
  getApiBaseUrl,
  type InsightDetail,
} from "@/lib/api";

interface InsightsResponse {
  insights: InsightData[];
  total: number;
}

type FilterMode = "all" | "daily_brief";

export default function BriefsPage() {
  const [insights, setInsights] = useState<InsightData[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");

  const fetchInsights = useCallback(async () => {
    try {
      setError(null);
      const response = await apiFetch(
        `${getApiBaseUrl()}/api/ai/insights?limit=50`,
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch insights: ${response.status}`);
      }

      const data: InsightsResponse = await response.json();
      setInsights(data.insights);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load insights");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const handleRespond = async (
    analysisType: string,
    analysisId: string,
    response: "acknowledged" | "dismissed",
    reason?: string,
  ) => {
    const res = await apiFetch(
      `${getApiBaseUrl()}/api/ai/insights/${analysisType}/${analysisId}/respond`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, reason }),
      },
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || "Failed to respond");
    }
  };

  const handleFetchDetail = async (
    analysisType: string,
    analysisId: string,
  ): Promise<InsightDetail> => {
    return getInsightDetail(analysisType, analysisId);
  };

  const filteredInsights =
    filter === "all"
      ? insights
      : insights.filter((i) => i.analysis_type === filter);

  const briefCount = insights.filter(
    (i) => i.analysis_type === "daily_brief",
  ).length;

  const pendingBriefCount = insights.filter(
    (i) => i.analysis_type === "daily_brief" && i.status === "pending",
  ).length;

  const refresh = () => {
    setIsLoading(true);
    fetchInsights();
  };

  return (
    <PageTransition>
      <ContentPage>
        <PageHeader
          actions={
            !isLoading ? (
              <SecondaryButton aria-label="Refresh insights" onClick={refresh}>
                Refresh
              </SecondaryButton>
            ) : null
          }
          description={
            filter === "daily_brief"
              ? "AI-generated daily summaries of your glucose data"
              : "AI-powered analysis of your glucose patterns"
          }
          icon="lightbulb"
          title={filter === "daily_brief" ? "Daily Briefs" : "AI Insights"}
        />

        {!isLoading && !error && insights.length > 0 ? (
          <SegmentedControl
            aria-label="Filter insights"
            onChange={setFilter}
            options={[
              {
                label: "All Insights",
                meta: `(${insights.length})`,
                value: "all",
              },
              {
                label: "Daily Briefs",
                meta: (
                  <>
                    <span>({briefCount})</span>
                    {pendingBriefCount > 0 ? (
                      <span className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-surface-fixed-critical px-1 text-foreground-fixed-light">
                        {pendingBriefCount}
                      </span>
                    ) : null}
                  </>
                ),
                value: "daily_brief",
              },
            ]}
            value={filter}
          />
        ) : null}

        {isLoading ? <LoadingState label="Loading insights..." /> : null}

        {error && !isLoading ? (
          <FeedbackMessage
            actionLabel="Try again"
            message={error}
            onAction={refresh}
            title="Insights could not be loaded"
            variant="error"
          />
        ) : null}

        {!isLoading && !error && insights.length === 0 ? (
          <EmptyState
            description="AI insights will appear here once you have enough glucose data. Connect your Dexcom CGM and Tandem pump to get started."
            icon="lightbulb"
            title="No Insights Yet"
          />
        ) : null}

        {!isLoading &&
        !error &&
        insights.length > 0 &&
        filteredInsights.length === 0 ? (
          <EmptyState
            aria-label="Daily briefs"
            description="Daily briefs will appear here once they are generated. Check your brief delivery settings to configure when they are sent."
            icon="lightbulb"
            role="tabpanel"
            title="No Daily Briefs Yet"
          />
        ) : null}

        {!isLoading && !error && filteredInsights.length > 0 ? (
          <section aria-label="Insights" role="tabpanel">
            <p className="font_poppins font_body_3 mb-4 text-foreground-secondary">
              Showing {filteredInsights.length}
              {filter !== "all" ? " daily briefs" : ""} of {total} insights
            </p>
            <div className="grid gap-4">
              {filteredInsights.map((insight) => (
                <AIInsightCard
                  insight={insight}
                  key={insight.id}
                  onFetchDetail={handleFetchDetail}
                  onRespond={handleRespond}
                />
              ))}
            </div>
          </section>
        ) : null}
      </ContentPage>
    </PageTransition>
  );
}
