const CONNECTION_TARGETS = {
  glooko: true,
} as const;

export type ConnectionTarget = keyof typeof CONNECTION_TARGETS;

export function parseConnectionTarget(
  value: string | string[] | undefined,
): ConnectionTarget | undefined {
  const target = Array.isArray(value) ? value[0] : value;

  if (target && target in CONNECTION_TARGETS) {
    return target as ConnectionTarget;
  }

  return undefined;
}
