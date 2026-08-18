"""Contract-drift regression gate (GLY-92 / 56.9).

Pins the committed OpenAPI artifact (``apps/api/contract/openapi.json``) to the
live FastAPI schema so a HTTP-surface change can never silently rot the pin that
``lumose-health/android-unofficial`` diffs against. This is the pytest home of the
same check run standalone by ``scripts/check_openapi_contract.py``.

If this fails: regenerate with ``./scripts/regen-contracts.sh`` from the repo root
and, if the surface Android consumes changed, bump
``apps/api/contract/CONTRACT_VERSION`` first.
"""

from __future__ import annotations

import copy
from collections.abc import Callable
from typing import Any

import pytest

import src.openapi_contract as oc
from src.openapi_contract import (
    CONTRACT_VERSION_KEY,
    ContractVersionNotBumpedError,
    generate_spec,
    load_versioned,
    read_contract_version,
    serialize_spec,
    surface_of,
)


def test_committed_contract_matches_live_schema() -> None:
    """The committed artifact must be byte-identical to the freshly generated spec."""
    assert serialize_spec(generate_spec()) == load_versioned(), (
        "apps/api/contract/openapi.json is stale. Regenerate with "
        "`./scripts/regen-contracts.sh` from the repo root, bumping "
        "apps/api/contract/CONTRACT_VERSION first if the surface changed."
    )


def test_contract_version_is_stamped() -> None:
    """The artifact carries the CONTRACT_VERSION under info.x-contract-version."""
    spec = generate_spec()
    assert spec["info"][CONTRACT_VERSION_KEY] == read_contract_version()


def test_surface_of_ignores_version_stamp() -> None:
    """surface_of strips the version stamp so surfaces compare version-agnostically."""
    a = {"info": {"title": "t", CONTRACT_VERSION_KEY: "1"}, "paths": {"/a": {}}}
    b = {"info": {"title": "t", CONTRACT_VERSION_KEY: "2"}, "paths": {"/a": {}}}
    assert surface_of(a) == surface_of(b)
    assert surface_of(a) != {"info": {"title": "t"}, "paths": {"/a": {}, "/b": {}}}


def _stamped(surface: dict[str, Any], version: str) -> dict[str, Any]:
    """Return ``surface`` stamped with ``version``, as ``generate_spec`` would."""
    stamped = copy.deepcopy(surface)
    stamped.setdefault("info", {})[CONTRACT_VERSION_KEY] = version
    return stamped


def _seed_committed(tmp_path, monkeypatch, spec: dict) -> None:
    """Point the contract paths at a temp artifact seeded with ``spec``."""
    artifact = tmp_path / "openapi.json"
    artifact.write_text(serialize_spec(spec), encoding="utf-8")
    monkeypatch.setattr(oc, "VERSIONED_ARTIFACT", artifact)
    monkeypatch.setattr(oc, "VERSIONED_CONTRACT_DIR", tmp_path)


def _stub_generate_spec(surface: dict[str, Any]) -> Callable[[], dict[str, Any]]:
    """Stand in for ``generate_spec``: ``surface``, stamped at call time.

    Deliberately re-reads ``read_contract_version()`` on every call, exactly as the
    real ``generate_spec`` does. A stub returning a fixed dict with a hard-coded
    stamp would let a write that emitted stale version metadata pass unnoticed --
    which is the thing these tests exist to catch.
    """

    def _generate() -> dict[str, Any]:
        return _stamped(surface, oc.read_contract_version())

    return _generate


def test_write_versioned_blocks_surface_change_without_bump(
    tmp_path, monkeypatch
) -> None:
    """A changed surface with an unchanged CONTRACT_VERSION is refused."""
    prior_surface = {"info": {"title": "t"}, "paths": {"/a": {}}}
    changed_surface = {"info": {"title": "t"}, "paths": {"/a": {}, "/b": {}}}
    _seed_committed(tmp_path, monkeypatch, _stamped(prior_surface, "1"))
    monkeypatch.setattr(oc, "generate_spec", _stub_generate_spec(changed_surface))
    monkeypatch.setattr(oc, "read_contract_version", lambda: "1")

    # A rejected write must leave the committed artifact untouched -- no partial
    # write before the raise.
    artifact = tmp_path / "openapi.json"
    before = artifact.read_bytes()
    with pytest.raises(ContractVersionNotBumpedError):
        oc.write_versioned()
    assert artifact.read_bytes() == before

    # Bumping the version lets the same surface change through -- and the artifact
    # written is the whole stamped spec, carrying the *bumped* version. Comparing
    # the complete serialization (rather than substring-matching the new path)
    # is what makes a stale ``x-contract-version`` a failure.
    monkeypatch.setattr(oc, "read_contract_version", lambda: "2")
    oc.write_versioned()
    assert artifact.read_text(encoding="utf-8") == serialize_spec(
        _stamped(changed_surface, "2")
    )


def test_write_versioned_allow_unbumped_is_a_blanket_override(
    tmp_path, monkeypatch
) -> None:
    """--allow-unbumped bypasses enforcement even for a changed HTTP surface.

    The flag is a deliberate *blanket* human override, not a tool-detected
    "internal-only" classification: the caller takes responsibility for asserting
    the changed surface is not client-consumed. This pins that documented
    behavior -- a new public path ``/internal`` (a genuine surface change) is
    written without a version bump when the flag is set.
    """
    prior_surface = {"info": {"title": "t"}, "paths": {"/a": {}}}
    changed_surface = {"info": {"title": "t"}, "paths": {"/a": {}, "/internal": {}}}
    _seed_committed(tmp_path, monkeypatch, _stamped(prior_surface, "1"))
    monkeypatch.setattr(oc, "generate_spec", _stub_generate_spec(changed_surface))
    monkeypatch.setattr(oc, "read_contract_version", lambda: "1")

    # Sanity: this really is a surface change (not something surface_of excludes),
    # so the override is genuinely suppressing the bump enforcement.
    assert surface_of(changed_surface) != surface_of(prior_surface)

    oc.write_versioned(allow_unbumped=True)
    # The whole artifact, stamped with the *unbumped* version -- the override
    # writes the changed surface without inventing a version bump.
    assert (tmp_path / "openapi.json").read_text(encoding="utf-8") == serialize_spec(
        _stamped(changed_surface, "1")
    )
