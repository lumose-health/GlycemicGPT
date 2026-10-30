"""Story 43.1: tests for Nightscout connection management.

Mocks the connection-test stub at the httpx layer so tests don't reach
out to the real internet. We verify model + endpoints + RBAC + the
shape of what the test stub does. Story 43.2 ships proper integration
tests against a real Nightscout instance.
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select, update

from src.core.encryption import decrypt_credential
from src.database import get_session_maker
from src.main import app
from src.models.device_status_snapshot import DeviceStatusSnapshot
from src.models.nightscout_connection import (
    NightscoutConnection,
    NightscoutSyncStatus,
)
from src.models.nightscout_profile_snapshot import NightscoutProfileSnapshot
from src.models.pump_data import PumpEvent
from src.models.user import User
from src.schemas.nightscout import canonical_nightscout_url
from src.services.diabetes_context import build_pump_section
from src.services.integrations.nightscout.connection_test import ConnectionTestOutcome
from src.services.integrations.nightscout.translator import translate_treatments

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ok_outcome(server_version: str = "15.0.3") -> ConnectionTestOutcome:
    return ConnectionTestOutcome(
        ok=True,
        server_version=server_version,
        api_version_detected=None,  # router fills this in from the request
        auth_validated=True,
    )


def _fail_outcome(error: str = "auth rejected") -> ConnectionTestOutcome:
    return ConnectionTestOutcome(ok=False, error=error)


def _patch_test_connection(outcome: ConnectionTestOutcome):
    """Patch the connection-test stub used by the router."""
    return patch(
        "src.routers.nightscout.test_connection",
        new=AsyncMock(return_value=outcome),
    )


def _unique_email(stem: str) -> str:
    """UUID-suffixed test email for cross-test isolation.

    Even if a test crashes between user creation and cleanup, the next
    run uses a different email so it doesn't collide with the leaked
    row.
    """
    return f"{stem}_{uuid.uuid4().hex[:10]}@example.com"


async def _register_and_login(client, email: str, password: str = "Test1234!"):
    from src.config import settings

    reg = await client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    assert reg.status_code in (200, 201), f"register failed: {reg.text}"
    resp = await client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200, f"login failed: {resp.text}"
    cookie = resp.cookies.get(settings.jwt_cookie_name)
    assert cookie, "login did not set the auth cookie"
    return {settings.jwt_cookie_name: cookie}


async def _cleanup_nightscout_users(emails: list[str]) -> None:
    """Tear down rows + users we created during tests."""
    async with get_session_maker()() as db:
        result = await db.execute(User.__table__.select().where(User.email.in_(emails)))
        ids = [row.id for row in result.fetchall()]
        if ids:
            await db.execute(delete(PumpEvent).where(PumpEvent.user_id.in_(ids)))
            await db.execute(
                delete(NightscoutConnection).where(
                    NightscoutConnection.user_id.in_(ids)
                )
            )
            await db.execute(delete(User).where(User.id.in_(ids)))
            await db.commit()


@pytest_asyncio.fixture
async def http_client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


# ---------------------------------------------------------------------------
# POST /api/integrations/nightscout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_connection_succeeds_when_test_passes(http_client):
    email = _unique_email("ns_create_ok")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome("15.0.3")):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "My NS",
                    "base_url": "https://my-ns.example.com",
                    "auth_type": "secret",
                    "credential": "test-api-secret-12chars",
                    "api_version": "v1",
                },
            )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["test"]["ok"] is True
        assert body["test"]["server_version"] == "15.0.3"
        assert body["connection"]["name"] == "My NS"
        assert body["connection"]["has_credential"] is True
        assert body["connection"]["base_url"] == "https://my-ns.example.com"
        assert body["connection"]["sync_interval_minutes"] == 5
        assert body["connection"]["initial_sync_window_days"] == 7
        # Credential is never returned.
        assert "credential" not in body["connection"]
        assert "encrypted_credential" not in body["connection"]
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_create_connection_returns_400_when_test_fails(http_client):
    email = _unique_email("ns_create_fail")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_fail_outcome("Authentication rejected")):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Bad creds",
                    "base_url": "https://my-ns.example.com",
                    "auth_type": "secret",
                    "credential": "wrong",
                    "api_version": "v1",
                },
            )
        assert resp.status_code == 400, resp.text
        # Persists nothing on failure.
        list_resp = await http_client.get(
            "/api/integrations/nightscout", cookies=cookies
        )
        assert list_resp.status_code == 200
        assert list_resp.json()["connections"] == []
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_create_connection_rejects_bad_url_at_schema_layer(http_client):
    email = _unique_email("ns_bad_url")
    cookies = await _register_and_login(http_client, email)
    try:
        # No connection-test patch needed -- request rejected before we get there.
        resp = await http_client.post(
            "/api/integrations/nightscout",
            cookies=cookies,
            json={
                "name": "Bad URL",
                "base_url": "ftp://nope.example.com",
                "auth_type": "secret",
                "credential": "x",
                "api_version": "v1",
            },
        )
        assert resp.status_code == 422
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_create_connection_strips_trailing_slash(http_client):
    email = _unique_email("ns_trailing")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Trailing",
                    "base_url": "https://my-ns.example.com/",  # trailing slash
                    "auth_type": "secret",
                    "credential": "secret123",
                    "api_version": "v1",
                },
            )
        assert resp.status_code == 201
        assert resp.json()["connection"]["base_url"] == "https://my-ns.example.com"
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_create_connection_credential_is_encrypted_in_db(http_client):
    email = _unique_email("ns_encrypted")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Encrypted",
                    "base_url": "https://my-ns.example.com",
                    "auth_type": "secret",
                    "credential": "supersecret-plaintext-12chars",
                    "api_version": "v1",
                },
            )
        assert resp.status_code == 201
        connection_id = resp.json()["connection"]["id"]

        # Inspect the DB directly: the raw column must NOT contain the
        # plaintext, AND the round-trip must recover it.
        async with get_session_maker()() as db:
            row = (
                await db.execute(
                    NightscoutConnection.__table__.select().where(
                        NightscoutConnection.id == uuid.UUID(connection_id)
                    )
                )
            ).first()
            assert row is not None
            stored = row.encrypted_credential
            assert "supersecret-plaintext-12chars" not in stored
            assert decrypt_credential(stored) == "supersecret-plaintext-12chars"
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_create_connection_without_credential_succeeds(http_client):
    """A public, read-only Nightscout instance (AUTH_DEFAULT_ROLE=readable)
    has no API_SECRET/token to enter -- `credential` must be optional, not
    silently required by the wire schema."""
    email = _unique_email("ns_no_cred")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Public instance",
                    "base_url": "https://public-ns.example.com",
                    "api_version": "v1",
                },
            )
        assert resp.status_code == 201
        body = resp.json()
        assert body["connection"]["has_credential"] is False
        connection_id = body["connection"]["id"]

        # Stored value round-trips as "", not a Fernet ciphertext of "" --
        # otherwise has_credential (bool(encrypted_credential)) would
        # incorrectly report True forever.
        async with get_session_maker()() as db:
            row = (
                await db.execute(
                    NightscoutConnection.__table__.select().where(
                        NightscoutConnection.id == uuid.UUID(connection_id)
                    )
                )
            ).first()
            assert row is not None
            assert row.encrypted_credential == ""
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_create_connection_with_blank_credential_treated_as_none(http_client):
    """A whitespace-only credential (stray spaces from copy-paste) is
    normalized to "no credential" rather than stored/sent as literal
    whitespace."""
    email = _unique_email("ns_blank_cred")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Blank credential",
                    "base_url": "https://public-ns2.example.com",
                    "credential": "   ",
                    "api_version": "v1",
                },
            )
        assert resp.status_code == 201
        assert resp.json()["connection"]["has_credential"] is False
    finally:
        await _cleanup_nightscout_users([email])


# ---------------------------------------------------------------------------
# GET list / single + RBAC
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_returns_only_own_connections(http_client):
    """User A and User B each create a connection. List shows only own."""
    email_a = _unique_email("ns_list_a")
    email_b = _unique_email("ns_list_b")
    cookies_a = await _register_and_login(http_client, email_a)
    cookies_b = await _register_and_login(http_client, email_b)
    try:
        with _patch_test_connection(_ok_outcome()):
            await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies_a,
                json={
                    "name": "A's NS",
                    "base_url": "https://ns-a.example.com",
                    "auth_type": "secret",
                    "credential": "secretA",
                    "api_version": "v1",
                },
            )
            await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies_b,
                json={
                    "name": "B's NS",
                    "base_url": "https://ns-b.example.com",
                    "auth_type": "secret",
                    "credential": "secretB",
                    "api_version": "v1",
                },
            )

        # User A sees only A's
        resp_a = await http_client.get(
            "/api/integrations/nightscout", cookies=cookies_a
        )
        assert resp_a.status_code == 200
        names_a = [c["name"] for c in resp_a.json()["connections"]]
        assert names_a == ["A's NS"]

        # User B sees only B's
        resp_b = await http_client.get(
            "/api/integrations/nightscout", cookies=cookies_b
        )
        assert resp_b.status_code == 200
        names_b = [c["name"] for c in resp_b.json()["connections"]]
        assert names_b == ["B's NS"]
    finally:
        await _cleanup_nightscout_users([email_a, email_b])


@pytest.mark.asyncio
async def test_get_single_rejects_cross_tenant_with_404(http_client):
    """User A cannot read User B's connection by ID -- 404 (not 403)."""
    email_a = _unique_email("ns_xt_a")
    email_b = _unique_email("ns_xt_b")
    cookies_a = await _register_and_login(http_client, email_a)
    cookies_b = await _register_and_login(http_client, email_b)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies_b,
                json={
                    "name": "B private",
                    "base_url": "https://ns-private.example.com",
                    "auth_type": "secret",
                    "credential": "private",
                    "api_version": "v1",
                },
            )
        assert resp.status_code == 201, resp.text
        b_id = resp.json()["connection"]["id"]

        # User A tries to read B's connection -> 404, not 403.
        # Returning 404 (not 403) avoids leaking the existence of B's
        # connection IDs to A.
        resp = await http_client.get(
            f"/api/integrations/nightscout/{b_id}", cookies=cookies_a
        )
        assert resp.status_code == 404
    finally:
        await _cleanup_nightscout_users([email_a, email_b])


