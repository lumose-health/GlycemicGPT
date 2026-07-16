const THEME_SCOPE_SELECTOR = [
  ".theme-light",
  ".theme-dark",
  ".theme-light-1",
  ".theme-dark-1",
  ".theme-light-2",
  ".theme-dark-2",
].join(",");

export interface ChartPalette {
  target: string;
  warning: string;
  error: string;
  signalInfoFill: string;
  signalInfoText: string;
  axis: string;
  grid: string;
  tick: string;
  foregroundPrimary: string;
  foregroundFixedLight: string;
  surfaceFixedDark: string;
  insulinBasal: string;
  insulinBolus: string;
  insulinCorrection: string;
  insulinAutomated: string;
  insulinModeSleep: string;
  insulinModeExercise: string;
}

function resolveCssToken(
  scope: HTMLElement,
  name: string,
  fallback: string,
  seen: ReadonlySet<string> = new Set()
): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  const root = document.documentElement;
  const themeScope = scope.closest(THEME_SCOPE_SELECTOR);
  const candidates = themeScope && themeScope !== root
    ? [scope, themeScope, root]
    : [root, scope];
  const value = candidates
    .map((candidate) => getComputedStyle(candidate).getPropertyValue(name).trim())
    .find(Boolean);

  if (!value) {
    return fallback;
  }

  const variableMatch = value.match(/^var\((--[a-zA-Z0-9-_]+)(?:,\s*(.+))?\)$/);

  if (!variableMatch) {
    return value;
  }

  const [, nextName, nextFallback] = variableMatch;

  if (seen.has(nextName)) {
    return nextFallback ?? fallback;
  }

  return resolveCssToken(
    scope,
    nextName,
    nextFallback ?? fallback,
    new Set([...seen, nextName])
  );
}

function resolveCssColor(
  scope: HTMLElement,
  name: string,
  fallback: string
): string {
  if (typeof document === "undefined") {
    return fallback;
  }

  const tokenValue = resolveCssToken(scope, name, fallback);
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.visibility = "hidden";
  probe.style.color = tokenValue;

  if (!probe.style.color) {
    return fallback;
  }

  scope.appendChild(probe);

  const resolvedColor = getComputedStyle(probe).color;
  probe.remove();

  return resolvedColor || fallback;
}

export function resolveChartPalette(scope: HTMLElement): ChartPalette {
  return {
    target: resolveCssColor(scope, "--color-signal-check-fill", "#2a7643"),
    warning: resolveCssColor(scope, "--color-signal-warning-fill", "#f8c129"),
    error: resolveCssColor(scope, "--color-signal-error-fill", "#cd1d0c"),
    signalInfoFill: resolveCssColor(scope, "--color-signal-info-fill", "#2b7272"),
    signalInfoText: resolveCssColor(scope, "--color-signal-info-text", "#2b7272"),
    axis: resolveCssColor(scope, "--color-border-hover", "#ced0ce"),
    grid: resolveCssColor(scope, "--color-border-default", "#e6e8e6"),
    tick: resolveCssColor(scope, "--color-foreground-secondary", "#767676"),
    foregroundPrimary: resolveCssColor(scope, "--color-foreground-primary", "#191919"),
    foregroundFixedLight: resolveCssColor(scope, "--color-foreground-fixed-light", "#ffffff"),
    surfaceFixedDark: resolveCssColor(scope, "--color-surface-fixed-dark", "#000000"),
    insulinBasal: resolveCssColor(scope, "--color-data-insulin-basal", "#2563eb"),
    insulinBolus: resolveCssColor(scope, "--color-data-insulin-bolus", "#1d4ed8"),
    insulinCorrection: resolveCssColor(scope, "--color-data-insulin-correction", "#b24600"),
    insulinAutomated: resolveCssColor(scope, "--color-data-insulin-automated", "#1e3a8a"),
    insulinModeSleep: resolveCssColor(scope, "--color-data-insulin-mode-sleep", "#6f53ca"),
    insulinModeExercise: resolveCssColor(scope, "--color-data-insulin-mode-exercise", "#b24600"),
  };
}
