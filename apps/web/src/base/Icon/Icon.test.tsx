import { STATIC_ASSET_ICON_SPRITE_PATH } from "@/lib/staticAssets";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { Icon } from "./Icon";
import { icons } from "./iconConfig";

describe("Icon", () => {
  it("uses the compact default size for the visually expansive close icon", () => {
    const { container } = render(<Icon icon="x" />);

    expect(container.querySelector("svg")).toHaveClass("h-3", "w-3");
  });

  it("renders the sprite reference for the requested icon", () => {
    const { container } = render(<Icon icon="mark-github" />);

    expect(
      screen.getByRole("img", { name: "GitHub mark" }),
    ).toBeInTheDocument();
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      `${STATIC_ASSET_ICON_SPRITE_PATH}#mark-github`,
    );
  });

  it("keeps Lumose gradient paint definitions in the rendered document", () => {
    const { container } = render(<Icon icon="logo-lumose-icon-text" />);
    const svg = container.querySelector("svg");
    const gradient = container.querySelector("linearGradient");
    const gradientPaths = container.querySelectorAll(
      "[data-lumose-gradient] path",
    );
    const gradientGroup = container.querySelector("[data-lumose-gradient]");
    const stops = container.querySelectorAll("stop");
    const use = container.querySelector("use");

    expect(screen.getByRole("img", { name: "Lumose" })).toBeInTheDocument();
    expect(svg).toHaveAttribute("viewBox", "0 0 434.27 68.02");
    expect(stops).toHaveLength(3);
    expect(gradient).toHaveAttribute("gradientUnits", "userSpaceOnUse");
    expect(gradient).toHaveAttribute("x2", "268.88");
    expect(gradient).toHaveAttribute("y2", "243.31");
    expect(stops[0]).toHaveAttribute(
      "stop-color",
      "var(--color-brand-gradient-start)",
    );
    expect(stops[1]).toHaveAttribute(
      "stop-color",
      "var(--color-brand-gradient-middle)",
    );
    expect(stops[2]).toHaveAttribute(
      "stop-color",
      "var(--color-brand-gradient-end)",
    );
    expect(use).toHaveAttribute(
      "href",
      `${STATIC_ASSET_ICON_SPRITE_PATH}#logo-lumose-icon-text`,
    );
    expect(use).not.toHaveAttribute("fill");
    expect(gradientPaths).toHaveLength(3);
    gradientPaths.forEach((path) => {
      expect(path).toHaveAttribute("fill", `url(#${gradient?.id})`);
    });
    expect(gradientGroup).toHaveAttribute("transform", "scale(0.27955)");
  });

  it("creates unique gradient references for multiple Lumose logos", () => {
    const { container } = render(
      <>
        <Icon decorative icon="logo-lumose-icon" />
        <Icon decorative icon="logo-lumose-text-icon" />
      </>,
    );
    const gradients = container.querySelectorAll("linearGradient");
    const gradientGroups = container.querySelectorAll("[data-lumose-gradient]");
    const uses = container.querySelectorAll("use");

    expect(gradients[0].id).not.toBe(gradients[1].id);
    expect(uses).toHaveLength(1);
    expect(uses[0]).toHaveAttribute(
      "href",
      `${STATIC_ASSET_ICON_SPRITE_PATH}#logo-lumose-text-icon`,
    );
    expect(gradientGroups[0].querySelector("path")).toHaveAttribute(
      "fill",
      `url(#${gradients[0].id})`,
    );
    expect(gradientGroups[0]).not.toHaveAttribute("transform");
    expect(gradientGroups[0].closest("svg")).toHaveAttribute(
      "viewBox",
      "0 0 268.88 243.31",
    );
    expect(gradientGroups[1].querySelector("path")).toHaveAttribute(
      "fill",
      `url(#${gradients[1].id})`,
    );
    expect(gradientGroups[1]).toHaveAttribute(
      "transform",
      "translate(183.98 7.42) scale(0.1952)",
    );
    expect(gradientGroups[1].closest("svg")).toHaveAttribute(
      "viewBox",
      "0 0 342.06 54.91",
    );
  });

  it("renders the generic insulin pump from the shared sprite", () => {
    const { container } = render(<Icon icon="insulin-pump" />);

    expect(
      screen.getByRole("img", { name: "Insulin pump" }),
    ).toBeInTheDocument();
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      `${STATIC_ASSET_ICON_SPRITE_PATH}#insulin-pump`,
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
    expect(insulinPumpSymbol).toContain("V12.5C8.5 11.1193 9.17157 10 10 10");
  });

  it("renders the syringe from the shared sprite", () => {
    const { container } = render(<Icon icon="syringe" />);

    expect(screen.getByRole("img", { name: "Syringe" })).toBeInTheDocument();
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      `${STATIC_ASSET_ICON_SPRITE_PATH}#syringe`,
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
      `${STATIC_ASSET_ICON_SPRITE_PATH}#cgm`,
    );

    const spritePath = path.join(
      process.cwd(),
      "public/static_assets/iconSprite.svg",
    );
    const sprite = fs.readFileSync(spritePath, "utf8");
    const cgmSymbol = sprite.match(/<symbol id="cgm"[\s\S]*?<\/symbol>/)?.[0];

    expect(cgmSymbol).toContain('stroke="currentColor"');
    expect(cgmSymbol).toContain('fill="currentColor"');
  });

  it("keeps WebKit-safe Lumose gradient paint outside the sprite", () => {
    const spritePath = path.join(
      process.cwd(),
      "public/static_assets/iconSprite.svg",
    );
    const sprite = fs.readFileSync(spritePath, "utf8");

    const standaloneLogoSymbol = sprite.match(
      /<symbol id="logo-lumose-icon"[\s\S]*?<\/symbol>/,
    )?.[0];
    const iconTextLogoSymbol = sprite.match(
      /<symbol id="logo-lumose-icon-text"[\s\S]*?<\/symbol>/,
    )?.[0];

    expect(standaloneLogoSymbol).not.toContain("<path");
    expect(iconTextLogoSymbol).not.toContain("m126.17 18.52-16.84 17.89");
    expect(iconTextLogoSymbol).toContain('fill="currentColor"');
    expect(sprite).not.toContain("linearGradient");
    expect(sprite).not.toContain('fill="url(#');
  });

  it("renders the open book icon from the shared sprite", () => {
    const { container } = render(<Icon icon="book-open" />);

    expect(screen.getByRole("img", { name: "Open book" })).toBeInTheDocument();
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      `${STATIC_ASSET_ICON_SPRITE_PATH}#book-open`,
    );
  });

  it("renders a Lumose icon from the shared sprite", () => {
    const { container } = render(<Icon icon="sync" />);

    expect(screen.getByRole("img", { name: "Sync" })).toBeInTheDocument();
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      `${STATIC_ASSET_ICON_SPRITE_PATH}#sync`,
    );
  });

  it("keeps the approved Lumose sync geometry theme aware", () => {
    const spritePath = path.join(
      process.cwd(),
      "public/static_assets/iconSprite.svg",
    );
    const sprite = fs.readFileSync(spritePath, "utf8");
    const syncSymbol = sprite.match(/<symbol id="sync"[\s\S]*?<\/symbol>/)?.[0];

    expect(syncSymbol).toContain('viewBox="0 0 22 22"');
    expect(syncSymbol).toContain("M2.38045 7C3.89083 3.75092");
    expect(syncSymbol).toContain("M1.78456 13.3177C1.68386 12.9159");
    expect(syncSymbol).toContain('fill="currentColor"');
    expect(syncSymbol).not.toContain("#1F2328");
  });

  it("keeps the approved Lumose heart geometry theme aware", () => {
    const spritePath = path.join(
      process.cwd(),
      "public/static_assets/iconSprite.svg",
    );
    const sprite = fs.readFileSync(spritePath, "utf8");
    const heartSymbol = sprite.match(
      /<symbol id="heart"[\s\S]*?<\/symbol>/,
    )?.[0];

    expect(heartSymbol).toContain('viewBox="0 0 24 24"');
    expect(heartSymbol).toContain("M6.73649 2.5C3.82903 2.5");
    expect(heartSymbol).toContain('fill-rule="evenodd"');
    expect(heartSymbol).toContain('fill="currentColor"');
    expect(heartSymbol).not.toContain("#1F2328");
  });

  it("keeps the approved Lumose calendar geometry theme aware", () => {
    const spritePath = path.join(
      process.cwd(),
      "public/static_assets/iconSprite.svg",
    );
    const sprite = fs.readFileSync(spritePath, "utf8");
    const calendarSymbol = sprite.match(
      /<symbol id="calendar-days"[\s\S]*?<\/symbol>/,
    )?.[0];

    expect(calendarSymbol).toContain('viewBox="0 0 21 23"');
    expect(calendarSymbol).toContain("M5.25 0C5.66421 0");
    expect(calendarSymbol).toContain('fill-rule="evenodd"');
    expect(calendarSymbol).toContain('fill="currentColor"');
    expect(calendarSymbol).not.toContain("#1F2328");
  });

  it("keeps the approved Lumose hash geometry theme aware", () => {
    const spritePath = path.join(
      process.cwd(),
      "public/static_assets/iconSprite.svg",
    );
    const sprite = fs.readFileSync(spritePath, "utf8");
    const hashSymbol = sprite.match(/<symbol id="hash"[\s\S]*?<\/symbol>/)?.[0];

    expect(hashSymbol).toContain('viewBox="0 0 20 21"');
    expect(hashSymbol).toContain("M7.62332 0.00953064C8.03233");
    expect(hashSymbol).toContain('fill-rule="evenodd"');
    expect(hashSymbol).toContain('fill="currentColor"');
    expect(hashSymbol).not.toContain("#1F2328");
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
      `${STATIC_ASSET_ICON_SPRITE_PATH}#sleep-zzz`,
    );
  });

  it("renders the exercise icon from the shared sprite", () => {
    const { container } = render(<Icon icon="exercise-dumbbell" />);

    expect(screen.getByRole("img", { name: "Exercise" })).toBeInTheDocument();
    expect(container.querySelector("use")).toHaveAttribute(
      "href",
      `${STATIC_ASSET_ICON_SPRITE_PATH}#exercise-dumbbell`,
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