@pytest.mark.asyncio
async def test_unauthenticated_request_rejected(http_client):
    resp = await http_client.get("/api/integrations/nightscout")
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# PATCH
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_without_url_or_credential_does_not_retest(http_client):
    """Renaming a connection should NOT trigger a re-test."""
    email = _unique_email("ns_patch_norest")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Original",
                    "base_url": "https://ns.example.com",
                    "auth_type": "secret",
                    "credential": "secret",
                    "api_version": "v1",
                },
            )
        cid = resp.json()["connection"]["id"]

        # Patch only the name -- re-test should NOT be invoked.
        with patch(
            "src.routers.nightscout.test_connection",
            new=AsyncMock(return_value=_ok_outcome()),
        ) as mock_test:
            resp = await http_client.patch(
                f"/api/integrations/nightscout/{cid}",
                cookies=cookies,
                json={"name": "Renamed"},
            )
        assert resp.status_code == 200
        assert resp.json()["connection"]["name"] == "Renamed"
        mock_test.assert_not_called()
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_patch_with_credential_change_retests(http_client):
    email = _unique_email("ns_patch_cred")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Cred patch",
                    "base_url": "https://ns.example.com",
                    "auth_type": "secret",
                    "credential": "old-secret",
                    "api_version": "v1",
                },
            )
        cid = resp.json()["connection"]["id"]

        with patch(
            "src.routers.nightscout.test_connection",
            new=AsyncMock(return_value=_ok_outcome()),
        ) as mock_test:
            resp = await http_client.patch(
                f"/api/integrations/nightscout/{cid}",
                cookies=cookies,
                json={"credential": "new-secret"},
            )
        assert resp.status_code == 200
        assert resp.json()["test"]["ok"] is True
        mock_test.assert_called_once()
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_patch_failed_retest_does_not_persist_bad_credential(
    http_client,
):
    """Bad credential update -> 400 -> old credential still works."""
    email = _unique_email("ns_patch_bad")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Bad patch",
                    "base_url": "https://ns.example.com",
                    "auth_type": "secret",
                    "credential": "good-secret",
                    "api_version": "v1",
                },
            )
        cid = resp.json()["connection"]["id"]

        # Attempt to patch in a bad credential.
        with patch(
            "src.routers.nightscout.test_connection",
            new=AsyncMock(return_value=_fail_outcome("rejected")),
        ):
            resp = await http_client.patch(
                f"/api/integrations/nightscout/{cid}",
                cookies=cookies,
                json={"credential": "bad-secret"},
            )
        assert resp.status_code == 400

        # Verify the stored credential is still the original one.
        async with get_session_maker()() as db:
            row = (
                await db.execute(
                    NightscoutConnection.__table__.select().where(
                        NightscoutConnection.id == uuid.UUID(cid)
                    )
                )
            ).first()
            assert decrypt_credential(row.encrypted_credential) == "good-secret"
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_patch_credential_whitespace_is_stripped(http_client):
    """PATCH mirrors Create's whitespace normalization: a padded credential
    is stripped before test/storage, and a whitespace-only value collapses
    to the explicit "" (clear the credential) -- NOT to None ("leave
    unchanged")."""
    email = _unique_email("ns_patch_ws")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Whitespace patch",
                    "base_url": "https://ns.example.com",
                    "auth_type": "secret",
                    "credential": "old-secret",
                    "api_version": "v1",
                },
            )
        cid = resp.json()["connection"]["id"]

        # Padded credential -> stripped value is what gets re-tested.
        with patch(
            "src.routers.nightscout.test_connection",
            new=AsyncMock(return_value=_ok_outcome()),
        ) as mock_test:
            resp = await http_client.patch(
                f"/api/integrations/nightscout/{cid}",
                cookies=cookies,
                json={"credential": "  padded-secret  "},
            )
        assert resp.status_code == 200
        assert mock_test.call_args.kwargs["credential"] == "padded-secret"

        # Whitespace-only credential -> explicit clear, not "leave unchanged".
        with patch(
            "src.routers.nightscout.test_connection",
            new=AsyncMock(return_value=_ok_outcome()),
        ):
            resp = await http_client.patch(
                f"/api/integrations/nightscout/{cid}",
                cookies=cookies,
                json={"credential": "   "},
            )
        assert resp.status_code == 200
        assert resp.json()["connection"]["has_credential"] is False
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_patch_empty_body_rejected(http_client):
    email = _unique_email("ns_patch_empty")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Empty patch",
                    "base_url": "https://ns.example.com",
                    "auth_type": "secret",
                    "credential": "secret",
                    "api_version": "v1",
                },
            )
        cid = resp.json()["connection"]["id"]

        resp = await http_client.patch(
            f"/api/integrations/nightscout/{cid}",
            cookies=cookies,
            json={},
        )
        assert resp.status_code == 422
    finally:
        await _cleanup_nightscout_users([email])


