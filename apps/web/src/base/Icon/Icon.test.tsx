import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { Icon } from "./Icon";
import { icons } from "./iconConfig";

describe("Icon", () => {
  it("renders the sprite reference for the requested icon", () => {
    const { container } = render(<Icon icon="mark-github" />);

    expect(screen.getByRole("img", { name: "GitHub mark" })).toBeInTheDocument();
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#mark-github",
    );
  });

  it("renders a registered Lumose logo from the shared sprite", () => {
    const { container } = render(<Icon icon="logo-lumose-icon-text" />);

    expect(screen.getByRole("img", { name: "Lumose" })).toBeInTheDocument();
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#logo-lumose-icon-text",
    );
  });

  it("keeps the official standalone Lumose icon geometry in the sprite", () => {
    const spritePath = path.join(
      process.cwd(),
      "public/static_assets/iconSprite.svg",
    );
    const sprite = fs.readFileSync(spritePath, "utf8");

    expect(sprite).toContain(
      '<symbol id="logo-lumose-icon" viewBox="0 0 268.88 243.31">',
    );
    expect(sprite).toContain("m126.17 18.52-16.84 17.89");
    expect(sprite).toContain("m254.13 122.69-.95 1-23 24.54");
  });

  it("allows the configured title and size to be overridden via className", () => {
    const { container } = render(
      <Icon className="h-10 w-10" icon="person" title="Selected" />,
    );

    expect(screen.getByRole("img", { name: "Selected" })).toBeInTheDocument();

    const icon = container.querySelector("svg");

    expect(icon).toHaveClass("h-10", "w-10");
    expect(icon).not.toHaveClass("h-6", "w-6");
  });

  it("hides decorative icons from assistive technology", () => {
    const { container } = render(
      <Icon className="text-signal-info-text" decorative icon="person" />,
    );

    const icon = container.querySelector("svg");

    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).not.toHaveAttribute("aria-label");
    expect(icon).not.toHaveAttribute("role");
    expect(icon).toHaveClass("text-signal-info-text");
  });

  it("keeps every sprite id registered in the icon config", () => {
    const spritePath = path.join(
      process.cwd(),
      "public/static_assets/iconSprite.svg",
    );
    const sprite = fs.readFileSync(spritePath, "utf8");
    const spriteIds = Array.from(
      sprite.matchAll(/<symbol[^>]+id="([^"]+)"/g),
      (match) => match[1],
    ).sort();

    expect(spriteIds).toEqual(Object.keys(icons).sort());
  });
});
