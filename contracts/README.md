# API contracts

`openapi.json` here is **the** description of the Lumose HTTP API: a
deterministic export of the document the backend serves at `/openapi.json`. Client
generation reads from this file and nothing else.

**Never hand-edit `openapi.json`.** It is generated. See
[docs/dev/api-contracts.md](../docs/dev/api-contracts.md) for the full workflow.

The one exception is [`fixtures/`](fixtures/README.md): hand-authored, deterministic
example payloads that Python and TypeScript both validate against the schemas in this
document. They are test data, not generated output, and `regen-contracts.sh` does not
touch them.

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
| Generated clients (TypeScript, later Kotlin and Swift) | **Consume** the description. Generated; never edited. |

SQLAlchemy models are *not* contracts. They are storage, they change for reasons the
API does not, and nothing outside the backend may depend on their shape.

## Relationship to `apps/api/contract/openapi.json`

There are two committed copies of this document, for now:

| File | Content | Consumer |
|---|---|---|
| `contracts/openapi.json` | The served document, unstamped | Client generation |
| `apps/api/contract/openapi.json` | The same document plus `info.x-contract-version` | `lumose-health/android-unofficial`, which pins it **by path** and diffs its Retrofit/Moshi DTOs against it |

They are the same document modulo the version stamp, and
`apps/api/tests/test_exported_contract.py` enforces exactly that, so the duplicate
cannot rot into two different APIs. Consolidating onto this file is a follow-up gated
on repointing the Android repo — client migration, which this phase deliberately does
not do.

Only the stamped copy carries a version. When a change affects the surface the Android
client consumes, bump `apps/api/contract/CONTRACT_VERSION` before regenerating; the
generator refuses to write otherwise.

## Relationship to the security suite

The security suite does **not** read this file: it fetches the live `/openapi.json`
from a running app and fuzzes that. The requirement is therefore that this export
stays the same document the suite fuzzes, which
`apps/api/tests/test_exported_contract.py::test_exported_contract_is_what_the_app_serves`
enforces by comparing the committed export against the served response. That is also
why nothing is stamped onto or stripped out of this copy.

## SSE payloads

The two Server-Sent Events streams (`GET /api/v1/glucose/stream`,
`GET /api/v1/alerts/stream`) publish named payload schemas — `GlucoseStreamEvent` and
`AlertStreamEvent`, each a union of the per-event bodies, discriminated on an `event`
field that repeats the SSE `event:` name.

Only the payload shapes are contracted. Transport concerns — reconnection,
`Last-Event-ID`, buffering — stay platform-specific and are not described here.
