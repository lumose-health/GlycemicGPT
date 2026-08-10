"use client";

import { QueryClientContext } from "@tanstack/react-query";
import { useCallback, useContext } from "react";

import {
  dashboardQueryKeys,
  invalidateDashboardResources,
  type DashboardResource,
} from "@/lib/query/dashboard";
import { useUserContext } from "@/providers/user-provider";

export function useDashboardInvalidation() {
  const queryClient = useContext(QueryClientContext);
  const { user } = useUserContext();

  const invalidateResources = useCallback(
    async (resources: readonly DashboardResource[]) => {
      if (!queryClient || !user?.id) return;
      await invalidateDashboardResources(queryClient, user.id, resources);
    },
    [queryClient, user?.id],
  );

  const invalidateAll = useCallback(async () => {
    if (!queryClient || !user?.id) return;
    await queryClient.invalidateQueries({
      queryKey: dashboardQueryKeys.all(user.id),
    });
  }, [queryClient, user?.id]);

  return { invalidateAll, invalidateResources };
}
