import fs from "node:fs";
import path from "node:path";

const V2_ROOT = path.join(process.cwd(), "src/app/v2");
const COMPONENTS_ROOT = path.join(process.cwd(), "src/components");
const COMPONENT_IMPORT = /from\s+["'](@\/components(?:\/[^"']+)?)["']/g;
const FORBIDDEN_COMPONENT_BARRELS = new Set([
  "@/components",
  "@/components/auth",
  "@/components/dashboard-content",
  "@/components/integrations",
  "@/components/integrations/shared",
  "@/components/settings",
]);

function collectImplementationModules(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const modulePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectImplementationModules(modulePath);
    }

    if (
      !entry.name.match(/\.tsx?$/) ||
      entry.name.match(/\.(?:spec|test)\.tsx?$/)
    ) {
      return [];
    }

    return [modulePath];
  });
}

describe("v2 component import contract", () => {
  it("uses direct component module paths", () => {
    const sourceRoots = [V2_ROOT, COMPONENTS_ROOT];
    const invalidImports = sourceRoots.flatMap((sourceRoot) =>
      collectImplementationModules(sourceRoot).flatMap((modulePath) => {
        const source = fs.readFileSync(modulePath, "utf8");
        const imports = [...source.matchAll(COMPONENT_IMPORT)].map(
          ([, importPath]) => importPath,
        );
        const barrelImports = imports.filter((importPath) =>
          FORBIDDEN_COMPONENT_BARRELS.has(importPath),
        );

        return barrelImports.length
          ? [
              `${path.relative(sourceRoot, modulePath)}: ${barrelImports.join(", ")}`,
            ]
          : [];
      }),
    );

    expect(invalidImports).toEqual([]);
  });
});
