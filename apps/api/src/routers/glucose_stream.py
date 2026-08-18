"""Story 4.5 & 6.3: Real-Time Glucose & Alert Streaming via SSE.

This router provides a real-time data stream for glucose readings
and predictive alerts, allowing the frontend dashboard to receive
updates as they occur.
"""

import asyncio
import uuid as uuid_mod
from datetime import UTC, datetime

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from src.core.auth import DiabeticOrAdminUser
from src.core.sse import SSEResponse, build_heartbeat_payload, format_sse_event
from src.database import get_db_session
from src.logging_config import get_logger
from src.models.alert import Alert
from src.models.glucose import GlucoseReading
from src.schemas.stream_events import (
    UNKNOWN_TREND,
    GlucoseStreamEvent,
    SseIobPayload,
)
from src.services.cgm_source import get_excluded_cgm_sources
from src.services.dexcom_sync import get_latest_glucose_reading
from src.services.iob_projection import IoBProjection, get_iob_projection, get_user_dia
from src.services.predictive_alerts import get_active_alerts

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/glucose", tags=["glucose-stream"])

NO_DATA_MESSAGE = "No glucose readings available"
FETCH_ERROR_MESSAGE = "Failed to fetch glucose data"

# Every payload below is built by a named function rather than an inline dict so
# tests can validate a real emitted body against its published schema
# (`src/schemas/stream_events.py`). A schema nothing validates against eventually
# lies. Each carries an `event` key repeating the SSE `event:` name -- the
# discriminator generated clients use to pick a union member.


def build_iob_payload(projection: IoBProjection) -> SseIobPayload:
    """Build the `iob` sub-object of a `glucose` SSE event."""
    return SseIobPayload(
        current=projection.projected_iob,
        is_stale=projection.is_stale,
    )


def build_glucose_payload(
    reading: GlucoseReading,
    *,
    minutes_ago: int,
    is_stale: bool,
    iob: SseIobPayload | None,
    now: datetime,
) -> dict:
    """Build the JSON body of a `glucose` SSE event.

    Its contract is `SseGlucosePayload`.
    """
    return {
        "event": "glucose",
        # Canonical mg/dL. Clients render using the user's
        # glucose_unit preference.
        "value": reading.value,
        "trend": reading.trend.value if reading.trend else UNKNOWN_TREND,
        "trend_rate": reading.trend_rate,
        "reading_timestamp": reading.reading_timestamp.isoformat(),
        "minutes_ago": minutes_ago,
        "is_stale": is_stale,
        "iob": iob.model_dump() if iob is not None else None,
        "timestamp": now.isoformat(),
    }


def build_glucose_alert_payload(alert: Alert) -> dict:
    """Build the JSON body of an `alert` SSE event on the *glucose* stream.

    Deliberately distinct from the alert stream's `alert` body: this one carries the
    raw alert row (including `source`, `prediction_minutes` and `expires_at`), which
    the dashboard needs to render the prediction. Its contract is
    `SseGlucoseAlertPayload`.
    """
    return {
        "event": "alert",
        "id": str(alert.id),
        "alert_type": alert.alert_type.value,
        "severity": alert.severity.value,
        "current_value": alert.current_value,
        "predicted_value": alert.predicted_value,
        "prediction_minutes": alert.prediction_minutes,
        "iob_value": alert.iob_value,
        "message": alert.message,
        "trend_rate": alert.trend_rate,
        "source": alert.source,
        "created_at": alert.created_at.isoformat(),
        "expires_at": alert.expires_at.isoformat(),
    }


def build_no_data_payload() -> dict:
    """Build the JSON body of a `no_data` SSE event. Contract: `SseNoDataPayload`."""
    return {
        "event": "no_data",
        "message": NO_DATA_MESSAGE,
        "timestamp": datetime.now(UTC).isoformat(),
    }


def build_error_payload() -> dict:
    """Build the JSON body of an `error` SSE event. Contract: `SseErrorPayload`.

    Advisory: the stream stays open and retries on the next interval. The message is
    deliberately fixed -- the underlying exception is logged, not streamed.
    """
    return {
        "event": "error",
        "message": FETCH_ERROR_MESSAGE,
        "timestamp": datetime.now(UTC).isoformat(),
    }


