export type MockApiTestId =
  | "current-user"
  | "integrations"
  | "glucose-history"
  | "pump-status"
  | "generate-brief"
  | "missing-handler";

export interface MockApiTestDefinition {
  description: string;
  expectedStatus: number;
  id: MockApiTestId;
  label: string;
  requestInit?: RequestInit;
  path: string;
}

export interface MockApiTestResult {
  id: MockApiTestId;
  message: string;
  passed: boolean;
  status: number | null;
}