# ---------------------------------------------------------------------------
# DELETE (soft-delete)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_soft_deletes(http_client):
    """DELETE marks is_active=false but row stays."""
    email = _unique_email("ns_delete")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "To delete",
                    "base_url": "https://ns.example.com",
                    "auth_type": "secret",
                    "credential": "secret",
                    "api_version": "v1",
                },
            )
        cid = resp.json()["connection"]["id"]

        resp = await http_client.delete(
            f"/api/integrations/nightscout/{cid}", cookies=cookies
        )
        assert resp.status_code == 200
        assert resp.json()["deactivated"] is True

        # Row still readable, just inactive.
        resp = await http_client.get(
            f"/api/integrations/nightscout/{cid}", cookies=cookies
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_delete_other_user_returns_404(http_client):
    email_a = _unique_email("ns_del_a")
    email_b = _unique_email("ns_del_b")
    cookies_a = await _register_and_login(http_client, email_a)
    cookies_b = await _register_and_login(http_client, email_b)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies_b,
                json={
                    "name": "B's",
                    "base_url": "https://ns-b.example.com",
                    "auth_type": "secret",
                    "credential": "secret",
                    "api_version": "v1",
                },
            )
        cid = resp.json()["connection"]["id"]

        resp = await http_client.delete(
            f"/api/integrations/nightscout/{cid}", cookies=cookies_a
        )
        assert resp.status_code == 404

        # B's connection still active.
        resp = await http_client.get(
            f"/api/integrations/nightscout/{cid}", cookies=cookies_b
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True
    finally:
        await _cleanup_nightscout_users([email_a, email_b])


# ---------------------------------------------------------------------------
# POST /{id}/test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_post_test_updates_status_on_success(http_client):
    email = _unique_email("ns_test_ok")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Test ok",
                    "base_url": "https://ns.example.com",
                    "auth_type": "secret",
                    "credential": "secret",
                    "api_version": "v1",
                },
            )
        cid = resp.json()["connection"]["id"]

        with _patch_test_connection(_ok_outcome("16.0.0")):
            resp = await http_client.post(
                f"/api/integrations/nightscout/{cid}/test", cookies=cookies
            )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        assert resp.json()["server_version"] == "16.0.0"

        # Status reflects the most recent test.
        resp = await http_client.get(
            f"/api/integrations/nightscout/{cid}", cookies=cookies
        )
        assert resp.json()["last_sync_status"] == NightscoutSyncStatus.OK.value
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_post_test_records_failure_in_status(http_client):
    email = _unique_email("ns_test_fail")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Test then fail",
                    "base_url": "https://ns.example.com",
                    "auth_type": "secret",
                    "credential": "secret",
                    "api_version": "v1",
                },
            )
        cid = resp.json()["connection"]["id"]

        # Auth failure (auth_validated=False, api_version_detected
        # populated -> reached the server but credential rejected)
        # should produce AUTH_FAILED status.
        from src.models.nightscout_connection import NightscoutApiVersion

        auth_fail = ConnectionTestOutcome(
            ok=False,
            api_version_detected=NightscoutApiVersion.V1,
            auth_validated=False,
            error="Authentication rejected",
        )
        with patch(
            "src.routers.nightscout.test_connection",
            new=AsyncMock(return_value=auth_fail),
        ):
            resp = await http_client.post(
                f"/api/integrations/nightscout/{cid}/test", cookies=cookies
            )
        assert resp.status_code == 200
        assert resp.json()["ok"] is False

        # Status should now be AUTH_FAILED
        resp = await http_client.get(
            f"/api/integrations/nightscout/{cid}", cookies=cookies
        )
        body = resp.json()
        assert body["last_sync_status"] == NightscoutSyncStatus.AUTH_FAILED.value
        assert body["last_sync_error"] == "Authentication rejected"

        # Recovery: a subsequent successful test should clear the
        # error and flip the status back to OK.
        with _patch_test_connection(_ok_outcome()):
            await http_client.post(
                f"/api/integrations/nightscout/{cid}/test", cookies=cookies
            )
        resp = await http_client.get(
            f"/api/integrations/nightscout/{cid}", cookies=cookies
        )
        body = resp.json()
        assert body["last_sync_status"] == NightscoutSyncStatus.OK.value
        assert body["last_sync_error"] is None
    finally:
        await _cleanup_nightscout_users([email])


