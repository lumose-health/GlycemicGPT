let startPromise: Promise<void> | null = null;

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

  startPromise = (async () => {
    try {
      const { setupWorker } = await import("msw/browser");
      const { handlers } = await import("./handlers");

      const worker = setupWorker(...handlers);
      await worker.start({
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
      startPromise = null;
      throw error;
    }
  })();

  return startPromise;
}
