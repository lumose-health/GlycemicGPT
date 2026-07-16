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

import difflib
import json
import sys

from src.openapi_contract import (
    ARTIFACT_DISPLAY_PATH,
    generate_spec,
    load_committed,
    serialize_spec,
    surface_of,
)


def main() -> int:
    live_spec = generate_spec()
    live = serialize_spec(live_spec)
    committed = load_committed()

    if not committed:
        print(
            f"ERROR: {ARTIFACT_DISPLAY_PATH} is missing.\n"
            "Generate it with: uv run python scripts/generate_openapi_contract.py",
            file=sys.stderr,
        )
        return 1

    if live == committed:
        print(f"OK: {ARTIFACT_DISPLAY_PATH} matches the live OpenAPI schema.")
        return 0

    # Distinguish a real surface change from a version-only edit so the
    # remediation text is accurate.
    surface_changed = surface_of(live_spec) != surface_of(json.loads(committed))
    cause = (
        "The HTTP surface changed but the pinned artifact was not regenerated."
        if surface_changed
        else "CONTRACT_VERSION changed but the pinned artifact was not regenerated."
    )
    diff = "".join(
        difflib.unified_diff(
            committed.splitlines(keepends=True),
            live.splitlines(keepends=True),
            fromfile=f"committed {ARTIFACT_DISPLAY_PATH}",
            tofile="live app.openapi()",
        )
    )
    print(
        f"ERROR: the committed OpenAPI contract has drifted from the live schema.\n"
        f"{cause}\n\n"
        "Fix:\n"
        "  1. uv run python scripts/generate_openapi_contract.py\n"
        "     (bump apps/api/contract/CONTRACT_VERSION first if the surface "
        "Android consumes changed)\n"
        f"  2. Commit the regenerated {ARTIFACT_DISPLAY_PATH}.\n\n"
        f"Diff (committed -> live):\n{diff}",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