async def generate_glucose_stream(
    user_id: str,
    request: Request,
) -> None:
    """Async generator that yields SSE events with glucose data.

    Sends glucose updates every 60 seconds and heartbeats every 30 seconds.
    Handles client disconnection gracefully.

    Note: Creates a fresh database session for each query to avoid
    connection pool exhaustion and stale session issues.

    Args:
        user_id: The authenticated user's ID
        request: The HTTP request (for disconnect detection)

    Yields:
        SSE-formatted event strings
    """
    heartbeat_interval = 30  # seconds
    glucose_interval = 60  # seconds
    last_glucose_check = 0
    event_counter = 0
    delivered_alert_ids: set[str] = set()  # Track alerts sent this connection

    logger.info("SSE stream started", user_id=user_id)

    try:
        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                logger.info("SSE client disconnected", user_id=user_id)
                break

            current_time = asyncio.get_event_loop().time()
            event_counter += 1

            # Send glucose data every 60 seconds (or immediately on first request)
            if (
                current_time - last_glucose_check >= glucose_interval
                or last_glucose_check == 0
            ):
                last_glucose_check = current_time

                try:
                    # Create fresh database session for each query (Issue 4 fix)
                    async with get_db_session() as db:
                        # Get latest glucose reading from the primary CGM
                        # source only (Story 43.10) so the live tile doesn't
                        # flip between two sources reporting the same sensor.
                        excluded = await get_excluded_cgm_sources(db, user_id)
                        latest = await get_latest_glucose_reading(
                            db, user_id, excluded_sources=excluded
                        )

                        if latest:
                            now = datetime.now(UTC)
                            reading_time = latest.reading_timestamp
                            if reading_time.tzinfo is None:
                                reading_time = reading_time.replace(tzinfo=UTC)

                            minutes_ago = int((now - reading_time).total_seconds() / 60)
                            is_stale = minutes_ago > 10

                            # Get IoB projection if available
                            iob_data = None
                            try:
                                dia = await get_user_dia(db, user_id)
                                projection = await get_iob_projection(
                                    db, user_id, dia_hours=dia
                                )
                                if projection:
                                    iob_data = build_iob_payload(projection)
                            except Exception as e:
                                logger.warning(
                                    "Failed to get IoB projection", error=str(e)
                                )

                            glucose_event = build_glucose_payload(
                                latest,
                                minutes_ago=minutes_ago,
                                is_stale=is_stale,
                                iob=iob_data,
                                now=now,
                            )

                            yield format_sse_event(
                                event_type="glucose",
                                data=glucose_event,
                                event_id=str(event_counter),
                            )
                        else:
                            # No readings available
                            yield format_sse_event(
                                event_type="no_data",
                                data=build_no_data_payload(),
                                event_id=str(event_counter),
                            )

                except Exception as e:
                    logger.error("Error fetching glucose data for SSE", error=str(e))
                    yield format_sse_event(
                        event_type="error",
                        data=build_error_payload(),
                        event_id=str(event_counter),
                    )

                # Story 6.3: Check for new active alerts to deliver
                try:
                    async with get_db_session() as alert_db:
                        user_uuid = uuid_mod.UUID(user_id)
                        active_alerts = await get_active_alerts(
                            alert_db, user_uuid, limit=10
                        )
                        for alert in active_alerts:
                            alert_id_str = str(alert.id)
                            if alert_id_str not in delivered_alert_ids:
                                delivered_alert_ids.add(alert_id_str)
                                event_counter += 1
                                yield format_sse_event(
                                    event_type="alert",
                                    data=build_glucose_alert_payload(alert),
                                    event_id=str(event_counter),
                                )
                except Exception as e:
                    logger.warning(
                        "Error checking alerts for SSE",
                        user_id=user_id,
                        error=str(e),
                    )

            # Wait for heartbeat interval then send heartbeat
            await asyncio.sleep(heartbeat_interval)

            # Check for disconnect again after sleep
            if await request.is_disconnected():
                logger.info("SSE client disconnected during sleep", user_id=user_id)
                break

            event_counter += 1
            yield format_sse_event(
                event_type="heartbeat",
                data=build_heartbeat_payload(),
                event_id=str(event_counter),
            )

    except asyncio.CancelledError:
        logger.info("SSE stream cancelled", user_id=user_id)
    except Exception as e:
        logger.error("SSE stream error", user_id=user_id, error=str(e))
        raise
    finally:
        logger.info("SSE stream ended", user_id=user_id)


@router.get(
    "/stream",
    # Documentation-only marker: the handler returns its own StreamingResponse and
    # the transport is unchanged. See src/core/sse.py.
    response_class=SSEResponse,
    responses={
        200: {
            "model": GlucoseStreamEvent,
            "description": (
                "SSE stream of glucose updates. Each event's JSON body is one "
                "member of GlucoseStreamEvent, selected by the `event` "
                "discriminator, which repeats the SSE `event:` name."
            ),
        },
        401: {"description": "Not authenticated"},
        403: {"description": "Permission denied"},
    },
)
async def stream_glucose(
    request: Request,
    current_user: DiabeticOrAdminUser,
) -> StreamingResponse:
    """Stream glucose updates via Server-Sent Events.

    Provides real-time glucose data and alerts for the dashboard. Events include:
    - `glucose`: Current glucose reading with trend and IoB data
    - `alert`: New predictive or threshold-based alert (Story 6.3)
    - `heartbeat`: Keep-alive signal every 30 seconds
    - `no_data`: Sent when no glucose readings are available
    - `error`: Sent when there's an error fetching data

    The stream sends glucose updates every 60 seconds to match
    the CGM update frequency (Dexcom G6/G7 updates every 5 minutes,
    but we check more frequently for freshness).

    Returns:
        StreamingResponse with SSE content type
    """
    logger.info(
        "SSE stream requested",
        user_id=str(current_user.id),
        email=current_user.email,
    )

    # Issue 1 fix: Remove CORS header - let CORS middleware handle it
    return StreamingResponse(
        generate_glucose_stream(str(current_user.id), request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
