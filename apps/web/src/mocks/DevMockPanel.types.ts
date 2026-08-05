import type { MockApiTestId, MockApiTestResult } from "./api-controls.types";

export interface DevMockPanelProps {
  runtimeActive?: boolean;
}

export type MockControlTab =
  | "connections"
  | "glucose-event"
  | "knowledge-base"
  | "ai-chat"
  | "notifications"
  | "api";

export type ConnectionTab = "cgm" | "pump";

export type MockApiTestRunState = MockApiTestResult | "running";

export type MockApiTestResults = Partial<
  Record<MockApiTestId, MockApiTestRunState>
>;