# ---------------------------------------------------------------------------
# Behaviour changes from adversarial review
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_leaves_last_sync_status_as_never(http_client):
    """Successful connection-test should NOT mark sync as OK -- a sync
    has not yet run. Only Story 43.4's actual sync writes OK."""
    email = _unique_email("ns_status_never")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Status check",
                    "base_url": "https://my-ns.example.com",
                    "auth_type": "secret",
                    "credential": "secret",
                    "api_version": "v1",
                },
            )
        assert resp.status_code == 201
        assert resp.json()["connection"]["last_sync_status"] == (
            NightscoutSyncStatus.NEVER.value
        )
        assert resp.json()["connection"]["last_synced_at"] is None
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_patch_with_auth_type_change_retests(http_client):
    """Flipping auth_type reinterprets the credential against a
    different protocol -- must re-validate."""
    email = _unique_email("ns_auth_change")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Auth flip",
                    "base_url": "https://ns.example.com",
                    "auth_type": "secret",
                    "credential": "creds",
                    "api_version": "v1",
                },
            )
        cid = resp.json()["connection"]["id"]

        with patch(
            "src.routers.nightscout.test_connection",
            new=AsyncMock(return_value=_ok_outcome()),
        ) as mock_test:
            resp = await http_client.patch(
                f"/api/integrations/nightscout/{cid}",
                cookies=cookies,
                json={"auth_type": "token"},
            )
        assert resp.status_code == 200
        mock_test.assert_called_once()
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_patch_with_api_version_change_retests(http_client):
    """Flipping api_version reinterprets the credential against a
    different API surface -- must re-validate."""
    email = _unique_email("ns_apiver_change")
    cookies = await _register_and_login(http_client, email)
    try:
        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "API ver flip",
                    "base_url": "https://ns.example.com",
                    "auth_type": "secret",
                    "credential": "creds",
                    "api_version": "v1",
                },
            )
        cid = resp.json()["connection"]["id"]

        with patch(
            "src.routers.nightscout.test_connection",
            new=AsyncMock(return_value=_ok_outcome()),
        ) as mock_test:
            resp = await http_client.patch(
                f"/api/integrations/nightscout/{cid}",
                cookies=cookies,
                json={"api_version": "v3"},
            )
        assert resp.status_code == 200
        mock_test.assert_called_once()
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_create_rejects_url_with_query_string(http_client):
    """https://valid.com/?@evil.com style URLs must be rejected at
    schema layer before they ever reach the SSRF guard."""
    email = _unique_email("ns_url_query")
    cookies = await _register_and_login(http_client, email)
    try:
        resp = await http_client.post(
            "/api/integrations/nightscout",
            cookies=cookies,
            json={
                "name": "Query bad",
                "base_url": "https://my-ns.example.com/?evil=1",
                "auth_type": "secret",
                "credential": "x",
                "api_version": "v1",
            },
        )
        assert resp.status_code == 422
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_create_rejects_url_with_embedded_credentials(http_client):
    email = _unique_email("ns_url_embedcreds")
    cookies = await _register_and_login(http_client, email)
    try:
        resp = await http_client.post(
            "/api/integrations/nightscout",
            cookies=cookies,
            json={
                "name": "Embedded creds",
                "base_url": "https://user:pw@my-ns.example.com",
                "auth_type": "secret",
                "credential": "x",
                "api_version": "v1",
            },
        )
        assert resp.status_code == 422
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_create_rejects_url_with_fragment(http_client):
    email = _unique_email("ns_url_fragment")
    cookies = await _register_and_login(http_client, email)
    try:
        resp = await http_client.post(
            "/api/integrations/nightscout",
            cookies=cookies,
            json={
                "name": "Fragment bad",
                "base_url": "https://my-ns.example.com#hash",
                "auth_type": "secret",
                "credential": "x",
                "api_version": "v1",
            },
        )
        assert resp.status_code == 422
    finally:
        await _cleanup_nightscout_users([email])


# ---------------------------------------------------------------------------
# SSRF guard unit tests (direct, no router involvement)
# ---------------------------------------------------------------------------


