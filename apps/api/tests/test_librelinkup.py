"""Native FreeStyle Libre ingestion via the LibreLinkUp follower cloud.

Mirrors the Dexcom coverage in ``test_glucose.py`` / ``test_integrations.py``:
trend mapping is unit-tested against the real ``pylibrelinkup`` ``Trend`` enum,
and the connect / status / disconnect / sync endpoints are driven through the
real HTTP surface with the LibreLinkUp client mocked at the service seam (no
live Abbott calls).
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

from httpx import ASGITransport, AsyncClient
from pylibrelinkup.models.data import Trend

from src.config import settings
from src.main import app
from src.models.glucose import TrendDirection
from src.services.librelink_sync import map_libre_trend


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
