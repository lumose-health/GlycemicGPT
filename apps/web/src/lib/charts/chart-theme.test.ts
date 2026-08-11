import { resolveChartPalette } from "./chart-theme";

describe("resolveChartPalette", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("uses a CSS variable fallback when the referenced token is missing", () => {
    document.documentElement.style.setProperty(
      "--color-signal-check-fill",
      "var(--missing-chart-token, #123456)",
    );

    const scope = document.createElement("div");
    document.body.appendChild(scope);

    expect(resolveChartPalette(scope).target).toBe("rgb(18, 52, 86)");
    scope.remove();
  });
});