class TestSsrfGuard:
    """Direct unit tests for the URL-validation function. Mock DNS so
    we don't rely on real-world DNS to test malicious-resolution paths."""

    @pytest.mark.asyncio
    async def test_rejects_aws_imds_via_dns(self):
        """A hostname that resolves to AWS IMDS must be rejected even
        if the hostname itself is a regular FQDN."""
        from src.services.integrations.nightscout import connection_test as ct
        from src.services.integrations.nightscout import ssrf as ct_ssrf

        async def fake_resolve(_hostname):
            import ipaddress as ip

            return [ip.ip_address("169.254.169.254")]

        with patch.object(ct_ssrf, "resolve_host", new=fake_resolve):
            outcome = await ct.test_connection(
                "https://attacker.example.com",
                ct.NightscoutAuthType.SECRET,
                "x",
                ct.NightscoutApiVersion.V1,
            )
        assert outcome.ok is False
        assert "metadata" in (outcome.error or "").lower()

    @pytest.mark.asyncio
    async def test_rejects_alibaba_metadata(self):
        from src.services.integrations.nightscout import connection_test as ct
        from src.services.integrations.nightscout import ssrf as ct_ssrf

        async def fake_resolve(_hostname):
            import ipaddress as ip

            return [ip.ip_address("100.100.100.200")]

        with patch.object(ct_ssrf, "resolve_host", new=fake_resolve):
            outcome = await ct.test_connection(
                "https://attacker.example.com",
                ct.NightscoutAuthType.SECRET,
                "x",
                ct.NightscoutApiVersion.V1,
            )
        assert outcome.ok is False
        assert "metadata" in (outcome.error or "").lower()

    @pytest.mark.asyncio
    async def test_rejects_oracle_metadata(self):
        from src.services.integrations.nightscout import connection_test as ct
        from src.services.integrations.nightscout import ssrf as ct_ssrf

        async def fake_resolve(_hostname):
            import ipaddress as ip

            return [ip.ip_address("192.0.0.192")]

        with patch.object(ct_ssrf, "resolve_host", new=fake_resolve):
            outcome = await ct.test_connection(
                "https://attacker.example.com",
                ct.NightscoutAuthType.SECRET,
                "x",
                ct.NightscoutApiVersion.V1,
            )
        assert outcome.ok is False
        assert "metadata" in (outcome.error or "").lower()

    @pytest.mark.asyncio
    async def test_rejects_ipv4_mapped_ipv6_metadata(self):
        """169.254.169.254 expressed as ::ffff:169.254.169.254 must
        also be blocked."""
        from src.services.integrations.nightscout import connection_test as ct
        from src.services.integrations.nightscout import ssrf as ct_ssrf

        async def fake_resolve(_hostname):
            import ipaddress as ip

            return [ip.ip_address("::ffff:169.254.169.254")]

        with patch.object(ct_ssrf, "resolve_host", new=fake_resolve):
            outcome = await ct.test_connection(
                "https://attacker.example.com",
                ct.NightscoutAuthType.SECRET,
                "x",
                ct.NightscoutApiVersion.V1,
            )
        assert outcome.ok is False
        assert "metadata" in (outcome.error or "").lower()

    @pytest.mark.asyncio
    async def test_rejects_aws_ipv6_imds(self):
        from src.services.integrations.nightscout import connection_test as ct
        from src.services.integrations.nightscout import ssrf as ct_ssrf

        async def fake_resolve(_hostname):
            import ipaddress as ip

            return [ip.ip_address("fd00:ec2::254")]

        with patch.object(ct_ssrf, "resolve_host", new=fake_resolve):
            outcome = await ct.test_connection(
                "https://attacker.example.com",
                ct.NightscoutAuthType.SECRET,
                "x",
                ct.NightscoutApiVersion.V1,
            )
        assert outcome.ok is False
        assert "metadata" in (outcome.error or "").lower()

    @pytest.mark.asyncio
    async def test_rejects_private_ip_when_homelab_disabled(self):
        from src.services.integrations.nightscout import connection_test as ct
        from src.services.integrations.nightscout import ssrf as ct_ssrf

        async def fake_resolve(_hostname):
            import ipaddress as ip

            return [ip.ip_address("10.0.0.5")]

        with (
            patch.object(ct_ssrf, "resolve_host", new=fake_resolve),
            patch.object(ct_ssrf.settings, "allow_private_ai_urls", False),
        ):
            outcome = await ct.test_connection(
                "https://internal.example.com",
                ct.NightscoutAuthType.SECRET,
                "x",
                ct.NightscoutApiVersion.V1,
            )
        assert outcome.ok is False
        assert "private" in (outcome.error or "").lower()

    @pytest.mark.asyncio
    async def test_dns_resolution_failure_yields_clean_error(self):
        from src.services.integrations.nightscout import connection_test as ct
        from src.services.integrations.nightscout import ssrf as ct_ssrf

        async def fake_resolve(_hostname):
            raise ValueError("Could not resolve host: nonexistent.example.invalid")

        with patch.object(ct_ssrf, "resolve_host", new=fake_resolve):
            outcome = await ct.test_connection(
                "https://nonexistent.example.invalid",
                ct.NightscoutAuthType.SECRET,
                "x",
                ct.NightscoutApiVersion.V1,
            )
        assert outcome.ok is False
        assert "resolve" in (outcome.error or "").lower()


# ---------------------------------------------------------------------------
# Re-adding a soft-deleted connection (#1025)
# ---------------------------------------------------------------------------


async def _add_connection(
    client,
    cookies,
    base_url: str,
    *,
    name: str = "NS",
    credential: str = "secret-12chars",
    **extra,
):
    """POST a connection with the connection test patched to succeed."""
    with _patch_test_connection(_ok_outcome()):
        return await client.post(
            "/api/integrations/nightscout",
            cookies=cookies,
            json={
                "name": name,
                "base_url": base_url,
                "auth_type": "secret",
                "credential": credential,
                "api_version": "v1",
                **extra,
            },
        )


async def _user_id(email: str) -> uuid.UUID:
    async with get_session_maker()() as db:
        return (
            await db.execute(select(User.id).where(User.email == email))
        ).scalar_one()


