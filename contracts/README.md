# API contracts

`openapi.json` here is **the** description of the GlycemicGPT HTTP API: a
deterministic export of the document the backend serves at `/openapi.json`. Client
generation reads from this file and nothing else.

**Never hand-edit anything in this directory.** It is generated. See
[docs/dev/api-contracts.md](../docs/dev/api-contracts.md) for the full workflow.

## Regenerating

From the repo root, after any change to a Pydantic request/response schema, a route
signature, or a router's `responses=`:

```bash
./scripts/regen-contracts.sh
```

That one command regenerates every committed contract artifact. CI fails if you
forget it.

## Ownership

| Layer | Role |
|---|---|
| Pydantic schemas (`apps/api/src/schemas/`) | **Define** the API. The only place a shape is authored. |
| `contracts/openapi.json` | **Describes** the API. Generated; the source of truth for client generation. |
| Generated clients (GLY-180 TypeScript, GLY-181 Kotlin/Swift) | **Consume** the description. Generated; never edited. |

SQLAlchemy models are *not* contracts. They are storage, they change for reasons the
API does not, and nothing outside the backend may depend on their shape.

## Relationship to `apps/api/contract/openapi.json`

There are two committed copies of this document, for now:

| File | Content | Consumer |
|---|---|---|
| `contracts/openapi.json` | The served document, unstamped | Client generation; the security suite, which fuzzes the served `/openapi.json` |
| `apps/api/contract/openapi.json` | The same document plus `info.x-contract-version` | `glycemicgpt-android-unofficial`, which pins it **by path** and diffs its Retrofit/Moshi DTOs against it (GLY-92 / 56.9) |

They are the same document modulo the version stamp, and
`apps/api/tests/test_exported_contract.py` enforces exactly that, so the duplicate
cannot rot into two different APIs. Consolidating onto this file is a follow-up gated
on repointing the Android repo — client migration, which phase 1 deliberately does not
do.

Only the stamped copy carries a version. When a change affects the surface the Android
client consumes, bump `apps/api/contract/CONTRACT_VERSION` before regenerating; the
generator refuses to write otherwise.

## SSE payloads

The two Server-Sent Events streams (`GET /api/v1/glucose/stream`,
`GET /api/v1/alerts/stream`) publish named payload schemas — `GlucoseStreamEvent` and
`AlertStreamEvent`, each a union of the per-event bodies. The SSE event name arrives on
the event's `event:` line rather than inside the JSON, so the union members carry no
discriminator field; a client picks the member from the event name it received.

Only the payload shapes are contracted. Transport concerns — reconnection,
`Last-Event-ID`, buffering — stay platform-specific and are not described here.
