import { parseConnectionTarget } from "./connection-target";

describe("connection target parsing", () => {
  it("accepts only declared own connection targets", () => {
    expect(parseConnectionTarget("glooko")).toBe("glooko");
    expect(parseConnectionTarget(["glooko", "ignored"])).toBe("glooko");
    expect(parseConnectionTarget("constructor")).toBeUndefined();
    expect(parseConnectionTarget("toString")).toBeUndefined();
    expect(parseConnectionTarget(undefined)).toBeUndefined();
  });
});
