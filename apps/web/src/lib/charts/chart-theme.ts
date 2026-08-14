const THEME_SCOPE_SELECTOR = [
  ".theme-light",
  ".theme-dark",
  ".theme-dark-1",
  ".theme-dark-2",
  ".theme-dark-3",
].join(",");

export interface ChartPalette {
  transparent: string;
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
  surfaceSecondary: string;
  glucoseForecast: string;
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
  seen: ReadonlySet<string> = new Set()
): string {
  if (typeof window === "undefined") {
    return "";
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
    return "";
  }

  const variableMatch = value.match(/^var\((--[a-zA-Z0-9-_]+)(?:,\s*(.+))?\)$/);

  if (!variableMatch) {
    return value;
  }

  const [, nextName, nextFallback] = variableMatch;

  if (seen.has(nextName)) {
    return nextFallback ?? "";
  }

  const resolved = resolveCssToken(
    scope,
    nextName,
    new Set([...seen, nextName])
  );
  return resolved || nextFallback || "";
}

function resolveCssColor(
  scope: HTMLElement,
  name: string,
): string {
  if (typeof document === "undefined") {
    return "";
  }

  const tokenValue = resolveCssToken(scope, name);
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.visibility = "hidden";
  probe.style.color = tokenValue;

  if (!probe.style.color) {
    return "";
  }

  scope.appendChild(probe);

  const resolvedColor = getComputedStyle(probe).color;
  probe.remove();

  return resolvedColor;
}

export function resolveChartPalette(scope: HTMLElement): ChartPalette {
  return {
    transparent: resolveCssColor(scope, "--color-base-transparent"),
    target: resolveCssColor(scope, "--color-signal-check-fill"),
    warning: resolveCssColor(scope, "--color-signal-warning-fill"),
    error: resolveCssColor(scope, "--color-signal-error-fill"),
    signalInfoFill: resolveCssColor(scope, "--color-signal-info-fill"),
    signalInfoText: resolveCssColor(scope, "--color-signal-info-text"),
    axis: resolveCssColor(scope, "--color-border-hover"),
    grid: resolveCssColor(scope, "--color-border-default"),
    tick: resolveCssColor(scope, "--color-foreground-secondary"),
    foregroundPrimary: resolveCssColor(scope, "--color-foreground-primary"),
    foregroundFixedLight: resolveCssColor(scope, "--color-foreground-fixed-light"),
    surfaceFixedDark: resolveCssColor(scope, "--color-surface-fixed-dark"),
    surfaceSecondary: resolveCssColor(scope, "--color-surface-secondary"),
    glucoseForecast: resolveCssColor(scope, "--color-data-glucose-forecast"),
    insulinBasal: resolveCssColor(scope, "--color-data-insulin-basal"),
    insulinBolus: resolveCssColor(scope, "--color-data-insulin-bolus"),
    insulinCorrection: resolveCssColor(scope, "--color-data-insulin-correction"),
    insulinAutomated: resolveCssColor(scope, "--color-data-insulin-automated"),
    insulinModeSleep: resolveCssColor(scope, "--color-data-insulin-mode-sleep"),
    insulinModeExercise: resolveCssColor(scope, "--color-data-insulin-mode-exercise"),
  };
}
