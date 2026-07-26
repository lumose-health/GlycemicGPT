import type { NightscoutConnectionResponse } from "@/lib/api";

export function hasNightscoutPumpHint(
  connection: NightscoutConnectionResponse
): boolean {
  if (!connection.is_active) return false;

  const discovery = connection.detected_uploaders_json;
  if (!discovery || typeof discovery !== "object" || Array.isArray(discovery)) {
    return false;
  }

  const fields = discovery as Record<string, unknown>;
  const pump = fields.pump;

  return (
    typeof fields.active_pump_loop === "string" ||
    (typeof pump === "string" && pump !== "" && pump !== "none")
  );
}
