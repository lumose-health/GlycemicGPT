"""Versioned OpenAPI contract artifact tooling (GLY-92 / 56.9).

The Android/Wear apps are being extracted from this monorepo. Once mobile ships
on its own cadence, nothing co-located enforces that the backend HTTP surface and
the client stay compatible. This module turns the previously-implicit contract
into an explicit, pinned artifact:

* ``apps/api/contract/openapi.json`` -- a deterministic snapshot of the live
  FastAPI schema (``app.openapi()``), stamped with a contract version.
* ``apps/api/contract/CONTRACT_VERSION`` -- the contract/spec version, which is
  intentionally *distinct* from the app ``versionName``/``versionCode`` and the
  Python package version. It bumps when the HTTP surface changes.

``glycemicgpt-android-unofficial`` pins the committed ``openapi.json`` and diffs
its DTOs against it. The drift check (``scripts/check_openapi_contract.py`` and
``tests/test_openapi_contract.py``) fails the backend build when the committed
artifact no longer matches the live schema, so the pin can never silently rot.

This tooling is build-time only: it does **not** alter the schema served at
runtime from ``/openapi.json`` (no ``x-contract-version`` is added to the live
response). The stamp lives solely in the committed artifact.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

# apps/api/ -- two parents up from src/openapi_contract.py
_API_ROOT = Path(__file__).resolve().parent.parent
CONTRACT_DIR = _API_ROOT / "contract"
CONTRACT_VERSION_FILE = CONTRACT_DIR / "CONTRACT_VERSION"
OPENAPI_ARTIFACT = CONTRACT_DIR / "openapi.json"

# Repo-relative path for user-facing messages, so CI logs and remediation text
# read consistently regardless of the absolute checkout location.
ARTIFACT_DISPLAY_PATH = "apps/api/contract/openapi.json"
CONTRACT_VERSION_DISPLAY_PATH = "apps/api/contract/CONTRACT_VERSION"

# Key under the OpenAPI ``info`` object that carries the contract version. The
# ``x-`` prefix is the OpenAPI-sanctioned extension namespace, so this stays a
# valid spec.
CONTRACT_VERSION_KEY = "x-contract-version"


def read_contract_version() -> str:
    """Return the current contract version from ``CONTRACT_VERSION`` (trimmed)."""
    return CONTRACT_VERSION_FILE.read_text(encoding="utf-8").strip()


def generate_spec() -> dict[str, Any]:
    """Build the contract spec from the live app schema, version stamp applied.

    Imports the FastAPI app lazily so importing this module stays cheap and free
    of app-construction side effects. The app's own ``openapi()`` output is
    deep-copied before stamping so the live in-memory schema is never mutated.
    """
    from src.main import app

    spec = copy.deepcopy(app.openapi())
    spec.setdefault("info", {})[CONTRACT_VERSION_KEY] = read_contract_version()
    return spec


def serialize_spec(spec: dict[str, Any]) -> str:
    """Serialize a spec deterministically so byte-diffs are stable.

    ``sort_keys`` normalizes object key ordering (the one source of nondeterminism
    in FastAPI's schema assembly); a trailing newline keeps the file POSIX-clean.
    """
    return json.dumps(spec, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def load_committed() -> str:
    """Return the committed artifact's text (empty string if it does not exist)."""
    if not OPENAPI_ARTIFACT.exists():
        return ""
    return OPENAPI_ARTIFACT.read_text(encoding="utf-8")


def surface_of(spec: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of ``spec`` with the contract-version stamp removed.

    Comparing two ``surface_of`` results answers "did the HTTP shape change,
    ignoring the version bump?" -- which is what distinguishes a real surface
    change from a version-only edit.
    """
    stripped = copy.deepcopy(spec)
    stripped.get("info", {}).pop(CONTRACT_VERSION_KEY, None)
    return stripped


def _committed_version() -> str | None:
    """Return the ``x-contract-version`` stamped in the committed artifact.

    None when there is no committed artifact yet (first introduction).
    """
    committed = load_committed()
    if not committed:
        return None
    return json.loads(committed).get("info", {}).get(CONTRACT_VERSION_KEY)


def write_committed(*, allow_unbumped: bool = False) -> str:
    """Regenerate and write the committed artifact. Returns the serialized text.

    Enforces the bump-on-surface-change invariant at generation time: if the new
    schema's surface differs from the currently-committed one but
    ``CONTRACT_VERSION`` was not bumped, raise ``ContractVersionNotBumpedError`` rather
    than silently emit an artifact that claims the same version for a changed
    surface. ``allow_unbumped=True`` is the escape hatch for a deliberate
    internal-only change (a route/field the Android client never consumes), where
    over-bumping is unnecessary -- the caller has judged the client surface
    unchanged.
    """
    new_spec = generate_spec()
    prior_version = _committed_version()
    if not allow_unbumped and prior_version is not None:
        prior_surface = surface_of(json.loads(load_committed()))
        if surface_of(new_spec) != prior_surface:
            new_version = read_contract_version()
            if new_version == prior_version:
                raise ContractVersionNotBumpedError(prior_version)

    CONTRACT_DIR.mkdir(parents=True, exist_ok=True)
    text = serialize_spec(new_spec)
    OPENAPI_ARTIFACT.write_text(text, encoding="utf-8")
    return text


class ContractVersionNotBumpedError(RuntimeError):
    """Raised when the HTTP surface changed but ``CONTRACT_VERSION`` did not."""

    def __init__(self, current_version: str) -> None:
        super().__init__(
            "The HTTP surface changed but "
            f"{CONTRACT_VERSION_DISPLAY_PATH} is still {current_version!r}.\n"
            f"Bump {CONTRACT_VERSION_DISPLAY_PATH} before regenerating so the "
            "Android client can detect the incompatible contract, or pass "
            "--allow-unbumped for a deliberate internal-only change the client "
            "does not consume."
        )
