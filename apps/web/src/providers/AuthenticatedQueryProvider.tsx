"use client";

import {
  QueryClient,
  QueryClientContext,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useContext, useEffect, useRef, useState } from "react";

import {
  DASHBOARD_QUERY_GC_TIME,
  shouldRetryDashboardQuery,
} from "@/lib/query/dashboard";
import { useUserContext } from "@/providers/user-provider";

export function createAuthenticatedQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: DASHBOARD_QUERY_GC_TIME,
        refetchOnWindowFocus: false,
        retry: shouldRetryDashboardQuery,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function AuthenticatedQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useUserContext();
  const [queryClient] = useState(createAuthenticatedQueryClient);
  const previousUserIdRef = useRef<string | null | undefined>(undefined);
  const userId = user?.id ?? null;

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    if (
      previousUserId !== undefined &&
      previousUserId !== null &&
      previousUserId !== userId
    ) {
      queryClient.clear();
    }
    previousUserIdRef.current = userId;
  }, [queryClient, userId]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

export function useClearAuthenticatedQueryCache(): () => void {
  const queryClient = useContext(QueryClientContext);
  return () => queryClient?.clear();
}