async def _count_pump_events(db, user_id: uuid.UUID) -> int:
    return len(
        (await db.execute(select(PumpEvent).where(PumpEvent.user_id == user_id)))
        .scalars()
        .all()
    )


@pytest.mark.parametrize(
    ("a", "b", "same"),
    [
        ("https://ns.example.com:443", "https://ns.example.com", True),
        ("http://ns.example.com:80", "http://ns.example.com", True),
        ("https://ns.example.com:8443", "https://ns.example.com", False),
        ("https://NS.Example.com", "https://ns.example.com", True),
        ("https://[::1]:443/ns", "https://[::1]/ns", True),
        ("https://[::1]:8443", "https://[::1]", False),
        ("https://ns.example.com/NS", "https://ns.example.com/ns", False),
        ("https://ns.example.com/ns/", "https://ns.example.com/ns", True),
        ("http://ns.example.com", "https://ns.example.com", True),
    ],
)
def test_canonical_nightscout_url(a: str, b: str, same: bool):
    assert (canonical_nightscout_url(a) == canonical_nightscout_url(b)) is same


def test_canonical_nightscout_url_tolerates_stored_bad_port():
    """A legacy row with an unparseable port compares as an opaque string."""
    assert canonical_nightscout_url("https://NS.example.com:99999/") == (
        "https://ns.example.com:99999"
    )


