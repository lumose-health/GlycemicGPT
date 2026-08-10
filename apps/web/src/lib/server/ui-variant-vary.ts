import { ServerResponse } from "node:http";

const UI_VERSION_HEADER = "x-glycemicgpt-ui-version";
const UI_VARIANT_PATHS = new Set(["/", "/login", "/register"]);
const PATCH_MARKER = Symbol.for("glycemicgpt.uiVariantVaryHeaderInstalled");

function isUiVariantResponse(response: ServerResponse): boolean {
  const requestUrl = response.req.url;
  if (!requestUrl) return false;

  return UI_VARIANT_PATHS.has(new URL(requestUrl, "http://localhost").pathname);
}

function appendVaryHeader(
  value: string | number | readonly string[],
): string {
  const tokens = (Array.isArray(value) ? value : [value])
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter(Boolean);

  if (!tokens.some((token) => token.toLowerCase() === UI_VERSION_HEADER)) {
    tokens.push(UI_VERSION_HEADER);
  }

  return tokens.join(", ");
}

/**
 * Next replaces middleware and next.config Vary values when it serves a
 * prerendered App Router response. Preserve Next's own RSC variation keys and
 * append the UI selector at the final Node response boundary.
 */
export function installUiVariantVaryHeader(): void {
  const responsePrototype = ServerResponse.prototype;
  if (Reflect.get(responsePrototype, PATCH_MARKER) === true) return;

  const originalSetHeader = responsePrototype.setHeader;
  responsePrototype.setHeader = function setHeader(name, value) {
    const nextValue =
      name.toLowerCase() === "vary" && isUiVariantResponse(this)
        ? appendVaryHeader(value)
        : value;

    return originalSetHeader.call(this, name, nextValue);
  };
  Reflect.set(responsePrototype, PATCH_MARKER, true);
}
