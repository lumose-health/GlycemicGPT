"""Story 6.3: Tests for alert event emission via SSE stream."""

import asyncio
import json
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import ASGITransport, AsyncClient

from src.config import settings
from src.main import app
from src.routers.glucose_stream import format_sse_event, generate_glucose_stream


class TestFormatSseAlertEvent:
    """Tests for SSE alert event formatting."""

    async def test_format_alert_event(self):
        """Test formatting an alert as an SSE event."""
        alert_data = {
            "id": "abc-123",
            "alert_type": "low_urgent",
            "severity": "emergency",
            "current_value": 50.0,
            "predicted_value": None,
            "prediction_minutes": None,
            "iob_value": 2.5,
            "message": "Urgent low glucose: 50 mg/dL",
            "trend_rate": -3.0,
            "source": "threshold",
            "created_at": "2025-01-01T00:00:00+00:00",
            "expires_at": "2025-01-01T00:30:00+00:00",
        }

        result = format_sse_event(
            event_type="alert",
            data=alert_data,
            event_id="42",
        )

        assert "event: alert" in result
        assert "id: 42" in result
        assert "data:" in result

        # Extract and parse the data line
        data_line = [line for line in result.split("\n") if line.startswith("data:")][0]
        parsed = json.loads(data_line[5:].strip())
        assert parsed["alert_type"] == "low_urgent"
        assert parsed["severity"] == "emergency"
        assert parsed["current_value"] == 50.0
        assert parsed["message"] == "Urgent low glucose: 50 mg/dL"


class TestAlertDeduplication:
    """Tests for alert deduplication in SSE stream."""

    @patch("src.routers.glucose_stream.get_active_alerts")
    @patch("src.routers.glucose_stream.get_latest_glucose_reading")
    @patch(
        "src.routers.glucose_stream.get_user_dia",
        new_callable=AsyncMock,
        return_value=4.0,
    )
    @patch("src.routers.glucose_stream.get_iob_projection")
    @patch("src.routers.glucose_stream.get_db_session")
    async def test_alert_not_sent_twice(
        self, mock_db_session, mock_iob, mock_dia, mock_glucose, mock_alerts
    ):
        """Test that the same alert is not sent twice per connection."""
        from enum import Enum

        class MockAlertType(Enum):
            low_urgent = "low_urgent"

        class MockSeverity(Enum):
            emergency = "emergency"

        mock_alert = MagicMock()
        mock_alert.id = uuid.uuid4()
        mock_alert.alert_type = MockAlertType.low_urgent
        mock_alert.severity = MockSeverity.emergency
        mock_alert.current_value = 50.0
        mock_alert.predicted_value = None
        mock_alert.prediction_minutes = None
        mock_alert.iob_value = 2.5
        mock_alert.message = "Urgent low glucose: 50 mg/dL"
        mock_alert.trend_rate = -3.0
        mock_alert.source = "threshold"
        mock_alert.created_at = datetime.now(UTC)
        mock_alert.expires_at = datetime.now(UTC) + timedelta(minutes=30)

        # Return the same alert on every call
        mock_alerts.return_value = [mock_alert]

        # No glucose reading
        mock_glucose.return_value = None
        mock_iob.return_value = None

        # Mock db session context manager
        mock_session = AsyncMock()
        mock_db_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_db_session.return_value.__aexit__ = AsyncMock(return_value=False)

        # Mock request that disconnects after 2 iterations
        mock_request = MagicMock()
        call_count = 0

        async def mock_is_disconnected():
            nonlocal call_count
            call_count += 1
            # Disconnect after enough iterations to check dedup
            return call_count > 3

        mock_request.is_disconnected = mock_is_disconnected

        # Collect all events
        events = []
        with patch("asyncio.sleep", AsyncMock()):
            async for event in generate_glucose_stream(
                "00000000-0000-0000-0000-000000000001", mock_request
            ):
                events.append(event)

        # Count alert events
        alert_events = [e for e in events if "event: alert" in e]

        # Should only have 1 alert event despite multiple iterations
        assert len(alert_events) == 1, (
            f"Expected 1 alert event but got {len(alert_events)}. "
            "Alert deduplication may not be working."
        )

    @patch("src.routers.glucose_stream.get_active_alerts")
    @patch("src.routers.glucose_stream.get_latest_glucose_reading")
    @patch(
        "src.routers.glucose_stream.get_user_dia",
        new_callable=AsyncMock,
        return_value=4.0,
    )
    @patch("src.routers.glucose_stream.get_iob_projection")
    @patch("src.routers.glucose_stream.get_db_session")
    async def test_no_alert_events_when_no_alerts(
        self, mock_db_session, mock_iob, mock_dia, mock_glucose, mock_alerts
    ):
        """Test that no alert events are emitted when there are no active alerts."""
        mock_alerts.return_value = []
        mock_glucose.return_value = None
        mock_iob.return_value = None

        mock_session = AsyncMock()
        mock_db_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_db_session.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_request = MagicMock()
        call_count = 0

        async def mock_is_disconnected():
            nonlocal call_count
            call_count += 1
            return call_count > 2

        mock_request.is_disconnected = mock_is_disconnected

        events = []
        with patch("asyncio.sleep", AsyncMock()):
            async for event in generate_glucose_stream(
                "00000000-0000-0000-0000-000000000001", mock_request
            ):
                events.append(event)

        alert_events = [e for e in events if "event: alert" in e]
        assert len(alert_events) == 0