@pytest.mark.asyncio
async def test_readding_deleted_connection_reuses_id_and_avoids_doubling_pump_context(
    http_client,
):
    """Deleting and re-adding the same Nightscout URL reuses the connection ID
    so re-imported treatments deduplicate and AI pump context never doubles (#1025)."""
    email = _unique_email("ns_readd_dedupe")
    cookies = await _register_and_login(http_client, email)
    try:
        resp1 = await _add_connection(
            http_client,
            cookies,
            "https://my-ns.example.com",
            name="Primary NS",
            credential="old-secret-12chars",
        )
        assert resp1.status_code == 201
        cid_1 = resp1.json()["connection"]["id"]
        uid = await _user_id(email)

        now = datetime.now(UTC).replace(microsecond=0)
        raw_treatments = [
            {
                "_id": "6620aabbccddeeff00112233",
                "eventType": "Temp Basal",
                "created_at": (now - timedelta(hours=1)).isoformat(),
                "duration": 30,
                "percent": -50,
                "enteredBy": "loop://iPhone",
            },
            {
                "_id": "6620aabbccddeeff00112234",
                "eventType": "External Insulin",
                "insulin": 18.0,
                "insulinType": "Tresiba",
                "created_at": (now - timedelta(minutes=40)).isoformat(),
                "enteredBy": "Trio",
            },
            {
                "_id": "6620aabbccddeeff00112235",
                "eventType": "Meal Bolus",
                "created_at": (now - timedelta(minutes=25)).isoformat(),
                "insulin": 4.2,
                "carbs": 45,
                "enteredBy": "Nightscout",
            },
        ]

        async with get_session_maker()() as db:
            await translate_treatments(
                raw_treatments,
                session=db,
                user_id=str(uid),
                connection_id=cid_1,
            )
            await db.commit()
            context_before = await build_pump_section(db, uid)
            count_before = await _count_pump_events(db, uid)

        assert context_before is not None

        # Soft-delete the connection, then re-add the same site (using uppercase
        # host + default :443 port + trailing slash to verify canonical matching).
        del_resp = await http_client.delete(
            f"/api/integrations/nightscout/{cid_1}", cookies=cookies
        )
        assert del_resp.status_code == 200

        resp2 = await _add_connection(
            http_client,
            cookies,
            "https://MY-NS.example.com:443/",
            name="Re-added NS",
            credential="new-secret-12chars",
            initial_sync_window_days=30,
        )
        assert resp2.status_code == 201
        conn2 = resp2.json()["connection"]
        assert conn2["id"] == cid_1
        assert conn2["is_active"] is True
        assert conn2["name"] == "Re-added NS"
        assert conn2["initial_sync_window_days"] == 30
        assert conn2["last_sync_status"] == NightscoutSyncStatus.NEVER.value
        async with get_session_maker()() as db:
            reused = await db.get(NightscoutConnection, uuid.UUID(cid_1))
            assert reused is not None
            assert decrypt_credential(reused.encrypted_credential) == (
                "new-secret-12chars"
            )

        # Re-importing the same history + one newly arrived record inserts ONLY
        # the new record and keeps AI pump context identical on prior events.
        new_treatment = {
            "_id": "6620aabbccddeeff00112299",
            "eventType": "External Insulin",
            "insulin": 19.0,
            "insulinType": "Tresiba",
            "created_at": (now - timedelta(minutes=10)).isoformat(),
            "enteredBy": "Trio",
        }
        async with get_session_maker()() as db:
            pump_outcome, _ = await translate_treatments(
                raw_treatments,
                session=db,
                user_id=str(uid),
                connection_id=conn2["id"],
            )
            await db.commit()
            assert pump_outcome.inserted == 0
            assert await _count_pump_events(db, uid) == count_before
            assert await build_pump_section(db, uid) == context_before

            pump_outcome_delta, _ = await translate_treatments(
                [*raw_treatments, new_treatment],
                session=db,
                user_id=str(uid),
                connection_id=conn2["id"],
            )
            await db.commit()
            assert pump_outcome_delta.inserted == 1
            assert await _count_pump_events(db, uid) == count_before + 1
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_readding_resets_sync_state(http_client):
    """A reactivated row starts from scratch: every sync cursor is cleared."""
    email = _unique_email("ns_readd_reset")
    cookies = await _register_and_login(http_client, email)
    try:
        resp1 = await _add_connection(http_client, cookies, "https://reset.example.com")
        assert resp1.status_code == 201
        cid = uuid.UUID(resp1.json()["connection"]["id"])

        async with get_session_maker()() as db:
            await db.execute(
                update(NightscoutConnection)
                .where(NightscoutConnection.id == cid)
                .values(
                    last_sync_status=NightscoutSyncStatus.ERROR,
                    last_synced_at=datetime.now(UTC),
                    last_entry_object_id="6620aabbccddeeff00112233",
                    last_sync_error="HTTP 500",
                    detected_uploaders_json={"uploaders": ["Loop"]},
                    last_evaluated_at=datetime.now(UTC),
                )
            )
            await db.commit()

        del_resp = await http_client.delete(
            f"/api/integrations/nightscout/{cid}", cookies=cookies
        )
        assert del_resp.status_code == 200
        resp2 = await _add_connection(http_client, cookies, "https://reset.example.com")
        assert resp2.status_code == 201
        assert resp2.json()["connection"]["id"] == str(cid)

        async with get_session_maker()() as db:
            conn = await db.get(NightscoutConnection, cid)
            assert conn is not None
            assert conn.last_sync_status == NightscoutSyncStatus.NEVER
            assert conn.last_synced_at is None
            assert conn.last_entry_object_id is None
            assert conn.last_sync_error is None
            assert conn.detected_uploaders_json is None
            assert conn.last_evaluated_at is None
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_readding_drops_profile_snapshot_but_keeps_device_status(http_client):
    """The cached profile snapshot is dropped on re-add so the onboarding
    wizard can't pre-fill stale settings; device-status history stays."""
    email = _unique_email("ns_readd_snap")
    cookies = await _register_and_login(http_client, email)
    try:
        resp1 = await _add_connection(http_client, cookies, "https://snap.example.com")
        assert resp1.status_code == 201
        cid = uuid.UUID(resp1.json()["connection"]["id"])
        uid = await _user_id(email)

        async with get_session_maker()() as db:
            db.add(
                NightscoutProfileSnapshot(
                    user_id=uid,
                    nightscout_connection_id=cid,
                    fetched_at=datetime.now(UTC),
                    basal_segments=[{"time": "00:00", "value": 0.65}],
                )
            )
            db.add(
                DeviceStatusSnapshot(
                    user_id=uid,
                    nightscout_connection_id=cid,
                    snapshot_timestamp=datetime.now(UTC),
                    received_at=datetime.now(UTC),
                    ns_id="6620aabbccddeeff00445566",
                )
            )
            await db.commit()

        del_resp = await http_client.delete(
            f"/api/integrations/nightscout/{cid}", cookies=cookies
        )
        assert del_resp.status_code == 200
        resp2 = await _add_connection(http_client, cookies, "https://snap.example.com")
        assert resp2.status_code == 201
        assert resp2.json()["connection"]["id"] == str(cid)

        async with get_session_maker()() as db:
            profiles = (
                await db.execute(
                    select(NightscoutProfileSnapshot).where(
                        NightscoutProfileSnapshot.nightscout_connection_id == cid
                    )
                )
            ).all()
            statuses = (
                (
                    await db.execute(
                        select(DeviceStatusSnapshot.ns_id).where(
                            DeviceStatusSnapshot.nightscout_connection_id == cid
                        )
                    )
                )
                .scalars()
                .all()
            )
        assert profiles == []
        assert statuses == ["6620aabbccddeeff00445566"]
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_readding_reuses_oldest_of_several_inactive_rows(http_client):
    """When several soft-deleted rows match, the oldest one is reactivated
    and the others are left in place."""
    email = _unique_email("ns_readd_oldest")
    cookies = await _register_and_login(http_client, email)
    try:
        uid = await _user_id(email)
        ids = []
        # Separate transactions so the rows get distinct created_at values.
        for name in ("Oldest", "Newer"):
            async with get_session_maker()() as db:
                row = NightscoutConnection(
                    user_id=uid,
                    name=name,
                    base_url="https://oldest.example.com",
                    encrypted_credential="",
                    is_active=False,
                )
                db.add(row)
                await db.commit()
                ids.append(str(row.id))

        resp = await _add_connection(http_client, cookies, "https://oldest.example.com")
        assert resp.status_code == 201
        assert resp.json()["connection"]["id"] == ids[0]

        list_resp = await http_client.get(
            "/api/integrations/nightscout", cookies=cookies
        )
        assert list_resp.status_code == 200
        active = {c["id"]: c["is_active"] for c in list_resp.json()["connections"]}
        assert active == {ids[0]: True, ids[1]: False}
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_duplicate_active_connection_for_same_url_rejected(http_client):
    """A second active connection to the same site is rejected before the
    URL is probed."""
    email = _unique_email("ns_dup_active")
    cookies = await _register_and_login(http_client, email)
    try:
        resp1 = await _add_connection(
            http_client, cookies, "https://dup-ns.example.com", name="First"
        )
        assert resp1.status_code == 201

        with _patch_test_connection(_ok_outcome()) as mock_test:
            resp2 = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Second",
                    "base_url": "https://DUP-NS.example.com/",
                    "auth_type": "secret",
                    "credential": "secret-12chars",
                    "api_version": "v1",
                },
            )
        assert resp2.status_code == 400
        assert "already exists" in resp2.json()["detail"].lower()
        mock_test.assert_not_awaited()
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_patch_base_url_to_other_active_connection_rejected(http_client):
    """PATCHing a URL onto another active connection's site is rejected and
    leaves the URL unchanged."""
    email = _unique_email("ns_patch_dup_url")
    cookies = await _register_and_login(http_client, email)
    try:
        resp_a = await _add_connection(http_client, cookies, "https://a.example.com")
        resp_b = await _add_connection(http_client, cookies, "https://b.example.com")
        assert resp_a.status_code == 201
        assert resp_b.status_code == 201
        cid_b = resp_b.json()["connection"]["id"]

        with _patch_test_connection(_ok_outcome()):
            resp = await http_client.patch(
                f"/api/integrations/nightscout/{cid_b}",
                cookies=cookies,
                json={"base_url": "https://A.example.com/"},
            )
        assert resp.status_code == 400
        assert "already exists" in resp.json()["detail"].lower()

        get_resp = await http_client.get(
            f"/api/integrations/nightscout/{cid_b}", cookies=cookies
        )
        assert get_resp.status_code == 200
        assert get_resp.json()["base_url"] == "https://b.example.com"
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_patch_reactivate_while_duplicate_active_rejected(http_client):
    """Reactivating a row via PATCH is rejected while another active row
    points at the same site."""
    email = _unique_email("ns_patch_dup_active")
    cookies = await _register_and_login(http_client, email)
    try:
        resp1 = await _add_connection(http_client, cookies, "https://react.example.com")
        assert resp1.status_code == 201
        cid_old = resp1.json()["connection"]["id"]
        uid = await _user_id(email)
        del_resp = await http_client.delete(
            f"/api/integrations/nightscout/{cid_old}", cookies=cookies
        )
        assert del_resp.status_code == 200

        # A second active row for the same site, as a pre-fix database could
        # hold (POST would now reuse the deleted row instead).
        async with get_session_maker()() as db:
            db.add(
                NightscoutConnection(
                    user_id=uid,
                    name="Active twin",
                    base_url="https://react.example.com",
                    encrypted_credential="",
                    is_active=True,
                )
            )
            await db.commit()

        resp = await http_client.patch(
            f"/api/integrations/nightscout/{cid_old}",
            cookies=cookies,
            json={"is_active": True},
        )
        assert resp.status_code == 400
        assert "already exists" in resp.json()["detail"].lower()

        get_resp = await http_client.get(
            f"/api/integrations/nightscout/{cid_old}", cookies=cookies
        )
        assert get_resp.status_code == 200
        assert get_resp.json()["is_active"] is False
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_readding_does_not_reuse_another_users_connection(http_client):
    """Matching is per user: user B adding user A's deleted URL gets a new row."""
    email_a = _unique_email("ns_readd_user_a")
    email_b = _unique_email("ns_readd_user_b")
    cookies_a = await _register_and_login(http_client, email_a)
    cookies_b = await _register_and_login(http_client, email_b)
    try:
        resp_a = await _add_connection(
            http_client, cookies_a, "https://shared.example.com"
        )
        assert resp_a.status_code == 201
        cid_a = resp_a.json()["connection"]["id"]
        del_resp = await http_client.delete(
            f"/api/integrations/nightscout/{cid_a}", cookies=cookies_a
        )
        assert del_resp.status_code == 200

        resp_b = await _add_connection(
            http_client, cookies_b, "https://shared.example.com"
        )
        assert resp_b.status_code == 201
        assert resp_b.json()["connection"]["id"] != cid_a

        get_a = await http_client.get(
            f"/api/integrations/nightscout/{cid_a}", cookies=cookies_a
        )
        assert get_a.status_code == 200
        assert get_a.json()["is_active"] is False
    finally:
        await _cleanup_nightscout_users([email_a, email_b])


