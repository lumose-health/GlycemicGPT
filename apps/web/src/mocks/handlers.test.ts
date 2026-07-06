import { readFileSync } from "fs";
import { join } from "path";

import { getMissingMockApiHandlerDetail } from "./guard";

describe("mock API handlers", () => {
  it("registers a fail closed API guard", () => {
    const source = readFileSync(join(__dirname, "handlers.ts"), "utf8");

    expect(source).toContain("http.all(`${API}/*`");
    expect(source).toContain("getMissingMockApiHandlerDetail(request)");
  });

  it("describes API routes without explicit handlers", () => {
    const detail = getMissingMockApiHandlerDetail(
      {
        method: "POST",
        url: "http://localhost/api/mock-uncovered-route",
      } as Request
    );

    expect(detail).toBe(
      "Missing mock API handler for POST /api/mock-uncovered-route"
    );
  });
});
