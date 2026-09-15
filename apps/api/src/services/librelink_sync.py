"""Native FreeStyle Libre CGM Data Sync Service.

Fetches glucose readings from the LibreLinkUp follower cloud (Abbott's
unofficial share API) via the MIT-licensed ``pylibrelinkup`` client and stores
them. This is the Libre equivalent of ``dexcom_sync`` for Dexcom Share -- it
replaces the Nightscout relay hop for Libre users.

pylibrelinkup surfaces two shapes: ``graph()`` returns ~12h of history
(``GlucoseMeasurement``, no trend arrow) and ``latest()`` returns the current
reading (``GlucoseMeasurementWithTrend``, with a ``Trend`` arrow). We store the
current reading first so its mapped trend wins the ``(user_id,
reading_timestamp)`` dedupe if it collides with the last history point.
"""

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

from pylibrelinkup import APIUrl, PyLibreLinkUp
from pylibrelinkup import exceptions as llu_errors
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.core.encryption import decrypt_credential
from src.logging_config import get_logger
from src.models.glucose import LIBRE_TREND_MAP, GlucoseReading, TrendDirection
from src.models.integration import (
    IntegrationCredential,
    IntegrationStatus,
    IntegrationType,
)

logger = get_logger(__name__)

# pylibrelinkup makes synchronous ``requests`` calls with no HTTP timeout, so a
# stalled Abbott endpoint would block the async worker (and every request/job
# sharing it). We run each call in a worker thread and bound the whole operation
# with ``asyncio.wait_for``. Note: a hung thread cannot be force-cancelled, so on
# timeout the underlying socket keeps its thread until it errors out -- but the
# event loop is freed immediately and the sync gives up, which is the point.
LIBRELINKUP_HTTP_TIMEOUT_SECONDS = 20


async def _run_blocking(func: Any, *args: Any) -> Any:
    """Run a synchronous pylibrelinkup call off the event loop, time-bounded."""
    return await asyncio.wait_for(
        asyncio.to_thread(func, *args),
        timeout=LIBRELINKUP_HTTP_TIMEOUT_SECONDS,
    )


class LibreLinkUpSyncError(Exception):
    """Base exception for LibreLinkUp sync errors."""

    pass


class LibreLinkUpAuthError(LibreLinkUpSyncError):
    """Authentication failed with LibreLinkUp."""

    pass


class LibreLinkUpConnectionError(LibreLinkUpSyncError):
    """Connection to LibreLinkUp failed."""

    pass


def resolve_api_url(region: str | None) -> APIUrl:
    """Resolve a stored region string to a pylibrelinkup ``APIUrl``.

    LibreLinkUp accounts are bound to a regional server; the follower must use
    the same region as the sharer. Region is stored on the credential as the
    ``APIUrl`` member name (US, EU, EU2, AE, AP, AU, CA, DE, FR, JP, LA, RU).
    Unknown/empty values fall back to US.
    """
    if not region:
        return APIUrl.US
    try:
        return APIUrl[region.upper()]
    except KeyError:
        logger.warning("Unknown LibreLinkUp region, defaulting to US", region=region)
        return APIUrl.US


def map_libre_trend(trend_value: Any) -> TrendDirection:
    """Map a pylibrelinkup ``Trend`` (or raw arrow int) to our enum.

    ``graph()`` history points have no trend, so ``None`` maps to
    ``NOT_COMPUTABLE``. The ``Trend`` enum's ``.value`` is the arrow int (1-5).
    """
    if trend_value is None:
        return TrendDirection.NOT_COMPUTABLE
    key = getattr(trend_value, "value", trend_value)
    return LIBRE_TREND_MAP.get(key, TrendDirection.NOT_COMPUTABLE)


