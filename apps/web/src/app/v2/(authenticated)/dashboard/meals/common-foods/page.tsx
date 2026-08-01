"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionLink } from "@/components/ActionLink";
import { CommonFoodCard } from "@/components/CommonFoodCard";
import { ContentPage } from "@/components/ContentPage";
import { EmptyState } from "@/components/EmptyState";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import { LoadingState } from "@/components/LoadingState";
import { MealErrorPanel, MealSafetyQualifier } from "@/components/MealDetails";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { Pagination } from "@/components/Pagination";

import { listCommonFoods, type CommonFood } from "@/lib/api";
import { classifyMealError, type MealErrorInfo } from "@/lib/meal-errors";
import { NEVER_DOSE_BASELINE_NOTE } from "@/lib/common-food-format";

const PAGE_SIZE = 50;

export default function CommonFoodsPage() {
  const [foods, setFoods] = useState<CommonFood[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [blockedInfo, setBlockedInfo] = useState<MealErrorInfo | null>(null);
  const requestIdRef = useRef(0);

  const loadData = useCallback(async (pageNumber: number) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const data = await listCommonFoods(
        PAGE_SIZE,
        (pageNumber - 1) * PAGE_SIZE,
      );
      if (requestId !== requestIdRef.current) return;
      setFoods(data.common_foods);
      setTotal(data.total);
      setBlockedInfo(null);
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return;
      const info = classifyMealError(requestError);
      if (info.retryable) {
        setError(info.message);
      } else {
        setBlockedInfo(info);
        setFoods([]);
        setTotal(0);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(page);
  }, [loadData, page]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleEdited = useCallback(() => {
    setSuccess("Common food updated.");
    void loadData(page);
  }, [loadData, page]);

  const handleDeleted = useCallback(() => {
    setSuccess("Common food deleted. Any meals linked to it stay logged.");
    if (foods.length === 1 && page > 1) {
      setPage((current) => current - 1);
    } else {
      void loadData(page);
    }
  }, [foods.length, loadData, page]);

  if (loading && foods.length === 0 && !blockedInfo) {
    return (
      <ContentPage className="max-w-3xl">
        <LoadingState label="Loading common foods..." />
      </ContentPage>
    );
  }

  return (
    <PageTransition>
      <ContentPage className="max-w-3xl">
        <ActionLink href="/dashboard/meals" variant="secondary">
          Back to Meals
        </ActionLink>

        <PageHeader
          description={
            blockedInfo
              ? "Your saved food baselines"
              : `${total} saved baseline${total === 1 ? "" : "s"}`
          }
          icon="bookmark"
          title="Common foods"
        />

        {error ? (
          <FeedbackMessage
            message={error}
            title="Common foods could not be loaded"
            variant="error"
          />
        ) : null}
        {success ? (
          <FeedbackMessage message={success} variant="success" />
        ) : null}

        {blockedInfo ? (
          <MealErrorPanel info={blockedInfo} />
        ) : (
          <>
            <MealSafetyQualifier qualifier={NEVER_DOSE_BASELINE_NOTE} />

            {foods.length === 0 ? (
              <EmptyState
                data-testid="common-food-empty"
                description="Open a logged meal and choose “Save as common food” to create a reusable baseline."
                icon="bookmark"
                title="No common foods yet"
              />
            ) : (
              <section aria-label="Common foods" className="space-y-3">
                {foods.map((food, index) => (
                  <CommonFoodCard
                    delay={Math.min(index * 0.03, 0.3)}
                    food={food}
                    key={food.id}
                    onDeleted={handleDeleted}
                    onEdited={handleEdited}
                  />
                ))}
              </section>
            )}

            <Pagination
              disabled={loading}
              onNext={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              onPrevious={() => setPage((current) => Math.max(1, current - 1))}
              page={page}
              totalPages={totalPages}
            />
          </>
        )}
      </ContentPage>
    </PageTransition>
  );
}
