/**
 * Backend wire schemas, generated from contracts/openapi.json (GLY-180). Alias
 * to these rather than hand-copying fields so a backend contract change on a
 * migrated endpoint fails `tsc` here instead of silently drifting.
 */
import type { components } from "@/generated/api-schema";

export type Schemas = components["schemas"];

/**
 * A Pydantic `Optional[X] = None` field (no explicit default value in the
 * schema) is marked "not required" in OpenAPI, so openapi-typescript makes
 * the key optional -- even though FastAPI always serializes it, as the value
 * or `null`. Re-widen the fields the backend always sends back to required so
 * migrated types keep the guarantee every existing consumer relies on.
 *
 * `K` scopes which keys get widened; omit it to widen every key (the common
 * case).
 */
export type AlwaysSent<T, K extends keyof T = keyof T> = Omit<T, K> &
  Required<Pick<T, K>>;
