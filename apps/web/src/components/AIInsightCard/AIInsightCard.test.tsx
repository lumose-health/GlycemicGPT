import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AIInsightCard } from "./AIInsightCard";
import type { InsightData } from "./AIInsightCard.types";

const insight: InsightData = {
  id: "insight-1",
  analysis_type: "daily_brief",
  title: "Glucose patterns",
  content: "Your overnight glucose stayed stable.",
  created_at: "2026-07-25T08:00:00Z",
  status: "pending",
};

describe("AIInsightCard", () => {
  it("renders an accessible article and medical disclaimer", () => {
    render(<AIInsightCard insight={insight} />);

    expect(
      screen.getByRole("article", { name: "Daily Brief: Glucose patterns" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("note", { name: "Not medical advice disclaimer" }),
    ).toBeInTheDocument();
  });

  it("emits an acknowledgement and updates its status", async () => {
    const onRespond = jest.fn().mockResolvedValue(undefined);
    render(<AIInsightCard insight={insight} onRespond={onRespond} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Acknowledge this insight" }),
    );

    await waitFor(() => {
      expect(onRespond).toHaveBeenCalledWith(
        "daily_brief",
        "insight-1",
        "acknowledged",
      );
    });
    expect(await screen.findByText("Acknowledged")).toBeInTheDocument();
  });
});
