"""Story 16.11: Real-time alert streaming via SSE for mobile apps.

Delivers alerts to diabetic users and caregivers with can_receive_alerts=True.
Follows the pattern established in glucose_stream.py.
"""

import asyncio
import json
import uuid as uuid_mod
from datetime import UTC, datetime

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from src.core.auth import CurrentUser
from src.core.sse import SSEResponse
from src.database import get_db_session
from src.logging_config import get_logger
from src.models.alert import Alert
from src.models.caregiver_link import CaregiverLink
from src.models.user import UserRole
from src.routers.alert_api import alert_to_dict
from src.schemas.stream_events import AlertStreamEvent

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/alerts", tags=["alert-stream"])


def format_sse_event(event_type: str, data: dict, event_id: str | None = None) -> str:
    """Format data as an SSE event."""
    lines = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event_type}")
    lines.append(f"data: {json.dumps(data)}")
    lines.append("")
    return "\n".join(lines) + "\n"


async def _get_patient_ids_for_caregiver(
    user_id: uuid_mod.UUID,
) -> list[tuple[uuid_mod.UUID, str]]:
    """Get patient IDs and emails for a caregiver with can_receive_alerts=True."""
    from sqlalchemy import and_, select

    from src.models.user import User

    async with get_db_session() as db:
        result = await db.execute(
            select(CaregiverLink.patient_id, User.email)
            .join(User, User.id == CaregiverLink.patient_id)
            .where(
                and_(
                    CaregiverLink.caregiver_id == user_id,
                    CaregiverLink.can_receive_alerts.is_(True),
                )
            )
        )
        return [(row[0], row[1]) for row in result.all()]


async def _get_alerts_for_user(
    user_id: uuid_mod.UUID,
    since_id: str | None = None,
    patient_name: str | None = None,
) -> list[dict]:
    """Get unacknowledged alerts for a user."""
    from sqlalchemy import and_, select

    now = datetime.now(UTC)

    async with get_db_session() as db:
        query = (
            select(Alert)
            .where(
                and_(
                    Alert.user_id == user_id,
                    Alert.acknowledged.is_(False),
                    Alert.expires_at > now,
                )
            )
            .order_by(Alert.created_at.desc())
            .limit(50)
        )

        result = await db.execute(query)
        alerts = result.scalars().all()

        return [alert_to_dict(a, patient_name=patient_name) for a in alerts]


async def generate_alert_stream(
    user_id: str,
    user_role: UserRole,
    request: Request,
) -> None:
    """Async generator that yields SSE events with alert data.

    For diabetic users: streams their own alerts.
    For caregiver users: streams alerts from patients with can_receive_alerts=True.
    """
    heartbeat_interval = 30
    alert_poll_interval = 15
    event_counter = 0
    delivered_alert_ids: set[str] = set()
    max_delivered_ids = 500

    user_uuid = uuid_mod.UUID(user_id)

    logger.info("Alert SSE stream started", user_id=user_id, role=user_role.value)

    try:
        while True:
            if await request.is_disconnected():
                logger.info("Alert SSE client disconnected", user_id=user_id)
                break

            event_counter += 1

            try:
                all_alerts: list[dict] = []

                if user_role == UserRole.CAREGIVER:
                    patients = await _get_patient_ids_for_caregiver(user_uuid)
                    for patient_id, patient_email in patients:
                        patient_alerts = await _get_alerts_for_user(
                            patient_id,
                            patient_name=patient_email,
                        )
                        all_alerts.extend(patient_alerts)
                else:
                    all_alerts = await _get_alerts_for_user(user_uuid)

                for alert in all_alerts:
                    alert_id = alert["id"]
                    if alert_id not in delivered_alert_ids:
                        delivered_alert_ids.add(alert_id)
                        # Prevent unbounded growth: trim oldest entries
                        if len(delivered_alert_ids) > max_delivered_ids:
                            to_remove = len(delivered_alert_ids) - max_delivered_ids
                            for _ in range(to_remove):
                                delivered_alert_ids.pop()
                        event_counter += 1
                        yield format_sse_event(
                            event_type="alert",
                            data=alert,
                            event_id=str(event_counter),
                        )

            except Exception as e:
                logger.error(
                    "Error fetching alerts for SSE",
                    user_id=user_id,
                    error=str(e),
                )

            await asyncio.sleep(alert_poll_interval)

            if await request.is_disconnected():
                break

            event_counter += 1
            yield format_sse_event(
                event_type="heartbeat",
                data={"timestamp": datetime.now(UTC).isoformat()},
                event_id=str(event_counter),
            )

            await asyncio.sleep(heartbeat_interval - alert_poll_interval)

    except asyncio.CancelledError:
        logger.info("Alert SSE stream cancelled", user_id=user_id)
    except Exception as e:
        logger.error("Alert SSE stream error", user_id=user_id, error=str(e))
        raise
    finally:
        logger.info("Alert SSE stream ended", user_id=user_id)


@router.get(
    "/stream",
    # Documentation-only: the handler returns its own StreamingResponse. See
    # src/core/sse.py.
    response_class=SSEResponse,
    responses={
        200: {
            "model": AlertStreamEvent,
            "description": (
                "SSE stream of alert updates. Each event's JSON body is one member "
                "of AlertStreamEvent, selected by the SSE `event:` name."
            ),
        },
        401: {"description": "Not authenticated"},
    },
)
async def stream_alerts(
    request: Request,
    current_user: CurrentUser,
) -> StreamingResponse:
    """Stream alerts via Server-Sent Events.

    For diabetic users: streams their own alerts.
    For caregiver users: streams alerts from patients with can_receive_alerts=True.
    """
    logger.info(
        "Alert SSE stream requested",
        user_id=str(current_user.id),
        role=current_user.role.value,
    )

    return StreamingResponse(
        generate_alert_stream(
            str(current_user.id),
            current_user.role,
            request,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
