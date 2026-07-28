import { render, screen } from "@testing-library/react";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the page title, description, icon, and actions", () => {
    render(
      <PageHeader
        actions={<button type="button">Refresh</button>}
        description="Your saved information"
        icon="book-open"
        title="Knowledge Base"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Knowledge Base" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Your saved information")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(document.querySelector('use[href$="#book-open"]')).not.toBeNull();
  });
});