class TestAlertEventPayload:
    """Tests for alert event payload structure."""

    async def test_alert_event_has_required_fields(self):
        """Test that alert SSE event data contains all required fields."""
        required_fields = [
            "id",
            "alert_type",
            "severity",
            "current_value",
            "predicted_value",
            "prediction_minutes",
            "iob_value",
            "message",
            "trend_rate",
            "source",
            "created_at",
            "expires_at",
        ]

        alert_data = {
            "id": "test-id",
            "alert_type": "high_warning",
            "severity": "warning",
            "current_value": 200.0,
            "predicted_value": 220.0,
            "prediction_minutes": 30,
            "iob_value": None,
            "message": "High glucose warning",
            "trend_rate": 2.0,
            "source": "predictive",
            "created_at": "2025-01-01T00:00:00+00:00",
            "expires_at": "2025-01-01T00:30:00+00:00",
        }

        result = format_sse_event("alert", alert_data, event_id="1")

        data_line = [line for line in result.split("\n") if line.startswith("data:")][0]
        parsed = json.loads(data_line[5:].strip())

        for field in required_fields:
            assert field in parsed, f"Missing required field: {field}"

    @patch("src.routers.glucose_stream.get_active_alerts")
    @patch("src.routers.glucose_stream.get_latest_glucose_reading")
    @patch(
        "src.routers.glucose_stream.get_user_dia",
        new_callable=AsyncMock,
        return_value=4.0,
    )
    @patch("src.routers.glucose_stream.get_iob_projection")
    @patch("src.routers.glucose_stream.get_db_session")
    async def test_alert_payload_numerics_are_canonical_mgdl_without_unit_tag(
        self, mock_db_session, mock_iob, mock_dia, mock_glucose, mock_alerts
    ):
        """The emitted SSE alert payload keeps current/predicted as canonical
        mg/dL floats and carries NO unit tag. The web client converts off the
        viewer's own glucose-unit preference, never off the payload, so nothing
        double-interprets; mobile keeps mg/dL until a later unit story adds an
        explicit tag plus numeric conversion verified with a mobile consumer.
        """
        from enum import Enum

        class MockAlertType(Enum):
            low_urgent = "low_urgent"

        class MockSeverity(Enum):
            emergency = "emergency"

        mock_alert = MagicMock()
        mock_alert.id = uuid.uuid4()
        mock_alert.alert_type = MockAlertType.low_urgent
        mock_alert.severity = MockSeverity.emergency
        mock_alert.current_value = 70.0
        mock_alert.predicted_value = 65.0
        mock_alert.prediction_minutes = 15
        mock_alert.iob_value = None
        # The message is rendered in the patient's unit at persist (may be mmol);
        # the numeric fields below stay canonical mg/dL.
        mock_alert.message = "Urgent low glucose: 3.9 mmol/L"
        mock_alert.trend_rate = -2.0
        mock_alert.source = "predictive"
        mock_alert.created_at = datetime.now(UTC)
        mock_alert.expires_at = datetime.now(UTC) + timedelta(minutes=30)
        mock_alerts.return_value = [mock_alert]
        mock_glucose.return_value = None
        mock_iob.return_value = None

        mock_session = AsyncMock()
        mock_db_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_db_session.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_request = MagicMock()
        call_count = 0

        async def mock_is_disconnected():
            nonlocal call_count
            call_count += 1
            return call_count > 2

        mock_request.is_disconnected = mock_is_disconnected

        events = []
        with patch("asyncio.sleep", AsyncMock()):
            async for event in generate_glucose_stream(
                "00000000-0000-0000-0000-000000000001", mock_request
            ):
                events.append(event)

        alert_events = [e for e in events if "event: alert" in e]
        assert len(alert_events) == 1
        data_line = [
            line for line in alert_events[0].split("\n") if line.startswith("data:")
        ][0]
        parsed = json.loads(data_line[5:].strip())
        # Numerics are canonical mg/dL, untouched by any unit preference.
        assert parsed["current_value"] == 70.0
        assert parsed["predicted_value"] == 65.0
        # No unit tag on the payload (recorded decision for this cut).
        assert "glucose_unit" not in parsed
        assert "unit" not in parsed


