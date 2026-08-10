const mockNotFound = jest.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

jest.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
}));

jest.mock("./DesignSystemPage", () => ({
  DesignSystemPage: () => <div>Design system</div>,
}));

import Page from "./page";

describe("design system route", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: originalNodeEnv,
    });
    jest.clearAllMocks();
  });

  it("returns not found outside development", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: "production",
    });

    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("renders in development", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: "development",
    });

    expect(await Page()).not.toBeNull();
    expect(mockNotFound).not.toHaveBeenCalled();
  });
});
