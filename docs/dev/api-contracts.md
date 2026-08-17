---
title: API Contracts
description: How the OpenAPI contract is owned, changed, regenerated, and validated.
---

# API Contracts

Clients for this API are generated, not hand-written. That only works if there is one
description of the API that provably matches the running code. This page is the
workflow for keeping it that way.

## Ownership

Three layers, in one direction:

| Layer | Role | Edited by hand? |
|---|---|---|
| Pydantic schemas in `apps/api/src/schemas/`, plus route signatures and `responses=` | **Define** the API | Yes — this is where a shape is authored |
| `contracts/openapi.json` | **Describes** the API | Never |
| Generated clients (a TypeScript client, later Kotlin and Swift clients) | **Consume** the description | Never |

Two consequences worth stating plainly:

- **Generated files are never hand-edited.** If a generated file is wrong, the
  Pydantic schema that produced it is wrong. Fix that and regenerate.
- **SQLAlchemy models are not contracts.** They are storage. They change for reasons
  the API does not, they carry columns no client should know about, and nothing
  outside the backend may depend on their shape. A response schema that mirrors a
  table today is a coincidence, not a contract.

## Changing the API

1. Change the Pydantic schema, route signature, or `responses=` declaration.
2. Regenerate, from the repo root:

   ```bash
   ./scripts/regen-contracts.sh
   ```

3. Commit the regenerated artifacts along with your code change.

If the change affects the surface the Android client consumes, bump
`apps/api/contract/CONTRACT_VERSION` **before** regenerating. The generator refuses to
write a changed surface under an unchanged version:

```text
ERROR: The HTTP surface changed but apps/api/contract/CONTRACT_VERSION is still '4'.
```

For a deliberate internal-only change the client never consumes, or for a second
regeneration within one unreleased change, pass `--allow-unbumped`. Over-bumping is
harmless; under-bumping ships an incompatible surface under a version a pinned client
believes it understands. Bump when unsure.

Generation is offline: it imports the FastAPI app and reads `app.openapi()`. No
running server, no database, no device credentials. It is also deterministic — keys
are sorted on the way out, so a regeneration with no API change produces no diff.

Regenerate with the same Python interpreter family CI uses (currently 3.14). Output is
empirically byte-identical across 3.12–3.14 today, but pinning the interpreter avoids a
future dependency interaction surfacing as a confusing false-positive drift failure.

## What gets generated

| File | Content | Consumer |
|---|---|---|
| `contracts/openapi.json` | The served document, unstamped | Client generation |
| `apps/api/contract/openapi.json` | The same document plus `info.x-contract-version` | `lumose-health/android-unofficial`, which pins it **by path** |
| `apps/web/src/generated/api-schema.ts` | TypeScript types generated from `contracts/openapi.json` via the pinned `openapi-typescript` devDependency (GLY-180) | `apps/web/src/lib/api.ts`, which aliases the glucose/insulin wire types to these |

Two copies of the OpenAPI document exist because the Android repo pins the older path
and repointing it is client migration. `apps/api/tests/test_exported_contract.py`
enforces that the two are the same document modulo the stamp, so they cannot drift
into two different APIs. Consolidation is a follow-up.

Adding a generator (a TypeScript client, a Kotlin client) means adding a `gen_<name>()`
function to `scripts/regen-contracts.sh`, one entry to its `GENERATORS` array, and one
branch to its dispatch `case`. The script's header comment is the contract for that.
`apps/web/src/generated/api-schema.ts` is the first non-Python example: its generator
(`web-types`) only needs `contracts/openapi.json` plus Node, so it's deliberately left
out of `PYTHON_GENERATORS` -- `--only web-types` then skips the `uv` availability check
the other two generators require, which is what lets CI's Node-only frontend job run it
without installing the backend's Python toolchain.

### The export and the security suite

