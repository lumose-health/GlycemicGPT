---
title: Idempotency Keys
description: The optional Idempotency-Key contract for user-authored create endpoints.
---

# Idempotency Keys for User-Authored Creates

The backend supports an optional `Idempotency-Key` request header on
user-authored create endpoints so a retried create -- most importantly the
mobile offline outbox replaying after a dropped response -- can never
double-insert. A double-inserted meal inflates carb (and downstream IOB)
history, a dosing input, so exactly-once create replay is safety-adjacent.

## The contract

- **Header:** `Idempotency-Key: <opaque string, max 64 chars>`. The mobile
  outbox sends a canonical lowercase UUIDv4 (its queued row's
  `clientRequestId`), but the server treats the value as opaque.
- **Optional.** No header means the endpoint behaves exactly as before -- a
  normal, non-idempotent create. Web, the Wear relay, and older app builds are
  unaffected.
- **Malformed** (blank, or over 64 chars) is rejected with
  `422 {"detail": "<string>"}`.
- **Scope:** the key is unique per `(user, endpoint, client_request_id)`. The
  same value sent to two different endpoints never collides. Each queued
  client action gets one fresh key, reused **only** for retries of that exact
  action. The server does not fingerprint the payload: if a client reuses a
  key for a *different* action (different photo, different record id), the
  server replays the original resource and the new action is silently lost --
  generating a fresh key per action is a hard client-side requirement.
- **First request:** processed normally; the created resource's pointer
  (`resource_type`, `resource_id`, HTTP status -- never the response body) is
  recorded atomically in the same transaction as the domain row.
- **Retry with the same key:** the server returns the *original* resource --
  same server `id`, original status -- without re-running any side effect (no
  second AI vision call, no second stored photo, no second row). The response
  carries `Idempotent-Replayed: true`. The retry must still be a well-formed
  request (auth, accepted `Content-Type`, a file part present); only the
  payload *content* is exempt from re-validation.
- **Replayed-but-deleted:** if the referenced resource was deleted between the
  original create and the retry, the server responds `200` with a small
  tombstone body (`replayed`, `resource_deleted`, `resource_type`,
  `resource_id`) and does **not** re-create it. Clients must treat this as
  terminal: done, nothing to bind.
- **Concurrent duplicates:** two in-flight requests with the same key resolve
  to a single resource; the loser transparently returns the winner's resource.
- **Terminal errors:** a `403` (e.g. the user disabled meal intelligence after
  queueing) or `404` on a keyed retry is not retryable -- the outbox should
  treat it as terminal for that item rather than retrying forever.
- **Retention:** key rows are never pruned; the replay window is unbounded,
  which the tombstone semantics require. Growth is bounded by keyed-create
  volume (same order as the created rows themselves).

## Wired endpoints

| Endpoint | Slug | Resource |
| --- | --- | --- |
| `POST /api/food-records` | `food_records.create` | `food_record` |
| `POST /api/food-records/{id}/save-as-common-food` | `common_foods.create_from_record` | `common_food` |

Future user-authored creates (notes, manual insulin logs) wire into the same
substrate -- `src/services/idempotency.py` + the `IdempotencyKeyHeader`
dependency in `src/core/idempotency.py` -- with zero new schema.

## Explicitly excluded endpoints

- `POST /api/integrations/pump/push` -- has its own server-computed
  **content-hash** dedup (`pump_events.dedupe_hash`), which is the *opposite*
  semantic: it collapses distinct submissions describing the same real-world
  event across sources. Request idempotency must never merge two intentionally
  distinct meals that look alike; never apply either mechanism to the other's
  endpoints.
- `POST /api/treatment/validate-bolus` -- an online-only pre-delivery safety
  gate against live glucose/IoB; replaying a stale validation is unsafe, so it
  must never be enqueued offline or keyed.
- Edits (`correct`, `confirm-identity`, `link-common-food`, common-food
  `PATCH`) are last-write-wins replayable, and both `DELETE`s are naturally
  idempotent -- no key needed.

## Mobile wiring (for the offline-outbox stories)

Add the header **per endpoint** on the Retrofit interface, e.g. (matching the
existing `GlycemicGptApi.kt` signature):

```kotlin
@Multipart
@POST("/api/food-records")
suspend fun uploadFoodPhoto(
    @Part file: MultipartBody.Part,
    @Header("Idempotency-Key") idempotencyKey: String? = null,
): Response<FoodRecordResponse>
```

Do **not** stamp the header from a blanket OkHttp interceptor: that would
wrongly attach request-idempotency semantics to `pump/push` (content-hash
deduped) and `validate-bolus` (excluded by design). Only the outbox-replayed
create calls pass a key; direct online calls may pass `null`.
