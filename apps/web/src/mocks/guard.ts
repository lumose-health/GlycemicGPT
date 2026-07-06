export function getMissingMockApiHandlerDetail(request: Request): string {
  const url = new URL(request.url);
  return `Missing mock API handler for ${request.method} ${url.pathname}`;
}
