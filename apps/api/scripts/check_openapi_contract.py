#!/usr/bin/env python
"""Fail the backend build when the committed OpenAPI contract has drifted.

Run from ``apps/api``:

    uv run python scripts/check_openapi_contract.py

Regenerates the live spec in memory and compares it byte-for-byte (after
deterministic serialization) with the committed
``apps/api/contract/openapi.json``. Exit 0 when they match; exit 1 with a diff
and remediation instructions when they diverge.

Divergence means the committed artifact was not regenerated after a change --
which would let a separately-shipped Android client pin a stale, incompatible
contract. The fix is always to regenerate the artifact (bumping
``CONTRACT_VERSION`` when the client-consumed surface changed).

See ``src/openapi_contract.py`` and ``apps/api/contract/README.md``.
"""

from __future__ import annotations

import json
import sys

from src.openapi_contract import (
    CONTRACT_VERSION_DISPLAY_PATH,
    REGEN_COMMAND,
    VERSIONED_DISPLAY_PATH,
    generate_spec,
    load_versioned,
    render_drift_report,
    serialize_spec,
    surface_of,
)


def main() -> int:
    live_spec = generate_spec()
    live = serialize_spec(live_spec)
    committed = load_versioned()

    if not committed:
        print(
            f"ERROR: {VERSIONED_DISPLAY_PATH} is missing.\n"
            f"Generate it with: {REGEN_COMMAND}",
            file=sys.stderr,
        )
        return 1

    if live == committed:
        print(f"OK: {VERSIONED_DISPLAY_PATH} matches the live OpenAPI schema.")
        return 0

    # Distinguish a real surface change from a version-only edit so the
    # remediation text is accurate.
    surface_changed = surface_of(live_spec) != surface_of(json.loads(committed))
    cause = (
        "The HTTP surface changed but the pinned artifact was not regenerated."
        if surface_changed
        else "CONTRACT_VERSION changed but the pinned artifact was not regenerated."
    )
    fix_note = (
        f"Bump {CONTRACT_VERSION_DISPLAY_PATH} first if the surface Android "
        "consumes changed."
        if surface_changed
        else None
    )
    print(
        render_drift_report(
            display_path=VERSIONED_DISPLAY_PATH,
            committed=committed,
            live=live,
            cause=cause,
            fix_note=fix_note,
        ),
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
