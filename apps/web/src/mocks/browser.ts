import type { SetupWorker } from "msw/browser";

let worker: SetupWorker | null = null;
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

  startPromise = import("msw/browser").then(async ({ setupWorker }) => {
    const { handlers } = await import("./handlers");
    worker = setupWorker(...handlers);
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
  });

  return startPromise;
}

export function stopMockWorker(): void {
  worker?.stop();
  worker = null;
  startPromise = null;
}
