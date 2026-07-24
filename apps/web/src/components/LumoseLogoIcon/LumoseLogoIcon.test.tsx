import { render, screen } from "@testing-library/react";
import { LumoseLogoIcon } from "./LumoseLogoIcon";

describe("LumoseLogoIcon", () => {
  it("renders the shared logo geometry with the semantic gradient color", () => {
    const { container } = render(<LumoseLogoIcon />);
    const logo = screen.getByRole("img", { name: "Lumose logo" });
    const gradient = container.querySelector("linearGradient");
    const stops = container.querySelectorAll("stop");
    const use = container.querySelector("use");

    expect(logo).toHaveClass("text-brand-gradient-middle");
    expect(gradient).toHaveAttribute("gradientUnits", "userSpaceOnUse");
    expect(gradient).toHaveAttribute("x1", "268.88");
    expect(gradient).toHaveAttribute("y1", "0");
    expect(gradient).toHaveAttribute("x2", "0");
    expect(gradient).toHaveAttribute("y2", "243.31");
    expect(stops).toHaveLength(3);
    expect(stops[0]).toHaveAttribute(
      "stop-color",
      "var(--color-brand-gradient-start)",
    );
    expect(stops[1]).toHaveAttribute("stop-color", "currentColor");
    expect(stops[2]).toHaveAttribute(
      "stop-color",
      "var(--color-brand-gradient-end)",
    );
    expect(stops[0]).not.toHaveAttribute("stop-opacity");
    expect(stops[1]).not.toHaveAttribute("stop-opacity");
    expect(stops[2]).not.toHaveAttribute("stop-opacity");
    expect(use).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#lumose-logo-icon-shape",
    );
    expect(use?.getAttribute("fill")).toBe(
      `url(#${gradient?.getAttribute("id")})`,
    );
  });

  it("creates unique gradient references for multiple logos", () => {
    const { container } = render(
      <>
        <LumoseLogoIcon decorative />
        <LumoseLogoIcon decorative />
      </>,
    );
    const gradients = container.querySelectorAll("linearGradient");
    const uses = container.querySelectorAll("use");

    expect(gradients[0].id).not.toBe(gradients[1].id);
    expect(uses[0]).toHaveAttribute("fill", `url(#${gradients[0].id})`);
    expect(uses[1]).toHaveAttribute("fill", `url(#${gradients[1].id})`);
  });

  it("supports decorative rendering and class overrides", () => {
    const { container } = render(
      <LumoseLogoIcon className="h-8 w-8" decorative />,
    );
    const logo = container.querySelector("svg");

    expect(logo).toHaveAttribute("aria-hidden", "true");
    expect(logo).not.toHaveAttribute("aria-label");
    expect(logo).not.toHaveAttribute("role");
    expect(logo).toHaveClass("h-8", "w-8", "text-brand-gradient-middle");
    expect(logo).not.toHaveClass("h-10", "w-10");
  });
});
