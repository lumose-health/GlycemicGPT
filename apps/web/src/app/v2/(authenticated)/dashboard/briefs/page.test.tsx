import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { apiFetch } from "@/lib/api";
import BriefsPage from "./page";

jest.mock("@/lib/api", () => ({
  apiFetch: jest.fn(),
  getApiBaseUrl: () => "",
  getInsightDetail: jest.fn(),
}));

jest.mock("@/components/AIInsightCard", () => ({
  AIInsightCard: ({ insight }: { insight: { title: string } }) => (
    <article>{insight.title}</article>
  ),
}));

const mockApiFetch = jest.mocked(apiFetch);

function createInsight(
  index: number,
  analysisType: "daily_brief" | "meal_analysis",
) {
  return {
    analysis_type: analysisType,
    content: `Content ${index}`,
    created_at: `2026-08-01T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
    id: `insight-${index}`,
    status: "pending" as const,
    title: `${analysisType === "daily_brief" ? "Brief" : "Meal"} ${index}`,
  };
}

describe("BriefsPage", () => {
  it("uses server filtered totals and results beyond the first 50 insights", async () => {
    const dailyBriefs = Array.from({ length: 35 }, (_, index) =>
      createInsight(index, "daily_brief"),
    );
    const mealInsights = Array.from({ length: 40 }, (_, index) =>
      createInsight(index + 35, "meal_analysis"),
    );
    const allInsights = [...dailyBriefs, ...mealInsights];

    mockApiFetch.mockImplementation(async (url) => {
      const isDailyRequest = String(url).includes("analysis_type=daily_brief");
      return {
        json: async () =>
          isDailyRequest
            ? { insights: dailyBriefs, total: dailyBriefs.length }
            : { insights: allInsights, total: allInsights.length },
        ok: true,
        status: 200,
      } as Response;
    });

    render(<BriefsPage />);

    expect(
      await screen.findByText("Showing 75 of 75 insights"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /All Insights.*75/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Daily Briefs.*35/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Daily Briefs.*35/ }));

    expect(
      screen.getByText("Showing 35 of 35 daily briefs"),
    ).toBeInTheDocument();
    expect(screen.getByText("Brief 34")).toBeInTheDocument();
    expect(screen.queryByText("Meal 35")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith("/api/ai/insights?limit=100");
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/ai/insights?limit=100&analysis_type=daily_brief",
      );
    });
  });
});
