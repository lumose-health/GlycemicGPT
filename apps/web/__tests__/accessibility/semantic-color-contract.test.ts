import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SOURCE_ROOT = path.join(process.cwd(), "src");
const INVALID_SURFACE = /^bg-surface-(?:secondary|tertiary)(?:\/\d+)?$/;
const INVALID_FOREGROUND = "text-foreground-secondary";

function collectImplementationModules(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const modulePath = path.join(directory, entry.name);

    if (entry.isDirectory()) return collectImplementationModules(modulePath);
    if (!entry.name.endsWith(".tsx") || /\.(?:spec|test)\.tsx$/.test(entry.name)) {
      return [];
    }

    return [modulePath];
  });
}

function findInvalidClassStrings(modulePath: string): string[] {
  const source = fs.readFileSync(modulePath, "utf8");
  const sourceFile = ts.createSourceFile(
    modulePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const invalidClassStrings: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isStringLiteralLike(node)) {
      const tokens = node.text.split(/\s+/);
      const hasInvalidSurface = tokens.some((token) =>
        INVALID_SURFACE.test(token),
      );
      const hasInvalidForeground = tokens.includes(INVALID_FOREGROUND);

      if (hasInvalidSurface && hasInvalidForeground) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
            .line + 1;
        invalidClassStrings.push(
          `${path.relative(process.cwd(), modulePath)}:${line}`,
        );
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return invalidClassStrings;
}

describe("semantic color accessibility contract", () => {
  it("does not pair secondary or tertiary surfaces with secondary foreground text", () => {
    const invalidClassStrings = collectImplementationModules(SOURCE_ROOT)
      .flatMap(findInvalidClassStrings)
      .sort();

    expect(invalidClassStrings).toEqual([]);
  });
});
