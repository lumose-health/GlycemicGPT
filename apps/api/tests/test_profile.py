"""Story 10.2: Tests for profile update and password change endpoints."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import settings
from src.main import app


def unique_email(prefix: str = "profile") -> str:
    """Generate a unique email for testing."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


async def register_and_login(
    client: AsyncClient, email: str, password: str = "SecurePass123"
) -> dict[str, str]:
    """Register a user and log in; return cookies dict for subsequent requests."""
    await client.post("/api/auth/register", json={"email": email, "password": password})
    login_resp = await client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    cookie = login_resp.cookies.get(settings.jwt_cookie_name)
    return {settings.jwt_cookie_name: cookie}


class TestGetProfile:
    """Tests for GET /api/auth/me with display_name field."""

    async def test_me_returns_display_name_null_by_default(self):
        """New users should have null display_name."""
        email = unique_email("me")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            response = await client.get("/api/auth/me", cookies=cookies)

        assert response.status_code == 200
        data = response.json()
        assert data["display_name"] is None
        assert data["email"] == email.lower()
        assert "created_at" in data

    async def test_me_requires_auth(self):
        """GET /api/auth/me should return 401 without session."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/auth/me")

        assert response.status_code == 401


class TestUpdateProfile:
    """Tests for PATCH /api/auth/profile endpoint."""

    async def test_update_display_name(self):
        """Should update display_name successfully."""
        email = unique_email("update")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            response = await client.patch(
                "/api/auth/profile",
                json={"display_name": "Test User"},
                cookies=cookies,
            )

        assert response.status_code == 200
        data = response.json()
        assert data["display_name"] == "Test User"

    async def test_clear_display_name(self):
        """Should allow setting display_name to null."""
        email = unique_email("clear")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            # Set a name
            await client.patch(
                "/api/auth/profile",
                json={"display_name": "Some Name"},
                cookies=cookies,
            )
            # Clear it
            response = await client.patch(
                "/api/auth/profile",
                json={"display_name": None},
                cookies=cookies,
            )

        assert response.status_code == 200
        assert response.json()["display_name"] is None

    async def test_display_name_max_length(self):
        """Should reject display_name over 100 chars."""
        email = unique_email("maxlen")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            response = await client.patch(
                "/api/auth/profile",
                json={"display_name": "A" * 101},
                cookies=cookies,
            )

        assert response.status_code == 422

    async def test_whitespace_only_display_name_becomes_null(self):
        """Whitespace-only display_name should be stored as null."""
        email = unique_email("ws")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            response = await client.patch(
                "/api/auth/profile",
                json={"display_name": "   "},
                cookies=cookies,
            )

        assert response.status_code == 200
        assert response.json()["display_name"] is None

    async def test_empty_body_returns_unchanged_profile(self):
        """Empty request body should return profile without changes."""
        email = unique_email("empty")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            response = await client.patch(
                "/api/auth/profile",
                json={},
                cookies=cookies,
            )

        assert response.status_code == 200
        assert response.json()["display_name"] is None

    async def test_update_profile_requires_auth(self):
        """PATCH /api/auth/profile should return 401 without session."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.patch(
                "/api/auth/profile",
                json={"display_name": "No Auth"},
            )

        assert response.status_code == 401

    async def test_display_name_persists_across_requests(self):
        """Display name should persist after being set."""
        email = unique_email("persist")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            await client.patch(
                "/api/auth/profile",
                json={"display_name": "Persistent Name"},
                cookies=cookies,
            )
            # Fetch again
            response = await client.get("/api/auth/me", cookies=cookies)

        assert response.status_code == 200
        assert response.json()["display_name"] == "Persistent Name"


