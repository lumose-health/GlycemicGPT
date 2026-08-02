import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const WEB_ROOT = process.cwd();
const SOURCE_ROOT = path.join(WEB_ROOT, "src");
const V2_ROOT = path.join(SOURCE_ROOT, "app/v2");
const SOURCE_IMPORT =
  /(?:from\s+|import\s*\(|export\s+[^;]*?from\s+)["']([^"']+)["']/g;
const FORBIDDEN_BARRELS = new Set([
  "@/components",
  "@/components/integrations",
  "@/components/settings",
  "@/compositions",
  "@/providers",
]);
const RAW_PALETTE_UTILITY =
  /\b(?:bg|border|divide|from|outline|ring|shadow|stroke|text|to|via)-(?:amber|black|blue|cyan|emerald|fuchsia|gray|green|indigo|lime|neutral|orange|pink|purple|red|rose|sky|slate|stone|teal|violet|white|yellow|zinc)(?:-|\/|\b)/;
const RAW_TYPOGRAPHY =
  /\b(?:font-(?:black|bold|extrabold|extralight|light|medium|mono|normal|sans|semibold|serif|thin)|leading-(?:loose|none|normal|relaxed|snug|tight|\[[^\]]+\])|text-(?:xs|sm|base|lg|xl|[2-9]xl)|tracking-(?:normal|tight|tighter|wide|wider|widest|\[[^\]]+\]))\b/;
const UNTOKENIZED_RADIUS =
  /\brounded(?:-(?:b|bl|br|l|r|t|tl|tr))?-(?!(?:button|none|panel|pill)\b)(?:\[[^\]]+\]|[a-z0-9]+)(?=[\s"'`])/;
const RAW_COLOR_LITERAL =
  /(?:#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(\s*\d)/i;
const SHARED_CONTROL_MODULES = [
  "src/base/Input/",
  "src/components/Checkbox/",
  "src/components/PasswordTextInput/",
  "src/components/SelectField/",
  "src/components/Switch/",
  "src/components/TextAreaField/",
  "src/components/TextInput/",
];
const REQUIRED_COMPONENT_FOLDERS = [
  "CgmSourceSettings",
  "ForecastSourceSettings",
  "GlookoConnectionSettings",
  "MedtronicConnectSettings",
  "MedtronicImportSettings",
  "NightscoutConnectionSettings",
  "NightscoutOnboarding",
];

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) return collectSourceFiles(entryPath);
    if (
      !/\.(?:ts|tsx)$/.test(entry.name) ||
      /\.(?:spec|test)\.(?:ts|tsx)$/.test(entry.name)
    ) {
      return [];
    }

    return [entryPath];
  });
}

function resolveSourceImport(
  importer: string,
  importSource: string,
): string | null {
  const unresolved = importSource.startsWith("@/")
    ? path.join(SOURCE_ROOT, importSource.slice(2))
    : importSource.startsWith(".")
      ? path.resolve(path.dirname(importer), importSource)
      : null;

  if (!unresolved) return null;

  for (const candidate of [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    path.join(unresolved, "index.ts"),
    path.join(unresolved, "index.tsx"),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      return candidate;
  }

  return null;
}

function collectV2Graph() {
  const pending = collectSourceFiles(V2_ROOT);
  const visited = new Set<string>();
  const imports = new Map<string, string[]>();

  while (pending.length > 0) {
    const modulePath = pending.pop();
    if (!modulePath || visited.has(modulePath)) continue;

    visited.add(modulePath);
    const source = fs.readFileSync(modulePath, "utf8");
    const moduleImports = [...source.matchAll(SOURCE_IMPORT)].map(
      (match) => match[1],
    );
    imports.set(modulePath, moduleImports);

    for (const importSource of moduleImports) {
      const resolved = resolveSourceImport(modulePath, importSource);
      if (resolved && !visited.has(resolved)) pending.push(resolved);
    }
  }

  return { imports, modules: [...visited].sort() };
}

function isRedesignedComponent(modulePath: string): boolean {
  const relativePath = path.relative(SOURCE_ROOT, modulePath);

  return (
    /^components\/[A-Z][^/]+\//.test(relativePath) ||
    /^components\/settings\//.test(relativePath) ||
    /^components\/integrations\/[A-Z][^/]+\//.test(relativePath)
  );
}

function getStaticClassNames(attributes: ts.JsxAttributes): string[] {
  const classAttribute = attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === "className",
  );
  if (!classAttribute?.initializer) return [];

  const values: string[] = [];
  const collectStrings = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      values.push(node.text);
    }
    ts.forEachChild(node, collectStrings);
  };
  collectStrings(classAttribute.initializer);
  return values.flatMap((value) => value.split(/\s+/)).filter(Boolean);
}

function findUnsupportedSurfaceTextPairings(modulePath: string): string[] {
  if (!modulePath.endsWith(".tsx")) return [];
  const source = fs.readFileSync(modulePath, "utf8");
  const sourceFile = ts.createSourceFile(
    modulePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const violations: string[] = [];

  const visit = (node: ts.Node, inheritedSurface?: string) => {
    let surface = inheritedSurface;
    let children: readonly ts.Node[] = node.getChildren(sourceFile);

    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const classes = getStaticClassNames(opening.attributes);
      surface =
        classes.find((className) =>
          /^bg-surface-(?:elevated|page|primary|secondary|tertiary)(?:\/\d+)?$/.test(
            className,
          ),
        ) ?? surface;

      if (
        surface &&
        /^bg-surface-(?:elevated|secondary|tertiary)/.test(surface) &&
        classes.includes("text-foreground-secondary")
      ) {
        const position = sourceFile.getLineAndCharacterOfPosition(
          opening.getStart(sourceFile),
        );
        violations.push(
          `${path.relative(WEB_ROOT, modulePath)}:${position.line + 1}`,
        );
      }

      children = ts.isJsxElement(node) ? node.children : [];
    }

    children.forEach((child) => visit(child, surface));
  };
  visit(sourceFile);
  return violations;
}

