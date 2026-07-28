"use client";

/**
 * Meals list.
 *
 * Lists the user's food records (most recent first) and hosts the web meal
 * upload. Modelled on the Knowledge Base page (list -> detail -> delete ->
 * pagination). Owner-scoped + flag-gated server-side; a feature-off response is
 * rendered as a clear state, never a raw 404.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { listFoodRecords, type FoodRecord } from "@/lib/api";
import { classifyMealError, type MealErrorInfo } from "@/lib/meal-errors";
import { mealTitle } from "@/lib/meal-format";
import { ActionLink } from "@/components/ActionLink";
import { ContentPage } from "@/components/ContentPage";
import { EmptyState } from "@/components/EmptyState";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import { LoadingState } from "@/components/LoadingState";
import { MealCard } from "@/components/MealCard";
import { MealErrorPanel } from "@/components/MealDetails";
import { MealUpload } from "@/components/MealUpload";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { Pagination } from "@/components/Pagination";

const PAGE_SIZE = 50;

export default function MealsPage() {
  const [records, setRecords] = useState<FoodRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // A non-retryable dead end (feature off) replaces the list entirely.
  const [blockedInfo, setBlockedInfo] = useState<MealErrorInfo | null>(null);
  // Guards against out-of-order resolution: only the latest fetch may apply.
  const requestIdRef = useRef(0);

  const loadData = useCallback(async (pageNum: number) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await listFoodRecords(PAGE_SIZE, (pageNum - 1) * PAGE_SIZE);
      if (requestId !== requestIdRef.current) return;
      setRecords(data.records);
      setTotal(data.total);
      setBlockedInfo(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const info = classifyMealError(err);
      if (info.retryable) {
        setError(info.message);
      } else {
        setBlockedInfo(info);
        setRecords([]);
        setTotal(0);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(page);
  }, [loadData, page]);

  // Auto-dismiss the upload success banner so it never lingers across reloads.
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleUploaded = useCallback(
    (record: FoodRecord) => {
      setSuccess(`Logged: ${mealTitle(record)}`);
      setBlockedInfo(null);
      if (page === 1) {
        loadData(1);
      } else {
        setPage(1);
      }
    },
    [page, loadData]
  );

  if (loading && records.length === 0 && !blockedInfo) {
    return (
      <ContentPage>
        <LoadingState label="Loading meals..." />
      </ContentPage>
    );
  }

  return (
    <PageTransition>
      <ContentPage>
        <PageHeader
          actions={
            !blockedInfo ? (
              <>
                <MealUpload
                  onUploaded={handleUploaded}
                  onFeatureOff={() => loadData(1)}
                />
                <ActionLink
                  data-testid="meals-common-foods-link"
                  href="/dashboard/meals/common-foods"
                  variant="secondary"
                >
                Common foods
                </ActionLink>
              </>
            ) : null
          }
          description={
            blockedInfo
              ? "Your meal photo log"
              : `${total} logged meal${total === 1 ? "" : "s"}`
          }
          icon="fork-knife"
          title="Meals"
        />

        {error ? (
          <FeedbackMessage
            message={error}
            title="Meals could not be loaded"
            variant="error"
          />
        ) : null}
        {success ? (
          <FeedbackMessage message={success} variant="success" />
        ) : null}

        {blockedInfo ? (
          <MealErrorPanel info={blockedInfo} />
        ) : records.length === 0 ? (
          <EmptyState
            data-testid="meal-empty"
            description="Use “Log a meal” to add a photo and get a rough AI carb estimate."
            icon="fork-knife"
            title="No meals logged yet"
          />
        ) : (
          <div className="space-y-3">
            {records.map((record, i) => (
              <MealCard
                delay={Math.min(i * 0.03, 0.3)}
                key={record.id}
                record={record}
              />
            ))}
          </div>
        )}

        {!blockedInfo ? (
          <Pagination
            disabled={loading}
            onNext={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            onPrevious={() =>
              setPage((current) => Math.max(1, current - 1))
            }
            page={page}
            totalPages={totalPages}
          />
        ) : null}
      </ContentPage>
    </PageTransition>
  );
}
