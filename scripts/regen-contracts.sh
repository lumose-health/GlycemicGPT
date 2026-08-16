#!/usr/bin/env bash
#
# Regenerate every committed API-contract artifact from the Pydantic schemas.
#
#   ./scripts/regen-contracts.sh                       # regenerate everything
#   ./scripts/regen-contracts.sh --list                # show the registered generators
#   ./scripts/regen-contracts.sh --only openapi        # run just one
#   ./scripts/regen-contracts.sh --allow-unbumped      # see gen_versioned_openapi below
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
# Adding a generator (GLY-180 TypeScript, GLY-181 Kotlin/Swift, ...)
#
#   1. Write a `gen_<name>()` function below that regenerates exactly one
#      committed artifact and is idempotent (running it twice must leave the tree
#      unchanged -- CI asserts this).
#   2. Append `<name>` to GENERATORS, after the artifacts it consumes.
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
# writing anything. Failing fast there leaves the whole tree untouched rather than
# half-regenerated.
GENERATORS=(versioned-openapi openapi)

ONLY=""
PASSTHROUGH_ARGS=()

usage() {
  sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^#\{1,2\} \{0,1\}//'
}

# apps/api/contract/openapi.json -- the version-stamped pin that
# glycemicgpt-android-unofficial diffs its DTOs against. Refuses to write when the
# HTTP surface changed but apps/api/contract/CONTRACT_VERSION did not;
# --allow-unbumped is the deliberate override for an internal-only change the
# client never consumes.
gen_versioned_openapi() {
  (cd "$API_DIR" && uv run python scripts/generate_openapi_contract.py \
    ${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"})
}

# contracts/openapi.json -- the unstamped document the app actually serves. The
# single source of truth for client generation and for the security suite's fuzzing.
gen_openapi() {
  (cd "$API_DIR" && uv run python scripts/export_openapi.py)
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
  # shellcheck disable=SC2076  # literal match against the registry is intended
  if [[ ! " ${GENERATORS[*]} " =~ " ${ONLY} " ]]; then
    echo "error: unknown generator '$ONLY'. Known: ${GENERATORS[*]}" >&2
    exit 2
  fi
fi

for generator in "${GENERATORS[@]}"; do
  if [[ -n "$ONLY" && "$ONLY" != "$generator" ]]; then
    continue
  fi
  echo "==> ${generator}"
  "gen_${generator//-/_}"
done

echo "Contracts regenerated. Commit any changes under contracts/ and apps/api/contract/."