@pytest.mark.asyncio
async def test_readding_failed_test_keeps_deleted_connection_inactive(http_client):
    """A failed connection test during re-add must leave the soft-deleted row inactive."""
    email = _unique_email("ns_readd_fail")
    cookies = await _register_and_login(http_client, email)
    try:
        resp1 = await _add_connection(
            http_client,
            cookies,
            "https://fail-readd.example.com",
            name="Original",
            credential="good-secret",
        )
        assert resp1.status_code == 201
        cid = resp1.json()["connection"]["id"]
        del_resp = await http_client.delete(
            f"/api/integrations/nightscout/{cid}", cookies=cookies
        )
        assert del_resp.status_code == 200

        with _patch_test_connection(_fail_outcome("Authentication rejected")):
            resp2 = await http_client.post(
                "/api/integrations/nightscout",
                cookies=cookies,
                json={
                    "name": "Retry",
                    "base_url": "https://fail-readd.example.com",
                    "auth_type": "secret",
                    "credential": "bad-secret",
                    "api_version": "v1",
                },
            )
        assert resp2.status_code == 400

        get_resp = await http_client.get(
            f"/api/integrations/nightscout/{cid}", cookies=cookies
        )
        assert get_resp.status_code == 200
        assert get_resp.json()["is_active"] is False
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
async def test_readding_with_other_scheme_reuses_deleted_connection(http_client):
    """A site first added over http:// and re-added over https:// is the same
    Nightscout site, so the soft-deleted row is reused."""
    email = _unique_email("ns_readd_scheme")
    cookies = await _register_and_login(http_client, email)
    try:
        resp1 = await _add_connection(
            http_client, cookies, "http://scheme-ns.example.com"
        )
        assert resp1.status_code == 201
        cid = resp1.json()["connection"]["id"]
        del_resp = await http_client.delete(
            f"/api/integrations/nightscout/{cid}", cookies=cookies
        )
        assert del_resp.status_code == 200

        resp2 = await _add_connection(
            http_client, cookies, "https://scheme-ns.example.com"
        )
        assert resp2.status_code == 201
        conn = resp2.json()["connection"]
        assert conn["id"] == cid
        assert conn["base_url"] == "https://scheme-ns.example.com"
        assert conn["is_active"] is True
    finally:
        await _cleanup_nightscout_users([email])


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "base_url",
    ["https://ns.example.com:99999", "https://:443"],
    ids=["out-of-range-port", "no-host"],
)
async def test_create_with_malformed_url_rejected(http_client, base_url):
    """A bad port or a missing host is a validation error (422), not a 500."""
    email = _unique_email("ns_bad_url")
    cookies = await _register_and_login(http_client, email)
    try:
        resp = await http_client.post(
            "/api/integrations/nightscout",
            cookies=cookies,
            json={
                "name": "Bad URL",
                "base_url": base_url,
                "auth_type": "secret",
                "credential": "secret-12chars",
                "api_version": "v1",
            },
        )
        assert resp.status_code == 422
    finally:
        await _cleanup_nightscout_users([email])
