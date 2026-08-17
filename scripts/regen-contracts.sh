#!/usr/bin/env bash
#
# Regenerate every committed API-contract artifact from the Pydantic schemas.
#
# This is the single command a developer runs after changing the HTTP surface, and
# the one every drift-failure message points at. Nothing it produces is ever
# hand-edited: the Pydantic schemas define the API, OpenAPI describes it, and these
# artifacts are derived. See docs/dev/api-contracts.md.
#
# Everything here is offline and hermetic -- it imports the FastAPI app and reads
# `app.openapi()`. No server, no database, no device credentials.
#
# ---------------------------------------------------------------------------
# Adding a generator (a TypeScript client, a Kotlin client, ...)
#
#   1. Write a `gen_<name>()` function below that regenerates exactly one
#      committed artifact and is idempotent: running it twice must leave the tree
#      unchanged.
#   2. Add `<name>` to GENERATORS, after the artifacts it consumes, and a branch
#      to the `case` in the run loop.
#
# Generators run in array order; each is independent apart from that ordering.
# ---------------------------------------------------------------------------

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"

# Registered generators, in run order.
#
# `versioned-openapi` runs first on purpose: it is the only step that can *refuse*
# to run (an un-bumped CONTRACT_VERSION on a changed surface), and it raises before
# writing anything. Failing fast on that refusal leaves the tree untouched instead
# of half-regenerated. Any other failure can still stop the run mid-way, which the
# run loop reports explicitly.
GENERATORS=(versioned-openapi openapi)

ONLY=""
ALLOW_UNBUMPED=0
PASSTHROUGH_ARGS=()
COMPLETED=()

# A generator can fail after an earlier one has already rewritten its artifact, which
# leaves the tree half-regenerated. Only say so when it is actually true: the common
# failure (the version-bump refusal from the first generator) writes nothing.
warn_if_partway() {
  [[ ${#COMPLETED[@]} -gt 0 ]] || return 0
  echo "" >&2
  echo "error: regeneration failed part-way through. Already rewritten:" \
    "${COMPLETED[*]}." >&2
  echo "       Check 'git status' before committing, and re-run this script once" >&2
  echo "       the underlying failure is fixed." >&2
}

usage() {
  cat <<'USAGE'
Regenerate every committed API-contract artifact from the Pydantic schemas.

Usage:
  ./scripts/regen-contracts.sh                    Regenerate everything
  ./scripts/regen-contracts.sh --list             List the registered generators
  ./scripts/regen-contracts.sh --only <name>      Run just one generator
  ./scripts/regen-contracts.sh --allow-unbumped   Regenerate the versioned contract
                                                  without bumping CONTRACT_VERSION
                                                  (deliberate internal-only change)
  ./scripts/regen-contracts.sh --help             Show this message

Run from anywhere; paths resolve relative to the repository root.
See docs/dev/api-contracts.md for the full workflow.
USAGE
}

# apps/api/contract/openapi.json -- the version-stamped pin that
# lumose-health/android-unofficial diffs its DTOs against. Refuses to write when the
# HTTP surface changed but apps/api/contract/CONTRACT_VERSION did not;
# --allow-unbumped is the deliberate override for an internal-only change the
# client never consumes.
gen_versioned_openapi() {
  (cd "$API_DIR" && uv run python scripts/generate_openapi_contract.py \
    ${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"})
}

# contracts/openapi.json -- the unstamped document the app actually serves. The
# single source of truth for client generation.
gen_openapi() {
  (cd "$API_DIR" && uv run python scripts/export_openapi.py)
}

run_generator() {
  case "$1" in
    versioned-openapi) gen_versioned_openapi ;;
    openapi)           gen_openapi ;;
    *)
      echo "error: generator '$1' is registered but has no case branch" >&2
      return 2
      ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --list)
      printf '%s\n' "${GENERATORS[@]}"
      exit 0
      ;;
    --only)
      [[ $# -ge 2 ]] || { echo "error: --only needs a generator name" >&2; exit 2; }
      ONLY="$2"
      shift 2
      ;;
    --allow-unbumped)
      ALLOW_UNBUMPED=1
      PASSTHROUGH_ARGS+=("$1")
      shift
      ;;
    *)
      echo "error: unknown argument '$1'" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v uv >/dev/null 2>&1; then
  echo "error: uv is not installed -- see https://docs.astral.sh/uv/" >&2
  exit 1
fi

if [[ -n "$ONLY" ]]; then
  # Exact match against each registered name, one at a time. A substring test
  # against the flattened array accepts values the run loop then matches against
  # nothing -- `--only 'versioned-openapi openapi'` would pass the check, skip every
  # generator, and still report success with nothing regenerated.
  known=0
  for candidate in "${GENERATORS[@]}"; do
    if [[ "$candidate" == "$ONLY" ]]; then
      known=1
      break
    fi
  done
  if [[ $known -eq 0 ]]; then
    echo "error: unknown generator '$ONLY'. Known: ${GENERATORS[*]}" >&2
    exit 2
  fi
  # --allow-unbumped only reaches the versioned-openapi generator. Combining it
  # with an --only that filters that generator out silently discards it, which
  # reads as "the override was applied" when it was not.
  if [[ $ALLOW_UNBUMPED -eq 1 && "$ONLY" != "versioned-openapi" ]]; then
    echo "error: --allow-unbumped only applies to the 'versioned-openapi' generator," >&2
    echo "       which --only '$ONLY' excludes. Drop one of the two flags." >&2
    exit 2
  fi
fi

for generator in "${GENERATORS[@]}"; do
  if [[ -n "$ONLY" && "$ONLY" != "$generator" ]]; then
    continue
  fi
  echo "==> ${generator}"
  # Handled explicitly rather than left to `set -e` (or an ERR trap, which the
  # generators' subshells would fire a second time) so the half-regenerated warning
  # is emitted exactly once, from this shell, before exiting.
  status=0
  run_generator "$generator" || status=$?
  if [[ $status -ne 0 ]]; then
    warn_if_partway
    exit "$status"
  fi
  COMPLETED+=("$generator")
done

echo "Contracts regenerated. Commit any changes under contracts/ and apps/api/contract/."
