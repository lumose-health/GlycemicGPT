import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";

import { useUserContext } from "@/providers/user-provider";

import { AuthenticatedQueryProvider } from "./AuthenticatedQueryProvider";

jest.mock("@/providers/user-provider", () => ({
  useUserContext: jest.fn(),
}));

const mockUseUserContext = jest.mocked(useUserContext);

function Probe({ onClient }: { onClient: (client: QueryClient) => void }) {
  const client = useQueryClient();
  useEffect(() => onClient(client), [client, onClient]);
  return null;
}

describe("AuthenticatedQueryProvider", () => {
  it("does not clear queries when the initial user identity becomes available", async () => {
    let activeUserId: string | null = null;
    let client: QueryClient | undefined;
    mockUseUserContext.mockImplementation(
      () =>
        ({
          user: activeUserId ? { id: activeUserId } : null,
          isLoading: activeUserId === null,
          error: null,
          refreshUser: jest.fn(),
        }) as unknown as ReturnType<typeof useUserContext>,
    );
    const onClient = (nextClient: QueryClient) => {
      client = nextClient;
    };
    const view = render(
      <AuthenticatedQueryProvider>
        <Probe onClient={onClient} />
      </AuthenticatedQueryProvider>,
    );
    await waitFor(() => expect(client).toBeDefined());

    act(() => {
      client?.setQueryData(["public-bootstrap"], { ready: true });
    });
    activeUserId = "user-1";
    view.rerender(
      <AuthenticatedQueryProvider>
        <Probe onClient={onClient} />
      </AuthenticatedQueryProvider>,
    );

    await waitFor(() =>
      expect(client?.getQueryData(["public-bootstrap"])).toEqual({
        ready: true,
      }),
    );
  });

  it("clears cached user data when the authenticated user changes", async () => {
    let activeUserId = "user-1";
    let client: QueryClient | undefined;
    mockUseUserContext.mockImplementation(
      () =>
        ({
          user: { id: activeUserId },
          isLoading: false,
          error: null,
          refreshUser: jest.fn(),
        }) as unknown as ReturnType<typeof useUserContext>,
    );
    const onClient = (nextClient: QueryClient) => {
      client = nextClient;
    };
    const view = render(
      <AuthenticatedQueryProvider>
        <Probe onClient={onClient} />
      </AuthenticatedQueryProvider>,
    );
    await waitFor(() => expect(client).toBeDefined());

    act(() => {
      client?.setQueryData(["dashboard", "user-1", "forecast"], {
        secret: true,
      });
    });
    expect(client?.getQueryCache().getAll()).toHaveLength(1);

    activeUserId = "user-2";
    view.rerender(
      <AuthenticatedQueryProvider>
        <Probe onClient={onClient} />
      </AuthenticatedQueryProvider>,
    );

    await waitFor(() =>
      expect(client?.getQueryCache().getAll()).toHaveLength(0),
    );
  });
});
