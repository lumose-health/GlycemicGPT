import type { SetupWorker } from "msw/browser";

let worker: SetupWorker | null = null;
let startPromise: Promise<void> | null = null;
let startGeneration = 0;

export async function startMockWorker(): Promise<void> {
  if (
    process.env.NODE_ENV !== "development" ||
    typeof window === "undefined"
  ) {
    return;
  }

  if (startPromise) {
    return startPromise;
  }

  // Tag this attempt so a stopMockWorker() call (which bumps the generation)
  // can invalidate a start that is still resolving in the background.
  const generation = ++startGeneration;

  startPromise = (async () => {
    try {
      const { setupWorker } = await import("msw/browser");
      const { handlers } = await import("./handlers");

      // A stopMockWorker() call during the async imports supersedes this attempt.
      if (generation !== startGeneration) {
        return;
      }

      const activeWorker = setupWorker(...handlers);
      await activeWorker.start({
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

      // A stopMockWorker() call during worker.start() supersedes this attempt;
      // tear the freshly started worker back down instead of reactivating it.
      if (generation !== startGeneration) {
        activeWorker.stop();
        return;
      }

      worker = activeWorker;
    } catch (error) {
      // Clear the guard so a failed start can be retried, but only when this
      // attempt is still current so a stale failure cannot wipe a newer one.
      if (generation === startGeneration) {
        startPromise = null;
      }
      throw error;
    }
  })();

  return startPromise;
}

export function stopMockWorker(): void {
  startGeneration++;
  worker?.stop();
  worker = null;
  startPromise = null;
}
