import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  addResearchSource,
  deleteResearchSource,
  getResearchSources,
  getResearchSuggestions,
  triggerResearch,
} from "@/lib/api";
import ResearchSourcesPage from "./page";

jest.mock("@/lib/api", () => ({
  addResearchSource: jest.fn(),
  deleteResearchSource: jest.fn(),
  getResearchSources: jest.fn(),
  getResearchSuggestions: jest.fn(),
  triggerResearch: jest.fn(),
}));

const mockAddResearchSource = addResearchSource as jest.MockedFunction<
  typeof addResearchSource
>;
const mockDeleteResearchSource = deleteResearchSource as jest.MockedFunction<
  typeof deleteResearchSource
>;
const mockGetResearchSources = getResearchSources as jest.MockedFunction<
  typeof getResearchSources
>;
const mockGetResearchSuggestions =
  getResearchSuggestions as jest.MockedFunction<typeof getResearchSuggestions>;
const mockTriggerResearch = triggerResearch as jest.MockedFunction<
  typeof triggerResearch
>;

async function renderAddSourceForm() {
  render(<ResearchSourcesPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Add Source" }));

  const heading = screen.getByRole("heading", {
    level: 3,
    name: "Add Research Source",
  });
  const form = heading.closest("form");
  if (!form) throw new Error("Add Research Source form was not rendered");

  return form;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAddResearchSource.mockResolvedValue({
    category: "cgm",
    created_at: "2026-08-01T10:00:00.000Z",
    id: "source-1",
    is_active: true,
    last_researched_at: null,
    name: "Clinical guide",
    url: "https://example.com/guide",
  });
  mockDeleteResearchSource.mockResolvedValue();
  mockGetResearchSources.mockResolvedValue({ sources: [], total: 0 });
  mockGetResearchSuggestions.mockResolvedValue({
    based_on: {},
    suggestions: [],
  });
  mockTriggerResearch.mockResolvedValue({
    errors: 0,
    new: 0,
    sources: 0,
    unchanged: 0,
    updated: 0,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ResearchSourcesPage", () => {
  it("programmatically labels every add source field", async () => {
    await renderAddSourceForm();

    expect(screen.getByRole("textbox", { name: "URL" })).toHaveAttribute(
      "id",
      "research-source-url",
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute(
      "id",
      "research-source-name",
    );
    expect(
      screen.getByRole("combobox", { name: "Category (Optional)" }),
    ).toHaveAttribute("id", "research-source-category");
  });

  it("shows local validation errors before calling the API", async () => {
    const form = await renderAddSourceForm();

    fireEvent.click(within(form).getByRole("button", { name: "Add Source" }));

    expect(await screen.findByText("Enter a source URL.")).toBeInTheDocument();
    expect(screen.getByText("Enter a source name.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "URL" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(mockAddResearchSource).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "URL" }), {
      target: { value: "http://example.com/guide" },
    });

    expect(
      await screen.findByText("Enter a valid HTTPS URL."),
    ).toBeInTheDocument();
  });

  it("submits normalized values through the existing API contract", async () => {
    const form = await renderAddSourceForm();

    fireEvent.change(screen.getByRole("textbox", { name: "URL" }), {
      target: { value: "  https://example.com/guide  " },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "  Clinical guide  " },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Category (Optional)" }),
      { target: { value: "cgm" } },
    );
    fireEvent.click(within(form).getByRole("button", { name: "Add Source" }));

    await waitFor(() => {
      expect(mockAddResearchSource).toHaveBeenCalledWith(
        "https://example.com/guide",
        "Clinical guide",
        "cgm",
      );
    });
    expect(
      await screen.findByText("Added: Clinical guide"),
    ).toBeInTheDocument();
  });

  it("requires confirmation before removing a source", async () => {
    mockGetResearchSources.mockResolvedValue({
      sources: [
        {
          category: "cgm",
          created_at: "2026-08-01T10:00:00.000Z",
          id: "source-1",
          is_active: true,
          last_researched_at: null,
          name: "Clinical guide",
          url: "https://example.com/guide",
        },
      ],
      total: 1,
    });
    const confirmDelete = jest.spyOn(window, "confirm").mockReturnValue(false);

    render(<ResearchSourcesPage />);

    const removeButton = await screen.findByRole("button", {
      name: "Remove Clinical guide",
    });
    fireEvent.click(removeButton);
    expect(mockDeleteResearchSource).not.toHaveBeenCalled();

    confirmDelete.mockReturnValue(true);
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(mockDeleteResearchSource).toHaveBeenCalledWith("source-1");
    });
    expect(confirmDelete).toHaveBeenCalledWith(
      'Remove "Clinical guide" from AI research sources?',
    );
  });
});
