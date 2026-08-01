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

  it("renders the generic insulin pump from the shared sprite", () => {
    const { container } = render(<Icon icon="insulin-pump" />);

    expect(
      screen.getByRole("img", { name: "Insulin pump" }),
    ).toBeInTheDocument();
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#insulin-pump",
    );

    const spritePath = path.join(
      process.cwd(),
      "public/static_assets/iconSprite.svg",
    );
    const sprite = fs.readFileSync(spritePath, "utf8");
    const insulinPumpSymbol = sprite.match(
      /<symbol id="insulin-pump"[\s\S]*?<\/symbol>/,
    )?.[0];

    expect(insulinPumpSymbol).toContain('stroke="currentColor"');
    expect(insulinPumpSymbol).toContain('fill="currentColor"');
    expect(insulinPumpSymbol).toContain(
      "V12.5C8.5 11.1193 9.17157 10 10 10",
    );
  });

  it("renders the syringe from the shared sprite", () => {
    const { container } = render(<Icon icon="syringe" />);

    expect(screen.getByRole("img", { name: "Syringe" })).toBeInTheDocument();
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#syringe",
    );

    const spritePath = path.join(
      process.cwd(),
      "public/static_assets/iconSprite.svg",
    );
    const sprite = fs.readFileSync(spritePath, "utf8");
    const syringeSymbol = sprite.match(
      /<symbol id="syringe"[\s\S]*?<\/symbol>/,
    )?.[0];

    expect(syringeSymbol).toContain('stroke="currentColor"');
  });

  it("renders the generic CGM from the shared sprite", () => {
    const { container } = render(<Icon icon="cgm" />);

    expect(
      screen.getByRole("img", { name: "Continuous glucose monitor" }),
    ).toBeInTheDocument();
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#cgm",
    );

    const spritePath = path.join(
      process.cwd(),
      "public/static_assets/iconSprite.svg",
    );
    const sprite = fs.readFileSync(spritePath, "utf8");
    const cgmSymbol = sprite.match(
      /<symbol id="cgm"[\s\S]*?<\/symbol>/,
    )?.[0];

    expect(cgmSymbol).toContain('stroke="currentColor"');
    expect(cgmSymbol).toContain('fill="currentColor"');
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

  it("renders the open book icon from the shared sprite", () => {
    const { container } = render(<Icon icon="book-open" />);

    expect(screen.getByRole("img", { name: "Open book" })).toBeInTheDocument();
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#book-open",
    );
  });

  it("keeps the official logo geometry in the shared sprite", () => {
    const spritePath = path.join(
      process.cwd(),
      "public/static_assets/iconSprite.svg",
    );
    const sprite = fs.readFileSync(spritePath, "utf8");

    expect(sprite).toContain(
      '<symbol id="lumose-logo-icon" viewBox="0 0 268.88 243.31">',
    );
    expect(sprite).toContain(
      '<symbol id="logo-text" viewBox="0 0 339.25 51.88">',
    );
    expect(sprite).toContain("m126.17 18.52-16.84 17.89");
    expect(sprite).toContain("m254.13 122.69-.95 1-23 24.54");
    expect(sprite).toContain("M196.71 51.88a8.6 8.6 0 0 1-8.59-8.59V20");
  });

  it("keeps a square, proportionally centered favicon source", () => {
    const squareLogoPath = path.join(
      process.cwd(),
      "public/lumose-logo-icon-square.svg",
    );
    const squareLogo = fs.readFileSync(squareLogoPath, "utf8");

    expect(squareLogo).toContain('width="512" height="512"');
    expect(squareLogo).toContain('viewBox="0 0 320 320"');
    expect(squareLogo).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(squareLogo).toContain('transform="translate(25.56 38.345)"');
    expect(squareLogo).toContain("m126.17 18.52-16.84 17.89");
    expect(squareLogo).toContain("m254.13 122.69-.95 1-23 24.54");
  });

  it("adapts the square SVG favicon color to the browser color scheme", () => {
    const faviconPath = path.join(
      process.cwd(),
      "public/lumose-logo-icon-square.svg",
    );
    const favicon = fs.readFileSync(faviconPath, "utf8");

    expect(favicon).toContain(":root { color: #000000; }");
    expect(favicon).toContain("@media (prefers-color-scheme: dark)");
    expect(favicon).toContain(":root { color: #ffffff; }");
    expect(favicon).toContain('<g fill="currentColor"');
  });

  it("renders the sleep icon from the shared sprite", () => {
    const { container } = render(<Icon icon="sleep-zzz" />);

    expect(screen.getByRole("img", { name: "Sleep" })).toBeInTheDocument();
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#sleep-zzz",
    );
  });

  it("renders the exercise icon from the shared sprite", () => {
    const { container } = render(<Icon icon="exercise-dumbbell" />);

    expect(screen.getByRole("img", { name: "Exercise" })).toBeInTheDocument();
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#exercise-dumbbell",
    );
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
