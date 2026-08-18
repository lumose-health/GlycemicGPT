#!/usr/bin/env bash
#
# Regenerate every committed API-contract artifact from the Pydantic schemas.
#
# This is the single command a developer runs after changing the HTTP surface, and
# the one every drift-failure message points at. Nothing it produces is ever
# hand-edited: the Pydantic schemas define the API, OpenAPI describes it, and these
# artifacts are derived. See docs/dev/api-contracts.md.
#
# Everything here is offline and hermetic. The Python generators import the FastAPI
# app and read `app.openapi()`; the TypeScript generator (`web-types`) reads the
# committed `contracts/openapi.json` document instead and needs only Node. Either
# way: no server, no database, no device credentials.
#
# ---------------------------------------------------------------------------
# Adding a generator (a TypeScript client, a Kotlin client, ...)
#
#   1. Write a `gen_<name>()` function below that regenerates exactly one
#      committed artifact and is idempotent: running it twice must leave the tree
#      unchanged.
#   2. Add `<name>` to GENERATORS, after the artifacts it consumes, and a branch
#      to the `case` in the run loop.
#   3. If it needs the Python/uv toolchain, add `<name>` to PYTHON_GENERATORS too
#      (see the availability-check comment above that array).
#   4. Add `<name>` to ARTIFACT_PATHS with the committed path it writes, so the
#      final success message names it. A missed entry falls back to the
#      generator's own name (see the default below) rather than failing the run.
#
# Generators run in array order; each is independent apart from that ordering.
# ---------------------------------------------------------------------------

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"
WEB_DIR="$REPO_ROOT/apps/web"

# Registered generators, in run order.
#
# `versioned-openapi` runs first on purpose: it is the only step that can *refuse*
# to run (an un-bumped CONTRACT_VERSION on a changed surface), and it raises before
# writing anything. Failing fast on that refusal leaves the tree untouched instead
# of half-regenerated. Any other failure can still stop the run mid-way, which the
# run loop reports explicitly. `web-types` runs last: it reads `contracts/openapi.json`,
# so it must follow the `openapi` step that writes it.
GENERATORS=(versioned-openapi openapi web-types)

# Committed artifact each generator writes, keyed by generator name. Used only to
# name what actually changed in the final success message.
declare -A ARTIFACT_PATHS=(
  [versioned-openapi]="apps/api/contract/"
  [openapi]="contracts/"
  [web-types]="apps/web/src/generated/"
)

# Generators that need the Python/uv toolchain. Used below to skip the `uv`
# availability check when `--only web-types` is requested, since that generator
# only needs Node (already required by apps/web tooling) and never imports the
# FastAPI app.
PYTHON_GENERATORS=(versioned-openapi openapi)

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

# apps/web/src/generated/api-schema.ts -- TypeScript types generated from
# contracts/openapi.json via the pinned `openapi-typescript` devDependency.
# Offline and hermetic like the Python generators: it reads the committed
# document, not a running server. apps/web/src/lib/api.ts aliases the
# glucose/insulin wire types in this story's scope to these generated types;
# this file itself is never hand-edited.
#
# Invoked as the binary directly, not `npx openapi-typescript`: the preflight
# above already confirms it's installed, and npx (even with --no-install) can
# still contact the registry when its own resolution cache is stale. Calling
# the binary path is the only way to guarantee zero registry contact.
gen_web_types() {
  (cd "$WEB_DIR" && "$WEB_DIR/node_modules/.bin/openapi-typescript" \
    "$REPO_ROOT/contracts/openapi.json" -o src/generated/api-schema.ts)
}

run_generator() {
  case "$1" in
    versioned-openapi) gen_versioned_openapi ;;
    openapi)           gen_openapi ;;
    web-types)         gen_web_types ;;
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

# Only require uv when a Python generator will actually run -- `--only web-types`
# runs in Node-only environments (e.g. the frontend CI job) that never install it.
needs_uv=0
if [[ -z "$ONLY" ]]; then
  needs_uv=1
else
  for candidate in "${PYTHON_GENERATORS[@]}"; do
    if [[ "$candidate" == "$ONLY" ]]; then
      needs_uv=1
      break
    fi
  done
fi
if [[ $needs_uv -eq 1 ]] && ! command -v uv >/dev/null 2>&1; then
  echo "error: uv is not installed -- see https://docs.astral.sh/uv/" >&2
  exit 1
fi

# Only require the openapi-typescript binary when web-types will actually run --
# mirrors the uv check above. Checked before any generator writes so a missing
# devDependency fails fast instead of leaving the tree half-regenerated.
needs_node=0
if [[ -z "$ONLY" || "$ONLY" == "web-types" ]]; then
  needs_node=1
fi
if [[ $needs_node -eq 1 ]] && [[ ! -x "$WEB_DIR/node_modules/.bin/openapi-typescript" ]]; then
  echo "error: openapi-typescript is not installed -- run 'npm ci' in apps/web" >&2
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

# Name every path that actually ran, derived from COMPLETED rather than hardcoded,
# so a future generator doesn't silently go unmentioned here.
regenerated_paths=()
for generator in "${COMPLETED[@]}"; do
  # Defaulted so a checklist miss (a generator added without its ARTIFACT_PATHS
  # entry) can't die under `set -u` after the regeneration already succeeded --
  # it just names the generator itself instead of its artifact path.
  regenerated_paths+=("${ARTIFACT_PATHS[$generator]:-$generator}")
done
echo "Contracts regenerated. Commit any changes under: ${regenerated_paths[*]}"
