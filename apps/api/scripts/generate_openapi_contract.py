#!/usr/bin/env python
"""Regenerate the committed OpenAPI contract artifact (GLY-92 / 56.9).

Prefer ``./scripts/regen-contracts.sh`` from the repo root: it runs this *and*
every other committed contract artifact, so the two committed copies of the
document cannot end up half-regenerated. Running this script alone regenerates
only the versioned artifact and leaves the exported-contract gate red.

Run from ``apps/api``:

    uv run python scripts/generate_openapi_contract.py

This dumps ``app.openapi()`` deterministically into
``apps/api/contract/openapi.json`` with the current ``CONTRACT_VERSION`` stamped
into ``info.x-contract-version``.

If the schema surface changed since the committed artifact, the script refuses to
write unless ``apps/api/contract/CONTRACT_VERSION`` was bumped -- so the client
can always detect an incompatible contract. Pass ``--allow-unbumped`` for a
deliberate internal-only change (a route/field the Android client never
consumes), where over-bumping is unnecessary.

See ``src/openapi_contract.py`` and ``apps/api/contract/README.md``.
"""

from __future__ import annotations

import argparse
import sys

from src.openapi_contract import (
    VERSIONED_DISPLAY_PATH,
    ContractVersionNotBumpedError,
    read_contract_version,
    write_versioned,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-unbumped",
        action="store_true",
        help="Regenerate without bumping CONTRACT_VERSION (internal-only change).",
    )
    args = parser.parse_args()

    try:
        write_versioned(allow_unbumped=args.allow_unbumped)
    except ContractVersionNotBumpedError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(
        f"Wrote {VERSIONED_DISPLAY_PATH} (contract version {read_contract_version()})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
