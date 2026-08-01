import type {
  MockApiTestDefinition,
  MockApiTestResult,
} from "./api-controls.types";

export const MOCK_API_TESTS: MockApiTestDefinition[] = [
  {
    description: "Fetch the current mocked user profile.",
    expectedStatus: 200,
    id: "current-user",
    label: "Current user",
    path: "/api/auth/me",
  },
  {
    description: "Fetch every configured device integration.",
    expectedStatus: 200,
    id: "integrations",
    label: "Integrations",
    path: "/api/integrations",
  },
  {
    description: "Fetch the latest hour of mocked CGM readings.",
    expectedStatus: 200,
    id: "glucose-history",
    label: "Glucose history",
    path: "/api/integrations/glucose/history?minutes=60&limit=12",
  },
  {
    description: "Fetch the current mocked insulin delivery status.",
    expectedStatus: 200,
    id: "pump-status",
    label: "Pump status",
    path: "/api/integrations/pump/status",
  },
  {
    description: "Generate and persist a mocked daily brief.",
    expectedStatus: 200,
    id: "generate-brief",
    label: "Generate daily brief",
    path: "/api/ai/briefs/generate",
    requestInit: {
      body: JSON.stringify({ hours: 24 }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  },
  {
    description: "Confirm uncovered API routes fail closed.",
    expectedStatus: 501,
    id: "missing-handler",
    label: "Missing handler guard",
    path: "/api/mock-uncovered-route",
    requestInit: { method: "POST" },
  },
];

export async function runMockApiTest(
  test: MockApiTestDefinition,
): Promise<MockApiTestResult> {
  try {
    const response = await fetch(test.path, test.requestInit);
    const passed = response.status === test.expectedStatus;
    const statusText = response.statusText
      ? `${response.status} ${response.statusText}`
      : String(response.status);

    return {
      id: test.id,
      message: passed
        ? `PASS ${statusText}`
        : `FAIL ${statusText}, expected ${test.expectedStatus}`,
      passed,
      status: response.status,
    };
  } catch (error) {
    return {
      id: test.id,
      message: `FAIL ${error instanceof Error ? error.message : "Request failed"}`,
      passed: false,
      status: null,
    };
  }
}