def _ensure_utc(dt: datetime) -> datetime:
    """Normalize a measurement timestamp to a UTC-aware datetime.

    LibreLinkUp's ``FactoryTimestamp`` is UTC but may arrive tz-naive; the
    ``reading_timestamp`` column is ``timestamptz``, so attach/convert to UTC.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _select_patient(patients: list, pinned_id: str | None) -> tuple[Any, str]:
    """Pick which LibreLinkUp connection to sync, pinned to a stored patient id.

    A follower can share from more than one patient, and ``get_patients()``
    order is not guaranteed, so blindly taking ``patients[0]`` could ingest a
    different person's readings under the same user. Once a credential is pinned
    (first successful sync) we require that exact connection on every later sync;
    before that we refuse to guess when the set is ambiguous.

    Returns ``(patient, patient_id_str)``. Raises ``LibreLinkUpSyncError`` when
    the pinned connection is gone or the unpinned set is ambiguous.
    """
    if pinned_id is not None:
        for patient in patients:
            if str(patient.patient_id) == pinned_id:
                return patient, pinned_id
        raise LibreLinkUpSyncError(
            "The pinned LibreLinkUp connection is no longer shared with this "
            "account. Reconnect LibreLinkUp to select the current connection."
        )
    if len(patients) > 1:
        raise LibreLinkUpSyncError(
            "Multiple LibreLinkUp sharing connections found; choosing among "
            "them is not yet supported. Keep a single follower connection."
        )
    patient = patients[0]
    return patient, str(patient.patient_id)


async def sync_librelinkup_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    max_readings: int | None = None,
) -> dict[str, Any]:
    """Sync LibreLinkUp glucose readings for a specific user.

    Args:
        db: Database session
        user_id: User ID to sync for
        max_readings: Cap on history points kept from ``graph()`` (most recent
            first). Defaults to ``settings.librelinkup_max_readings_per_sync``.
            The current ``latest()`` reading is always stored on top.

    Returns:
        Dict with sync results (readings_fetched, readings_stored, last_reading)

    Raises:
        LibreLinkUpAuthError: If credentials are invalid
        LibreLinkUpConnectionError: If connection fails
        LibreLinkUpSyncError: For other sync errors

    Note:
        Glucose values here are in mg/dL.
    """
    if max_readings is None:
        max_readings = settings.librelinkup_max_readings_per_sync

    logger.info(
        "Starting LibreLinkUp sync for user",
        user_id=str(user_id),
        max_readings=max_readings,
    )

    result = await db.execute(
        select(IntegrationCredential).where(
            IntegrationCredential.user_id == user_id,
            IntegrationCredential.integration_type == IntegrationType.LIBRELINKUP,
        )
    )
    credential = result.scalar_one_or_none()

    if not credential:
        logger.warning(
            "No LibreLinkUp credentials found for user", user_id=str(user_id)
        )
        raise LibreLinkUpSyncError("LibreLinkUp integration not configured")

    if credential.status == IntegrationStatus.DISCONNECTED:
        logger.warning("LibreLinkUp integration is disconnected", user_id=str(user_id))
        raise LibreLinkUpSyncError("LibreLinkUp integration is disconnected")

    # Decrypt credentials
    try:
        username = decrypt_credential(credential.encrypted_username)
        password = decrypt_credential(credential.encrypted_password)
    except ValueError as e:
        logger.error(
            "Failed to decrypt LibreLinkUp credentials",
            user_id=str(user_id),
            error=str(e),
        )
        credential.status = IntegrationStatus.ERROR
        credential.last_error = "Credential decryption failed"
        await db.commit()
        raise LibreLinkUpSyncError("Failed to decrypt credentials") from e

    api_url = resolve_api_url(credential.region)

    # Authenticate (off the event loop, time-bounded -- see _run_blocking)
    client = PyLibreLinkUp(email=username, password=password, api_url=api_url)
    try:
        await _run_blocking(client.authenticate)
    except llu_errors.AuthenticationError as e:
        logger.warning(
            "LibreLinkUp authentication failed", user_id=str(user_id), error=str(e)
        )
        credential.status = IntegrationStatus.ERROR
        credential.last_error = "Authentication failed - check credentials"
        await db.commit()
        raise LibreLinkUpAuthError("Invalid LibreLinkUp credentials") from e
    except Exception as e:
        logger.error(
            "Failed to connect to LibreLinkUp", user_id=str(user_id), error=str(e)
        )
        credential.status = IntegrationStatus.ERROR
        credential.last_error = f"Connection failed: {str(e)}"
        await db.commit()
        raise LibreLinkUpConnectionError(f"Failed to connect: {str(e)}") from e

    # Resolve the follower connection (patient) and fetch data
    try:
        patients = await _run_blocking(client.get_patients)
        if not patients:
            raise LibreLinkUpSyncError(
                "No LibreLinkUp follower connection available. Accept a sharing "
                "invitation in the LibreLinkUp app first."
            )
        # Pin to a specific connection so we never silently ingest a different
        # person's readings (see _select_patient). Store the pin on first sync.
        patient, patient_id = _select_patient(patients, credential.external_account_id)
        credential.external_account_id = patient_id
        history = await _run_blocking(client.graph, patient)
        current = await _run_blocking(client.latest, patient)
    except LibreLinkUpSyncError as e:
        # No connection / ambiguous set / pinned-connection-gone: record why so
        # status and the next scheduler tick reflect it, then surface it.
        credential.status = IntegrationStatus.ERROR
        credential.last_error = str(e)
        await db.commit()
        raise
    except Exception as e:
        logger.error(
            "Failed to fetch LibreLinkUp readings",
            user_id=str(user_id),
            error=str(e),
        )
        credential.status = IntegrationStatus.ERROR
        credential.last_error = f"Fetch failed: {str(e)}"
        await db.commit()
        raise LibreLinkUpSyncError(f"Failed to fetch readings: {str(e)}") from e

    # Keep only the most recent ``max_readings`` history points (ascending).
    history = sorted(history, key=lambda m: m.factory_timestamp)
    if max_readings and len(history) > max_readings:
        history = history[-max_readings:]

    # (measurement, trend) pairs -- current first so its trend wins on collision.
    pairs: list[tuple[Any, TrendDirection]] = []
    if current is not None:
        pairs.append((current, map_libre_trend(getattr(current, "trend", None))))
    pairs.extend((m, TrendDirection.NOT_COMPUTABLE) for m in history)

    if not pairs:
        logger.info("No new readings from LibreLinkUp", user_id=str(user_id))
        credential.status = IntegrationStatus.CONNECTED
        credential.last_sync_at = datetime.now(UTC)
        credential.last_error = None
        await db.commit()
        return {"readings_fetched": 0, "readings_stored": 0, "last_reading": None}

    now = datetime.now(UTC)
    stored_count = 0
    last_reading = None

    for measurement, trend in pairs:
        reading_time = _ensure_utc(measurement.factory_timestamp)
        value = round(measurement.value_in_mg_per_dl)

        stmt = (
            insert(GlucoseReading)
            .values(
                id=uuid.uuid4(),
                user_id=user_id,
                value=value,
                reading_timestamp=reading_time,
                trend=trend,
                trend_rate=None,
                received_at=now,
                source="librelinkup",
            )
            .on_conflict_do_nothing(index_elements=["user_id", "reading_timestamp"])
        )

        result = await db.execute(stmt)
        if result.rowcount > 0:
            stored_count += 1

        if last_reading is None or reading_time > last_reading["timestamp"]:
            last_reading = {
                "value": value,
                "timestamp": reading_time,
                "trend": trend.value,
            }

    credential.status = IntegrationStatus.CONNECTED
    credential.last_sync_at = now
    credential.last_error = None
    await db.commit()

    logger.info(
        "LibreLinkUp sync completed",
        user_id=str(user_id),
        readings_fetched=len(pairs),
        readings_stored=stored_count,
        last_value=last_reading["value"] if last_reading else None,
    )

    return {
        "readings_fetched": len(pairs),
        "readings_stored": stored_count,
        "last_reading": last_reading,
    }
