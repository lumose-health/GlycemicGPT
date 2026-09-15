"""Native FreeStyle Libre ingestion via the LibreLinkUp follower cloud.

Mirrors the Dexcom coverage in ``test_glucose.py`` / ``test_integrations.py``:
trend mapping is unit-tested against the real ``pylibrelinkup`` ``Trend`` enum,
and the connect / status / disconnect / sync endpoints are driven through the
real HTTP surface with the LibreLinkUp client mocked at the service seam (no
live Abbott calls).
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from pylibrelinkup.models.data import Trend

from src.config import settings
from src.database import get_db
from src.main import app
from src.models.glucose import TrendDirection
from src.models.integration import (
    IntegrationCredential,
    IntegrationStatus,
    IntegrationType,
)
from src.routers.integrations import validate_librelinkup_credentials
from src.services.librelink_sync import (
    LibreLinkUpSyncError,
    _select_patient,
    map_libre_trend,
)


def unique_email(prefix: str = "test") -> str:
    """Generate a unique email for testing."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


class TestLibreTrendMapping:
    """Tests for pylibrelinkup ``Trend`` -> ``TrendDirection`` mapping.

    LibreLinkUp reports a coarser 5-state arrow than Dexcom's 7 states, so the
    fastest arrows collapse onto the single-arrow directions.
    """

    def test_map_trend_enum_members(self):
        assert map_libre_trend(Trend.DOWN_FAST) == TrendDirection.SINGLE_DOWN
        assert map_libre_trend(Trend.DOWN_SLOW) == TrendDirection.FORTY_FIVE_DOWN
        assert map_libre_trend(Trend.STABLE) == TrendDirection.FLAT
        assert map_libre_trend(Trend.UP_SLOW) == TrendDirection.FORTY_FIVE_UP
        assert map_libre_trend(Trend.UP_FAST) == TrendDirection.SINGLE_UP

    def test_map_trend_raw_ints(self):
        # The service may receive the bare TrendArrow integer (1-5).
        assert map_libre_trend(1) == TrendDirection.SINGLE_DOWN
        assert map_libre_trend(3) == TrendDirection.FLAT
        assert map_libre_trend(5) == TrendDirection.SINGLE_UP

    def test_map_trend_unknown_or_missing(self):
        # History points from graph() carry no trend at all.
        assert map_libre_trend(None) == TrendDirection.NOT_COMPUTABLE
        assert map_libre_trend(0) == TrendDirection.NOT_COMPUTABLE
        assert map_libre_trend(99) == TrendDirection.NOT_COMPUTABLE