async def _capture_response_start(
    path: str,
    *,
    cookie: str,
    timeout: float = 3.0,
) -> dict | None:
    """Return the `http.response.start` message an endless SSE endpoint sends.

    Driving the ASGI app directly, rather than through `AsyncClient.stream`, is
    deliberate: httpx's `ASGITransport` runs the app to completion and buffers the
    body before handing back a response, so against a stream that never ends it
    never yields headers at all. A test built on it can only ever pass by timing
    out, asserting nothing -- which is what this one used to do.

    Here the response headers are captured the moment the app emits them, and the
    still-running stream is then cancelled by the timeout. Returns None if no
    headers arrived, so the caller can fail loudly instead of vacuously.
    """
    start_message: dict | None = None

    async def receive():
        # The client sends nothing; block so `request.is_disconnected()` (which
        # polls receive under an already-cancelled scope) sees no disconnect.
        await asyncio.Event().wait()

    async def send(message):
        nonlocal start_message
        if message["type"] == "http.response.start":
            start_message = message

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "root_path": "",
        "headers": [
            (b"host", b"test"),
            (b"cookie", cookie.encode("latin-1")),
        ],
        "client": ("127.0.0.1", 12345),
        "server": ("test", 80),
    }

    try:
        await asyncio.wait_for(app(scope, receive, send), timeout=timeout)
    except TimeoutError:
        pass

    return start_message


class TestAlertStreamEndpoint:
    """HTTP-level tests for the `/api/v1/alerts/stream` endpoint.

    Mirrors `TestGlucoseStreamEndpoint::test_stream_returns_correct_headers` in
    tests/test_glucose_stream.py. The route declares `response_class=SSEResponse`
    for OpenAPI purposes only, so it needs an end-to-end check that the marker did
    not change what the endpoint actually serves.
    """

    async def test_unauthenticated_returns_401(self):
        """Unauthenticated requests are rejected before any stream starts."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get("/api/v1/alerts/stream")

        assert response.status_code == 401

    async def test_stream_returns_correct_headers(self):
        """The endpoint serves text/event-stream with the no-buffering headers."""
        email = f"alert_stream_headers_{uuid.uuid4().hex[:8]}@example.com"
        password = "SecurePass123"

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            timeout=5.0,
        ) as client:
            await client.post(
                "/api/auth/register",
                json={"email": email, "password": password},
            )
            login_response = await client.post(
                "/api/auth/login",
                json={"email": email, "password": password},
            )
            assert login_response.status_code == 200
            session_cookie = login_response.cookies.get(settings.jwt_cookie_name)
            assert session_cookie is not None

        start = await _capture_response_start(
            "/api/v1/alerts/stream",
            cookie=f"{settings.jwt_cookie_name}={session_cookie}",
        )

        assert start is not None, (
            "the stream never sent http.response.start within the timeout"
        )
        assert start["status"] == 200
        headers = {
            name.decode("latin-1").lower(): value.decode("latin-1")
            for name, value in start["headers"]
        }
        assert "text/event-stream" in headers["content-type"]
        assert headers["cache-control"] == "no-cache, no-store, must-revalidate"
        assert headers["connection"] == "keep-alive"
        assert headers["x-accel-buffering"] == "no"
