import {
  getResearchSourceValidationErrors,
  researchSourceSchema,
} from "./researchSourceSchema";

describe("researchSourceSchema", () => {
  it("accepts an HTTPS source and normalizes surrounding whitespace", () => {
    expect(
      researchSourceSchema.parse({
        category: "guidelines",
        name: "  Clinical guide  ",
        url: "  https://example.com/guide  ",
      }),
    ).toEqual({
      category: "guidelines",
      name: "Clinical guide",
      url: "https://example.com/guide",
    });
  });

  it("returns field errors for missing required values", () => {
    expect(
      getResearchSourceValidationErrors({
        category: "",
        name: "",
        url: "",
      }),
    ).toEqual({
      category: [],
      name: ["Enter a source name."],
      url: ["Enter a source URL."],
    });
  });

  it.each(["http://example.com", "https://", "not a URL"])(
    "rejects invalid HTTPS source URL %s",
    (url) => {
      expect(
        getResearchSourceValidationErrors({
          category: "",
          name: "Clinical guide",
          url,
        }).url,
      ).toContain("Enter a valid HTTPS URL.");
    },
  );
});
