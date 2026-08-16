# Versioned API contract artifact

`openapi.json` here is a **pinned, versioned snapshot** of the live FastAPI
schema (`app.openapi()`). It is the contract the Android/Wear client
(`glycemicgpt-android-unofficial`) pins and diffs its Retrofit/Moshi DTOs
against, now that mobile ships on an independent cadence from the backend
(Epic 56 repo split, GLY-92 / 56.9).

## Two committed artifacts

This is not the only committed copy of the document, and regenerating it alone
leaves the other one's CI gate red:

| File | Content | Consumer |
|---|---|---|
| `apps/api/contract/openapi.json` (here) | The served document plus `info.x-contract-version` | `glycemicgpt-android-unofficial`, which pins it **by path** |
| `contracts/openapi.json` (repo root) | The served document, unstamped | Client generation |

They are the same document modulo the version stamp, and
`apps/api/tests/test_exported_contract.py` enforces exactly that. The full
workflow — ownership, how to change the API, both CI gates — is in
[docs/dev/api-contracts.md](../../../docs/dev/api-contracts.md).

## Files

| File | Purpose |
|---|---|
| `openapi.json` | Deterministic dump of the live schema, version-stamped. Consumed as the pin by the Android repo. |
| `CONTRACT_VERSION` | The contract/spec version. **Distinct** from the app `versionName`/`versionCode` and the Python package version. Stamped into `openapi.json` as `info.x-contract-version`. Starts at `1`. |

## Regenerating (after any HTTP-surface change)

One command, from the **repo root**, regenerates every committed contract
artifact:

```bash
./scripts/regen-contracts.sh
```

If the schema surface changed since the committed artifact, it **refuses to write
unless `CONTRACT_VERSION` was bumped** — so a changed surface can never be
published under the same contract version. Bump `CONTRACT_VERSION` first, then
regenerate.

For a deliberate **internal-only** change (a route or field the Android client
never consumes), pass `--allow-unbumped` to regenerate without a bump:

```bash
./scripts/regen-contracts.sh --allow-unbumped
```

Over-bumping is harmless; under-bumping is the hazard, so bump when unsure.

`apps/api/scripts/generate_openapi_contract.py` is the underlying generator for
this artifact alone. Prefer the repo-root script: running the generator directly
regenerates this file and leaves `contracts/openapi.json` stale.

Regenerate with the same Python interpreter family CI uses (currently 3.14). The
output is empirically byte-identical across 3.12–3.14 today, but pinning the
interpreter avoids a future dependency interaction surfacing as a confusing
false-positive drift failure.

## Drift gate

`scripts/check_openapi_contract.py` (and `tests/test_openapi_contract.py`,
wired into backend CI) regenerate the live spec and fail the build if it no
longer matches the committed `openapi.json`. This makes it impossible to change
the API surface and leave the pin stale. `contracts/openapi.json` has its own
equivalent gate, `scripts/export_openapi.py --check`.

## Not a runtime change

This artifact and its tooling are build-time only. The schema served at runtime
from `/openapi.json` is unchanged — the `x-contract-version` stamp lives only in
the committed file, not the live response.
