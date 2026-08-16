#!/usr/bin/env python
"""Export the served OpenAPI document to ``contracts/openapi.json`` (GLY-179).

Run from ``apps/api``:

    uv run python scripts/export_openapi.py            # write the artifact
    uv run python scripts/export_openapi.py --check     # fail if it has drifted

Prefer ``./scripts/regen-contracts.sh`` from the repo root, which runs this plus
every other committed generated artifact in one go.

The document is produced by importing the FastAPI app and calling ``app.openapi()``
-- no running server, no database, no device credentials. Output is serialized with
sorted keys and a trailing newline, so repeated runs are byte-identical and diffs
stay reviewable.

``--check`` is the CI staleness gate: it regenerates in memory and compares against
the committed file, so a changed Pydantic schema that was not followed by a
regeneration fails the build instead of silently publishing a stale contract to
client generators.

See ``src/openapi_contract.py`` and ``contracts/README.md``.
"""

from __future__ import annotations

import argparse
import difflib
import sys

from src.openapi_contract import (
    EXPORTED_DISPLAY_PATH,
    REGEN_COMMAND,
    generate_exported_spec,
    load_exported,
    serialize_spec,
    write_exported,
)

# Full diffs of a ~750 KB document bury the signal in CI logs; this is enough to
# see what moved, and the remediation is the same regardless of size.
_MAX_DIFF_LINES = 200


def _check() -> int:
    live = serialize_spec(generate_exported_spec())
    committed = load_exported()

    if not committed:
        print(
            f"ERROR: {EXPORTED_DISPLAY_PATH} is missing.\n"
            f"Generate it with: {REGEN_COMMAND}",
            file=sys.stderr,
        )
        return 1

    if live == committed:
        print(f"OK: {EXPORTED_DISPLAY_PATH} matches the live OpenAPI schema.")
        return 0

    diff_lines = list(
        difflib.unified_diff(
            committed.splitlines(keepends=True),
            live.splitlines(keepends=True),
            fromfile=f"committed {EXPORTED_DISPLAY_PATH}",
            tofile="live app.openapi()",
        )
    )
    truncated = ""
    if len(diff_lines) > _MAX_DIFF_LINES:
        truncated = (
            f"\n... diff truncated ({len(diff_lines) - _MAX_DIFF_LINES} more lines)\n"
        )
        diff_lines = diff_lines[:_MAX_DIFF_LINES]

    print(
        f"ERROR: {EXPORTED_DISPLAY_PATH} has drifted from the live OpenAPI schema.\n"
        "The API surface changed but the committed contract was not regenerated, so "
        "generated clients would be built from a stale spec.\n\n"
        f"Fix: run {REGEN_COMMAND} and commit the result.\n\n"
        f"Diff (committed -> live):\n{''.join(diff_lines)}{truncated}",
        file=sys.stderr,
    )
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Do not write; exit 1 if the committed artifact is stale.",
    )
    args = parser.parse_args()

    if args.check:
        return _check()

    write_exported()
    print(f"Wrote {EXPORTED_DISPLAY_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
