"""Contract-drift regression gate (GLY-92 / 56.9).

Pins the committed OpenAPI artifact (``apps/api/contract/openapi.json``) to the
live FastAPI schema so a HTTP-surface change can never silently rot the pin that
``glycemicgpt-android-unofficial`` diffs against. This is the pytest home of the
same check run standalone by ``scripts/check_openapi_contract.py``.

If this fails: regenerate with
``uv run python scripts/generate_openapi_contract.py`` and, if the surface Android
consumes changed, bump ``apps/api/contract/CONTRACT_VERSION``.
"""

from __future__ import annotations

import pytest

import src.openapi_contract as oc
from src.openapi_contract import (
    CONTRACT_VERSION_KEY,
    ContractVersionNotBumpedError,
    generate_spec,
    load_committed,
    read_contract_version,
    serialize_spec,
    surface_of,
)


def test_committed_contract_matches_live_schema() -> None:
    """The committed artifact must be byte-identical to the freshly generated spec."""
    assert serialize_spec(generate_spec()) == load_committed(), (
        "apps/api/contract/openapi.json is stale. Regenerate with "
        "`uv run python scripts/generate_openapi_contract.py` and bump "
        "apps/api/contract/CONTRACT_VERSION if the surface changed."
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


def _seed_committed(tmp_path, monkeypatch, spec: dict) -> None:
    """Point the contract paths at a temp artifact seeded with ``spec``."""
    artifact = tmp_path / "openapi.json"
    artifact.write_text(serialize_spec(spec), encoding="utf-8")
    monkeypatch.setattr(oc, "OPENAPI_ARTIFACT", artifact)
    monkeypatch.setattr(oc, "CONTRACT_DIR", tmp_path)


def test_write_committed_blocks_surface_change_without_bump(
    tmp_path, monkeypatch
) -> None:
    """A changed surface with an unchanged CONTRACT_VERSION is refused."""
    prior = {"info": {"title": "t", CONTRACT_VERSION_KEY: "1"}, "paths": {"/a": {}}}
    changed = {
        "info": {"title": "t", CONTRACT_VERSION_KEY: "1"},
        "paths": {"/a": {}, "/b": {}},
    }
    _seed_committed(tmp_path, monkeypatch, prior)
    monkeypatch.setattr(oc, "generate_spec", lambda: changed)
    monkeypatch.setattr(oc, "read_contract_version", lambda: "1")

    # A rejected write must leave the committed artifact untouched -- no partial
    # write before the raise.
    artifact = tmp_path / "openapi.json"
    before = artifact.read_bytes()
    with pytest.raises(ContractVersionNotBumpedError):
        oc.write_committed()
    assert artifact.read_bytes() == before

    # Bumping the version lets the same surface change through.
    monkeypatch.setattr(oc, "read_contract_version", lambda: "2")
    oc.write_committed()
    assert "/b" in artifact.read_text(encoding="utf-8")


def test_write_committed_allow_unbumped_is_a_blanket_override(
    tmp_path, monkeypatch
) -> None:
    """--allow-unbumped bypasses enforcement even for a changed HTTP surface.

    The flag is a deliberate *blanket* human override, not a tool-detected
    "internal-only" classification: the caller takes responsibility for asserting
    the changed surface is not client-consumed. This pins that documented
    behavior -- a new public path ``/internal`` (a genuine surface change) is
    written without a version bump when the flag is set.
    """
    prior = {"info": {"title": "t", CONTRACT_VERSION_KEY: "1"}, "paths": {"/a": {}}}
    changed = {
        "info": {"title": "t", CONTRACT_VERSION_KEY: "1"},
        "paths": {"/a": {}, "/internal": {}},
    }
    _seed_committed(tmp_path, monkeypatch, prior)
    monkeypatch.setattr(oc, "generate_spec", lambda: changed)
    monkeypatch.setattr(oc, "read_contract_version", lambda: "1")

    # Sanity: this really is a surface change (not something surface_of excludes),
    # so the override is genuinely suppressing the bump enforcement.
    assert surface_of(changed) != surface_of(prior)

    oc.write_committed(allow_unbumped=True)
    assert "/internal" in (tmp_path / "openapi.json").read_text(encoding="utf-8")