describe("V2 module boundary", () => {
  const graph = collectV2Graph();

  it("does not depend on legacy owned component modules", () => {
    const legacyModules = graph.modules
      .filter(
        (modulePath) =>
          (modulePath.startsWith(path.join(SOURCE_ROOT, "app")) &&
            !modulePath.startsWith(V2_ROOT)) ||
          (modulePath.startsWith(path.join(SOURCE_ROOT, "components")) &&
            !isRedesignedComponent(modulePath)),
      )
      .map((modulePath) => path.relative(WEB_ROOT, modulePath));

    expect(legacyModules).toEqual([]);
  });

  it("does not hide dependencies behind broad barrels", () => {
    const violations = [...graph.imports].flatMap(([modulePath, imports]) =>
      imports
        .filter((importSource) => FORBIDDEN_BARRELS.has(importSource))
        .map(
          (importSource) =>
            `${path.relative(WEB_ROOT, modulePath)} imports ${importSource}`,
        ),
    );

    expect(violations).toEqual([]);
  });

  it("keeps legacy styling dependencies out of the recursive V2 graph", () => {
    const violations = graph.modules.flatMap((modulePath) => {
      const source = fs.readFileSync(modulePath, "utf8");
      const sourceWithoutComments = source.replace(
        /\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm,
        "",
      );
      const moduleName = path.relative(WEB_ROOT, modulePath);
      const reasons = [
        source.includes("lucide-react") ? "lucide-react" : null,
        moduleName !== "src/lib/ui/twMerge.ts" &&
        /from ["'](?:clsx|classnames|tailwind-merge)["']/.test(source)
          ? "direct class composition dependency"
          : null,
        /className=\{`/.test(source)
          ? "template string class composition"
          : null,
        /\bdark:[a-z[]/.test(source) ? "dark variant" : null,
        RAW_PALETTE_UTILITY.test(source) ? "raw palette utility" : null,
        RAW_TYPOGRAPHY.test(source) ? "raw typography utility" : null,
        UNTOKENIZED_RADIUS.test(source) ? "untokenized radius" : null,
        RAW_COLOR_LITERAL.test(sourceWithoutComments)
          ? "raw color literal"
          : null,
      ].filter(Boolean);

      return reasons.map((reason) => `${moduleName}: ${reason}`);
    });

    expect(violations).toEqual([]);
  });

  it("uses shared controls throughout the recursive V2 graph", () => {
    const violations = graph.modules.flatMap((modulePath) => {
      const moduleName = path.relative(WEB_ROOT, modulePath);
      if (SHARED_CONTROL_MODULES.some((root) => moduleName.startsWith(root))) {
        return [];
      }

      const source = fs.readFileSync(modulePath, "utf8");
      const controls =
        source.match(/<(?:input|select|textarea)\b[\s\S]*?>/g) ?? [];
      return controls
        .filter(
          (control) =>
            !/^<input\b/.test(control) || !/\btype=["']radio["']/.test(control),
        )
        .map((control) => `${moduleName}: ${control.split(/\s+/)[0]}`);
    });

    expect(violations).toEqual([]);
  });

  it("checks inherited semantic surface and foreground pairings recursively", () => {
    const violations = graph.modules.flatMap(
      findUnsupportedSurfaceTextPairings,
    );
    expect(violations).toEqual([]);
  });

  it("keeps every new reusable connection component colocated", () => {
    const violations = REQUIRED_COMPONENT_FOLDERS.flatMap((folder) => {
      const directory = path.join(
        SOURCE_ROOT,
        "components/integrations",
        folder,
      );
      const files = fs.readdirSync(directory);
      const requiredPatterns = [
        new RegExp(`^${folder}\\.tsx$`),
        new RegExp(`^${folder}\\.types\\.ts$`),
        new RegExp(`^${folder}\\.test\\.tsx?$`),
        /^index\.ts$/,
      ];
      return requiredPatterns
        .filter((pattern) => !files.some((file) => pattern.test(file)))
        .map((pattern) => `${folder}: missing ${pattern.source}`);
    });

    expect(violations).toEqual([]);
  });

  it("keeps connection rows collapsed by default", () => {
    const violations = graph.modules.flatMap((modulePath) => {
      const source = fs.readFileSync(modulePath, "utf8");
      return (source.match(/<ConnectionSettingsAccordion\b[\s\S]*?>/g) ?? [])
        .filter((openingTag) => /\bdefaultOpen=/.test(openingTag))
        .filter((openingTag) => !/\bdefaultOpen=\{false\}/.test(openingTag))
        .map(() => path.relative(WEB_ROOT, modulePath));
    });

    expect(violations).toEqual([]);
  });

  it("does not link V2 modules to legacy-only route trees", () => {
    const allowedDashboardRoute =
      /^\/dashboard(?:$|\/(?:briefs|ai-chat|knowledge-base|caregiver)(?:$|[?#])|\/meals(?:$|[/?#]))/;
    const violations = graph.modules.flatMap((modulePath) => {
      const source = fs.readFileSync(modulePath, "utf8");
      return [
        ...source.matchAll(
          /["'](\/(?:dashboard|settings|login|register)[^"']*)["']/g,
        ),
      ]
        .map((match) => match[1])
        .filter((route) =>
          route.startsWith("/dashboard")
            ? route !== "/dashboard/" && !allowedDashboardRoute.test(route)
            : false,
        )
        .map((route) => `${path.relative(WEB_ROOT, modulePath)}: ${route}`);
    });

    expect(violations).toEqual([]);
  });
});