class TestChangePassword:
    """Tests for POST /api/auth/change-password endpoint."""

    async def test_change_password_success(self):
        """Should change password when current password is correct."""
        email = unique_email("pwchange")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            response = await client.post(
                "/api/auth/change-password",
                json={
                    "current_password": "SecurePass123",
                    "new_password": "NewSecure456",
                },
                cookies=cookies,
            )

        assert response.status_code == 200
        assert "changed" in response.json()["message"].lower()

    async def test_change_password_wrong_current(self):
        """Should reject when current password is wrong."""
        email = unique_email("wrongpw")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            response = await client.post(
                "/api/auth/change-password",
                json={
                    "current_password": "WrongPassword1",
                    "new_password": "NewSecure456",
                },
                cookies=cookies,
            )

        assert response.status_code == 400
        assert "incorrect" in response.json()["detail"].lower()

    async def test_change_password_weak_new(self):
        """Should reject weak new password."""
        email = unique_email("weakpw")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            response = await client.post(
                "/api/auth/change-password",
                json={
                    "current_password": "SecurePass123",
                    "new_password": "weak",
                },
                cookies=cookies,
            )

        assert response.status_code == 422

    async def test_login_with_new_password(self):
        """After changing password, should be able to login with new password."""
        email = unique_email("newlogin")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            await client.post(
                "/api/auth/change-password",
                json={
                    "current_password": "SecurePass123",
                    "new_password": "NewSecure456",
                },
                cookies=cookies,
            )
            # Login with new password
            response = await client.post(
                "/api/auth/login",
                json={"email": email, "password": "NewSecure456"},
            )

        assert response.status_code == 200

    async def test_change_password_requires_auth(self):
        """POST /api/auth/change-password should return 401 without session."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/auth/change-password",
                json={
                    "current_password": "SecurePass123",
                    "new_password": "NewSecure456",
                },
            )

        assert response.status_code == 401


class TestProfileTimezone:
    """Tests for the per-user IANA timezone on /api/auth/me and /profile."""

    async def test_me_returns_null_timezone_by_default(self):
        email = unique_email("tz")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            response = await client.get("/api/auth/me", cookies=cookies)

        assert response.status_code == 200
        assert response.json()["timezone"] is None

    async def test_set_timezone_persists(self):
        email = unique_email("tz")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            response = await client.patch(
                "/api/auth/profile",
                json={"timezone": "Europe/London"},
                cookies=cookies,
            )
            me = await client.get("/api/auth/me", cookies=cookies)

        assert response.status_code == 200
        assert response.json()["timezone"] == "Europe/London"
        assert me.json()["timezone"] == "Europe/London"

    async def test_timezone_update_leaves_display_name_alone(self):
        email = unique_email("tz")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            await client.patch(
                "/api/auth/profile",
                json={"display_name": "Sam"},
                cookies=cookies,
            )
            response = await client.patch(
                "/api/auth/profile",
                json={"timezone": "Asia/Tokyo"},
                cookies=cookies,
            )
            # And the reverse: a display-name-only update keeps the timezone.
            response2 = await client.patch(
                "/api/auth/profile",
                json={"display_name": "Sam B"},
                cookies=cookies,
            )

        assert response.status_code == 200
        assert response2.status_code == 200
        assert response.json()["display_name"] == "Sam"
        assert response2.json()["display_name"] == "Sam B"
        assert response2.json()["timezone"] == "Asia/Tokyo"

    async def test_null_clears_timezone(self):
        email = unique_email("tz")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            await client.patch(
                "/api/auth/profile",
                json={"timezone": "Europe/Paris"},
                cookies=cookies,
            )
            response = await client.patch(
                "/api/auth/profile",
                json={"timezone": None},
                cookies=cookies,
            )

        assert response.status_code == 200
        assert response.json()["timezone"] is None

    @pytest.mark.parametrize(
        "bad",
        [
            "Not/AZone",
            "",
            "europe/london",
            " Europe/London",
            "../../etc/passwd",
            "/etc/localtime",
            "Europe/../Europe/London",
            "posix/Europe/London",
            "right/UTC",
            "localtime",
            "Factory",
            "A" * 65,
            "Europe/London\x00",
        ],
    )
    async def test_rejects_unknown_or_path_like_names(self, bad):
        email = unique_email("tz")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookies = await register_and_login(client, email)
            response = await client.patch(
                "/api/auth/profile",
                json={"timezone": bad},
                cookies=cookies,
            )
            me = await client.get("/api/auth/me", cookies=cookies)

        assert response.status_code == 422
        assert me.json()["timezone"] is None

    async def test_set_timezone_requires_auth(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.patch(
                "/api/auth/profile", json={"timezone": "Europe/London"}
            )

        assert response.status_code == 401
