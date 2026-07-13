# API contract artifact

`openapi.json` here is a **pinned, versioned snapshot** of the live FastAPI
schema (`app.openapi()`). It is the contract the Android/Wear client
(`glycemicgpt-android-unofficial`) pins and diffs its Retrofit/Moshi DTOs
against, now that mobile ships on an independent cadence from the backend
(Epic 56 repo split, GLY-92 / 56.9).

## Files

| File | Purpose |
|---|---|
| `openapi.json` | Deterministic dump of the live schema. Consumed as the pin by the Android repo. |
| `CONTRACT_VERSION` | The contract/spec version. **Distinct** from the app `versionName`/`versionCode` and the Python package version. Stamped into `openapi.json` as `info.x-contract-version`. Starts at `1`. |

## Regenerating (after any HTTP-surface change)

From `apps/api`:

```bash
uv run python scripts/generate_openapi_contract.py
```

If the schema surface changed since the committed artifact, the script **refuses
to write unless `CONTRACT_VERSION` was bumped** — so a changed surface can never
be published under the same contract version. Bump `CONTRACT_VERSION` first, then
regenerate.

For a deliberate **internal-only** change (a route or field the Android client
never consumes), pass `--allow-unbumped` to regenerate without a bump:

```bash
uv run python scripts/generate_openapi_contract.py --allow-unbumped
```

Over-bumping is harmless; under-bumping is the hazard, so bump when unsure.

Regenerate with the same Python interpreter family CI uses (currently 3.14). The
output is empirically byte-identical across 3.12–3.14 today, but pinning the
interpreter avoids a future dependency interaction surfacing as a confusing
false-positive drift failure.

## Drift gate

`scripts/check_openapi_contract.py` (and `tests/test_openapi_contract.py`,
wired into backend CI) regenerate the live spec and fail the build if it no
longer matches the committed `openapi.json`. This makes it impossible to change
the API surface and leave the pin stale.

## Not a runtime change

This artifact and its tooling are build-time only. The schema served at runtime
from `/openapi.json` is unchanged — the `x-contract-version` stamp lives only in
the committed file, not the live response.