class TestLibreLinkUpEndpoints:
    """Tests for the LibreLinkUp integration endpoints."""

    async def test_connect_requires_auth(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/integrations/librelinkup",
                json={"username": "libre@example.com", "password": "pw"},
            )
        assert response.status_code == 401

    async def test_sync_requires_auth(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post("/api/integrations/librelinkup/sync")
        assert response.status_code == 401

    @patch("src.routers.integrations.validate_librelinkup_credentials")
    async def test_connect_with_valid_credentials(self, mock_validate):
        mock_validate.return_value = (True, None)
        email = unique_email("libre_connect")
        password = "SecurePass123"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/auth/register", json={"email": email, "password": password}
            )
            login = await client.post(
                "/api/auth/login", json={"email": email, "password": password}
            )
            cookie = login.cookies.get(settings.jwt_cookie_name)

            response = await client.post(
                "/api/integrations/librelinkup",
                json={
                    "username": "libre@example.com",
                    "password": "libre_password",
                    "region": "EU",
                },
                cookies={settings.jwt_cookie_name: cookie},
            )

        assert response.status_code == 201
        data = response.json()
        assert data["message"] == "LibreLinkUp connected successfully"
        assert data["integration"]["integration_type"] == "librelinkup"
        assert data["integration"]["status"] == "connected"
        assert data["integration"]["region"] == "EU"

    @patch("src.routers.integrations.validate_librelinkup_credentials")
    async def test_connect_with_invalid_credentials(self, mock_validate):
        mock_validate.return_value = (False, "Could not log in to LibreLinkUp.")
        email = unique_email("libre_bad")
        password = "SecurePass123"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/auth/register", json={"email": email, "password": password}
            )
            login = await client.post(
                "/api/auth/login", json={"email": email, "password": password}
            )
            cookie = login.cookies.get(settings.jwt_cookie_name)

            response = await client.post(
                "/api/integrations/librelinkup",
                json={"username": "libre@example.com", "password": "wrong"},
                cookies={settings.jwt_cookie_name: cookie},
            )

        assert response.status_code == 400

    async def test_status_not_configured(self):
        email = unique_email("libre_status")
        password = "SecurePass123"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/auth/register", json={"email": email, "password": password}
            )
            login = await client.post(
                "/api/auth/login", json={"email": email, "password": password}
            )
            cookie = login.cookies.get(settings.jwt_cookie_name)

            response = await client.get(
                "/api/integrations/librelinkup/status",
                cookies={settings.jwt_cookie_name: cookie},
            )

        assert response.status_code == 404

    @patch("src.routers.integrations.validate_librelinkup_credentials")
    async def test_disconnect(self, mock_validate):
        mock_validate.return_value = (True, None)
        email = unique_email("libre_disc")
        password = "SecurePass123"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/auth/register", json={"email": email, "password": password}
            )
            login = await client.post(
                "/api/auth/login", json={"email": email, "password": password}
            )
            cookie = login.cookies.get(settings.jwt_cookie_name)

            await client.post(
                "/api/integrations/librelinkup",
                json={"username": "libre@example.com", "password": "libre_password"},
                cookies={settings.jwt_cookie_name: cookie},
            )

            disconnect = await client.delete(
                "/api/integrations/librelinkup",
                cookies={settings.jwt_cookie_name: cookie},
            )
            assert disconnect.status_code == 200

            status = await client.get(
                "/api/integrations/librelinkup/status",
                cookies={settings.jwt_cookie_name: cookie},
            )
            assert status.status_code == 404

    async def test_sync_not_configured(self):
        email = unique_email("libre_syncnocred")
        password = "SecurePass123"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/auth/register", json={"email": email, "password": password}
            )
            login = await client.post(
                "/api/auth/login", json={"email": email, "password": password}
            )
            cookie = login.cookies.get(settings.jwt_cookie_name)

            response = await client.post(
                "/api/integrations/librelinkup/sync",
                cookies={settings.jwt_cookie_name: cookie},
            )

        assert response.status_code == 404
        assert "not configured" in response.json()["detail"].lower()

    @patch("src.services.librelink_sync.PyLibreLinkUp")
    @patch("src.routers.integrations.validate_librelinkup_credentials")
    async def test_sync_with_mocked_data(self, mock_validate, mock_pllu_class):
        mock_validate.return_value = (True, None)

        now = datetime.now(UTC)

        # History from graph(): no trend arrow.
        hist = MagicMock()
        hist.value_in_mg_per_dl = 110.0
        hist.factory_timestamp = now - timedelta(minutes=15)

        # Current from latest(): carries a Trend enum in ``.trend``.
        current = MagicMock()
        current.value_in_mg_per_dl = 115.0
        current.factory_timestamp = now
        current.trend = Trend.UP_FAST  # -> single_up

        mock_client = MagicMock()
        mock_client.authenticate.return_value = None
        mock_client.get_patients.return_value = [MagicMock()]
        mock_client.graph.return_value = [hist]
        mock_client.latest.return_value = current
        mock_pllu_class.return_value = mock_client

        email = unique_email("libre_sync")
        password = "SecurePass123"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/auth/register", json={"email": email, "password": password}
            )
            login = await client.post(
                "/api/auth/login", json={"email": email, "password": password}
            )
            cookie = login.cookies.get(settings.jwt_cookie_name)

            await client.post(
                "/api/integrations/librelinkup",
                json={"username": "libre@example.com", "password": "libre_password"},
                cookies={settings.jwt_cookie_name: cookie},
            )

            response = await client.post(
                "/api/integrations/librelinkup/sync",
                cookies={settings.jwt_cookie_name: cookie},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Sync completed successfully"
        assert data["readings_fetched"] == 2
        assert data["readings_stored"] == 2
        assert data["last_reading"]["value"] == 115
        assert data["last_reading"]["trend"] == "single_up"
        assert data["last_reading"]["source"] == "librelinkup"


class _FakePatient:
    """Minimal stand-in for a pylibrelinkup Patient (only patient_id is read)."""

    def __init__(self, patient_id: str) -> None:
        self.patient_id = patient_id


class TestSelectPatient:
    """Finding 1: never silently ingest a different person's readings."""

    def test_single_unpinned_pins_it(self):
        p = _FakePatient("abc")
        patient, pinned = _select_patient([p], None)
        assert patient is p
        assert pinned == "abc"

    def test_multiple_unpinned_is_rejected(self):
        with pytest.raises(LibreLinkUpSyncError, match="Multiple"):
            _select_patient([_FakePatient("a"), _FakePatient("b")], None)

    def test_pinned_selects_the_matching_patient(self):
        a, b = _FakePatient("a"), _FakePatient("b")
        patient, pinned = _select_patient([a, b], "b")
        assert patient is b
        assert pinned == "b"

    def test_pinned_but_missing_is_rejected(self):
        with pytest.raises(LibreLinkUpSyncError, match="no longer shared"):
            _select_patient([_FakePatient("a")], "b")


class TestValidateMultipleConnections:
    """Finding 1: connect-time validation refuses an ambiguous account."""

    @patch("src.routers.integrations.PyLibreLinkUp")
    def test_validate_rejects_multiple_connections(self, mock_pllu):
        client = MagicMock()
        client.get_patients.return_value = [MagicMock(), MagicMock()]
        mock_pllu.return_value = client

        ok, message = validate_librelinkup_credentials("e@x.com", "pw", "US")

        assert ok is False
        assert "Multiple" in message

    @patch("src.services.librelink_sync.PyLibreLinkUp")
    @patch("src.routers.integrations.PyLibreLinkUp")
    async def test_connect_with_multiple_connections_returns_400(
        self, mock_router_pllu, _mock_service_pllu
    ):
        client = MagicMock()
        client.get_patients.return_value = [MagicMock(), MagicMock()]
        mock_router_pllu.return_value = client

        email = unique_email("libre_multi")
        password = "SecurePass123"
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as http:
            await http.post(
                "/api/auth/register", json={"email": email, "password": password}
            )
            login = await http.post(
                "/api/auth/login", json={"email": email, "password": password}
            )
            cookie = login.cookies.get(settings.jwt_cookie_name)
            response = await http.post(
                "/api/integrations/librelinkup",
                json={"username": "libre@example.com", "password": "pw"},
                cookies={settings.jwt_cookie_name: cookie},
            )

        assert response.status_code == 400
        assert "Multiple" in response.json()["detail"]


class TestLibreLinkUpAlertEligibility:
    """Finding 2: a Libre-only user must be evaluated for predictive alerts."""

    @patch(
        "src.services.scheduler.evaluate_alerts_for_user",
        new_callable=AsyncMock,
    )
    async def test_libre_only_user_is_enumerated_for_alerts(self, mock_eval):
        mock_eval.return_value = []

        email = unique_email("libre_alert")
        password = "SecurePass123"
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as http:
            await http.post(
                "/api/auth/register", json={"email": email, "password": password}
            )
            login = await http.post(
                "/api/auth/login", json={"email": email, "password": password}
            )
            cookie = login.cookies.get(settings.jwt_cookie_name)
            me = await http.get(
                "/api/auth/me", cookies={settings.jwt_cookie_name: cookie}
            )
            uid = uuid.UUID(me.json()["id"])

        # Seed a connected LibreLinkUp credential with no Dexcom/Tandem.
        async for db in get_db():
            db.add(
                IntegrationCredential(
                    user_id=uid,
                    integration_type=IntegrationType.LIBRELINKUP,
                    encrypted_username="x",
                    encrypted_password="y",
                    status=IntegrationStatus.CONNECTED,
                    cgm_role="primary",
                )
            )
            await db.commit()
            break

        from src.services.scheduler import check_alerts_all_users

        await check_alerts_all_users()

        evaluated_user_ids = {call.args[1] for call in mock_eval.call_args_list}
        assert uid in evaluated_user_ids
