"""Endpoint tests for GET /api/settings/pump-profile (#1040).

A pump-profile value that isn't known must come back as null, never 0,
while a real 0 U/h basal written by a current profile writer stays 0.
"""

import uuid
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import settings
from src.database import get_session_maker
from src.main import app
from src.models.pump_profile import SEGMENT_UNKNOWN_AS_NULL_KEY, PumpProfile


async def _register_and_login(client: AsyncClient) -> tuple[str, uuid.UUID]:
    email = f"pump_profile_ep_{uuid.uuid4().hex[:10]}@example.com"
    password = "SecurePass123"
    reg = await client.post(
        "/api/auth/register", json={"email": email, "password": password}
    )
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    assert login.status_code == 200, login.text
    cookie = login.cookies.get(settings.jwt_cookie_name)
    me = await client.get("/api/auth/me", cookies={settings.jwt_cookie_name: cookie})
    return cookie, uuid.UUID(me.json()["id"])


async def _seed_profile(user_id: uuid.UUID, segments: list[dict]) -> None:
    async with get_session_maker()() as db:
        db.add(
            PumpProfile(
                user_id=user_id,
                profile_name="Default",
                is_active=True,
                segments=segments,
                synced_at=datetime.now(UTC),
            )
        )
        await db.commit()


@pytest.mark.asyncio
async def test_unknown_values_are_null_and_real_zero_basal_is_kept():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        cookie, user_id = await _register_and_login(client)
        await _seed_profile(
            user_id,
            [
                # Current writer: null is unknown, 0 basal is real.
                {
                    "time": "12:00 AM",
                    "start_minutes": 0,
                    "basal_rate": 0.0,
                    "correction_factor": None,
                    "carb_ratio": 10.0,
                    "target_bg": None,
                    SEGMENT_UNKNOWN_AS_NULL_KEY: True,
                },
                # Legacy row: every 0 meant "not known".
                {
                    "time": "6:00 AM",
                    "start_minutes": 360,
                    "basal_rate": 0.0,
                    "correction_factor": 0.0,
                    "carb_ratio": 0.0,
                    "target_bg": 105,
                },
                # A fractional target is rounded, not dropped with its segment.
                {
                    "time": "9:00 PM",
                    "start_minutes": 1260,
                    "basal_rate": 0.7,
                    "correction_factor": 45.0,
                    "carb_ratio": 12.0,
                    "target_bg": 110.6,
                    SEGMENT_UNKNOWN_AS_NULL_KEY: True,
                },
            ],
        )

        resp = await client.get(
            "/api/settings/pump-profile",
            cookies={settings.jwt_cookie_name: cookie},
        )

    assert resp.status_code == 200, resp.text
    segments = resp.json()["segments"]
    assert segments[0]["basal_rate"] == 0.0
    assert segments[0]["correction_factor"] is None
    assert segments[0]["carb_ratio"] == 10.0
    assert segments[0]["target_bg"] is None
    assert SEGMENT_UNKNOWN_AS_NULL_KEY not in segments[0]
    assert segments[1]["basal_rate"] is None
    assert segments[1]["correction_factor"] is None
    assert segments[1]["carb_ratio"] is None
    assert segments[1]["target_bg"] == 105
    assert segments[2]["target_bg"] == 111
    assert segments[2]["basal_rate"] == 0.7
