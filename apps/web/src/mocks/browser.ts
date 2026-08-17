import type { SetupWorker } from "msw/browser";

interface MockWorkerRuntime {
  startPromise: Promise<void> | null;
  activeWorker: SetupWorker | null;
}

const MOCK_WORKER_RUNTIME_KEY = "__glycemicgptMockWorkerRuntime";

function getMockWorkerRuntime(): MockWorkerRuntime {
  const scope = globalThis as typeof globalThis & {
    [MOCK_WORKER_RUNTIME_KEY]?: MockWorkerRuntime;
  };

  scope[MOCK_WORKER_RUNTIME_KEY] ??= {
    startPromise: null,
    activeWorker: null,
  };
  return scope[MOCK_WORKER_RUNTIME_KEY];
}

export async function startMockWorker(): Promise<void> {
  if (
    process.env.NODE_ENV !== "development" ||
    typeof window === "undefined"
  ) {
    return;
  }

  const runtime = getMockWorkerRuntime();
  if (runtime.startPromise) {
    await runtime.startPromise;
    const { handlers } = await import("./handlers");
    runtime.activeWorker?.resetHandlers(...handlers);
    return;
  }

  runtime.startPromise = (async () => {
    try {
      const { setupWorker } = await import("msw/browser");
      const { handlers } = await import("./handlers");

      runtime.activeWorker = setupWorker(...handlers);
      await runtime.activeWorker.start({
        onUnhandledRequest(request, print) {
          const url = new URL(request.url);
          if (url.pathname.startsWith("/api/")) {
            print.error();
            return;
          }
          print.warning();
        },
        serviceWorker: {
          url: "/mockServiceWorker.js",
        },
      });
    } catch (error) {
      // Clear the guard so a failed start can be retried.
      runtime.startPromise = null;
      runtime.activeWorker = null;
      throw error;
    }
  })();

  return runtime.startPromise;
}
