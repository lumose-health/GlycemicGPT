import { headers } from "next/headers";

const MOCK_RUNTIME_HEADER = "x-glycemicgpt-mock-api";

export async function getInitialMockRuntimeEnabled(): Promise<boolean> {
  if (process.env.NODE_ENV !== "development") {
    return false;
  }

  const requestHeaders = await headers();
  return requestHeaders.get(MOCK_RUNTIME_HEADER) === "1";
}