The security suite does **not** read `contracts/openapi.json`. It fetches the live
`/openapi.json` from a running app and fuzzes that. The requirement is that the export
stays *the same document* the suite fuzzes — which
`apps/api/tests/test_exported_contract.py::test_exported_contract_is_what_the_app_serves`
enforces by comparing the committed export against the served response. That is why
the export carries no build-time decoration of any kind, and why the version stamp
lives only in the other copy.

## Validating

Locally, the same checks CI runs:

```bash
cd apps/api
uv run python scripts/export_openapi.py --check    # contracts/openapi.json is current
uv run python scripts/check_openapi_contract.py    # apps/api/contract/openapi.json is current
uv run pytest tests/test_exported_contract.py tests/test_openapi_contract.py
```

In CI, two gates guard the contract:

**Contract drift (blocking).** Steps in the `Backend Tests` job regenerate the spec in
memory and fail the build if a committed artifact no longer matches it. This is what
makes it impossible to change a Pydantic response schema and leave client generation
building from a stale spec. Remediation is always the same: run
`./scripts/regen-contracts.sh` and commit.

**Breaking changes (advisory).** The `Contract Breaking Changes` job diffs
`contracts/openapi.json` against the target branch with
[oasdiff](https://www.oasdiff.com/) and reports what it finds as PR annotations and a
job summary. It reports rather than blocks: pre-1.0, breaking changes are frequently
intentional, and the useful signal is *"this PR breaks clients — was that on
purpose?"*, which a reviewer answers. Tightening it to a failing gate is a deliberate
future step, not an accident of configuration. If the comparison itself fails to run,
the summary says so and the job emits a warning — an unchecked PR is never reported as
a clean one.

A breaking change that *is* intentional needs no CI ceremony — bump
`apps/api/contract/CONTRACT_VERSION` and say so in the PR description, so the client
repos know what they are picking up.

## SSE payloads

The Server-Sent Events streams publish named payload schemas even though they stream:

| Route | Union schema | Members |
|---|---|---|
| `GET /api/v1/glucose/stream` | `GlucoseStreamEvent` | `SseGlucosePayload`, `SseGlucoseAlertPayload`, `SseNoDataPayload`, `SseErrorPayload`, `SseHeartbeatPayload` |
| `GET /api/v1/alerts/stream` | `AlertStreamEvent` | `SseAlertPayload`, `SseHeartbeatPayload` |

They live in `apps/api/src/schemas/stream_events.py`. Each union is **discriminated on
an `event` field** whose value repeats the SSE `event:` name, and the published schema
carries the matching OpenAPI `discriminator`. The field is redundant for a hand-written
client that reads the `event:` line, and load-bearing for a generated one: without it
the union is undecidable, because `no_data` and `error` are structurally identical and
`heartbeat` is a structural supertype of every other member.

Only the payload shapes are contracted. Transport concerns — reconnection,
`Last-Event-ID`, buffering — stay platform-specific.

Three implementation notes for anyone editing these routes:

- The routes declare `response_class=SSEResponse` (`apps/api/src/core/sse.py`). It is a
  documentation-only marker that tells the OpenAPI generator the body is
  `text/event-stream`; the handlers still return their own `StreamingResponse`, and
  nothing about the transport changed. Its docstring explains why it subclasses
  `JSONResponse` — that detail is load-bearing, and a regression test pins it.
- Publishing a *single event's* payload as the `text/event-stream` body schema is a
  deliberate pragmatic convention, not an oversight. OpenAPI 3.1 `content` formally
  describes the whole response body, which for SSE is an unbounded framed stream that
  JSON Schema cannot express. Describing one event is what code generators can use and
  what readers expect; please do not "fix" it into a description of the frame syntax.
- The routers build their payloads through small named functions (`build_*_payload`
  in `apps/api/src/routers/glucose_stream.py`, `alert_stream.py` and
  `apps/api/src/core/sse.py`) so the tests can validate a real emitted payload against
  its published schema. Keep it that way: a schema that nothing validates against is a
  schema that will eventually lie.
