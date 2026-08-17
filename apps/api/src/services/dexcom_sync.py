"""Story 3.2: Dexcom CGM Data Sync Service.

Handles fetching glucose readings from Dexcom Share API and storing them.
"""

import asyncio
import math
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Any, cast

import requests
from pydexcom import Dexcom as PydexcomDexcom
from pydexcom import Region
from pydexcom import errors as dexcom_errors
from pydexcom.const import HEADERS
from sqlalchemy import or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.core.encryption import decrypt_credential
from src.logging_config import get_logger
from src.models.dexcom_sync_state import DexcomSyncState
from src.models.glucose import PYDEXCOM_TREND_MAP, GlucoseReading, TrendDirection
from src.models.integration import (
    IntegrationCredential,
    IntegrationStatus,
    IntegrationType,
)
from src.services.cgm_source import glucose_readings_query

logger = get_logger(__name__)

DEXCOM_BACKFILL_MINUTES = 24 * 60
DEXCOM_BACKFILL_MAX_READINGS = 288
DEXCOM_READING_INTERVAL_SECONDS = 5 * 60
DEXCOM_POLL_LEAD_SECONDS = 15
DEXCOM_PHASE_EARLIEST_AFTER_RECEIPT_SECONDS = 225
DEXCOM_PHASE_LATEST_AFTER_RECEIPT_SECONDS = 295
DEXCOM_CATCH_UP_POLL_SECONDS = 1
DEXCOM_FAST_RETRY_COUNT = 5
DEXCOM_MEDIUM_RETRY_COUNT = 10
DEXCOM_FAILURE_RETRY_SECONDS = (5, 10, 20, 40, 60)
DEXCOM_RATE_LIMIT_MIN_RETRY_SECONDS = 5 * 60
DEXCOM_MULTI_REQUEST_TIMEOUT_MULTIPLIER = 3
DEXCOM_SYNC_REQUEST_TIMEOUT_BUDGETS = 4
DEXCOM_SYNC_LEASE_PROCESSING_OVERHEAD_SECONDS = 2 * 60
GLUCOSE_MIN_MGDL = 20
GLUCOSE_MAX_MGDL = 500


def dexcom_multi_request_timeout_seconds() -> int:
    """Allow a pydexcom operation to complete its sequential Share requests."""

    return (
        settings.dexcom_request_timeout_seconds
        * DEXCOM_MULTI_REQUEST_TIMEOUT_MULTIPLIER
    )


def dexcom_sync_lease_seconds() -> int:
    """Cover login, fetch, persistence, publication, and alert evaluation."""

    return (
        settings.dexcom_request_timeout_seconds * DEXCOM_SYNC_REQUEST_TIMEOUT_BUDGETS
        + DEXCOM_SYNC_LEASE_PROCESSING_OVERHEAD_SECONDS
    )


class DexcomSyncError(Exception):
    """Base exception for Dexcom sync errors."""


class DexcomAuthError(DexcomSyncError):
    """Authentication failed with Dexcom."""


class DexcomConnectionError(DexcomSyncError):
    """Connection to Dexcom failed."""


class DexcomRateLimitError(DexcomConnectionError):
    """Dexcom Share rejected a request because the caller is rate limited."""

    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Dexcom Share rate limit reached")
        self.retry_after_seconds = retry_after_seconds


class DexcomSyncInProgressError(DexcomSyncError):
    """Another worker owns the user's active Dexcom synchronization lease."""


def _rate_limit_retry_after_seconds(response: requests.Response) -> int:
    """Return a conservative delay for an HTTP 429 response."""

    value = response.headers.get("Retry-After")
    parsed_seconds: float | None = None
    if value:
        try:
            parsed_seconds = float(value)
            if not math.isfinite(parsed_seconds):
                parsed_seconds = None
        except ValueError:
            try:
                retry_at = parsedate_to_datetime(value)
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=UTC)
                parsed_seconds = (
                    retry_at.astimezone(UTC) - datetime.now(UTC)
                ).total_seconds()
            except (TypeError, ValueError, OverflowError):
                parsed_seconds = None
    return max(
        DEXCOM_RATE_LIMIT_MIN_RETRY_SECONDS,
        math.ceil(parsed_seconds or 0),
    )


class Dexcom(PydexcomDexcom):
    """pydexcom client with an explicit timeout on every Share request."""

    def _post(
        self,
        endpoint: str,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        response = self._session.post(
            f"{self._base_url}{endpoint}",
            headers=HEADERS,
            params=params,
            json={} if json is None else json,
            timeout=settings.dexcom_request_timeout_seconds,
        )
        if response.status_code == 429:
            raise DexcomRateLimitError(_rate_limit_retry_after_seconds(response))
        try:
            response_json = response.json()
            response.raise_for_status()
        except requests.HTTPError as error:
            raise self._handle_error_code(response_json) from error
        except requests.JSONDecodeError as error:
            raise dexcom_errors.ServerError(
                dexcom_errors.ServerErrorEnum.INVALID_JSON
            ) from error
        return response_json


@dataclass(slots=True)
class DexcomValidationResult:
    """Credential validation result that preserves the first fetched reading."""

    credentials_valid: bool
    error_message: str | None = None
    reading: Any | None = None
    client: Dexcom | None = None
    waiting_for_reading: bool = False


_dexcom_clients: dict[uuid.UUID, Dexcom] = {}


def cache_dexcom_client(user_id: uuid.UUID, client: Dexcom) -> None:
    """Reuse the authenticated Share session for later polls in this process."""

    _dexcom_clients[user_id] = client


def invalidate_dexcom_client(user_id: uuid.UUID) -> None:
    _dexcom_clients.pop(user_id, None)


def validate_and_fetch_dexcom(
    username: str, password: str, region: str
) -> DexcomValidationResult:
    """Validate credentials and retain the current reading from the same request."""

    try:
        client = Dexcom(
            username=username, password=password, region=Region(region.lower())
        )
    except dexcom_errors.AccountError:
        return DexcomValidationResult(
            credentials_valid=False,
            error_message=(
                "Could not log in to Dexcom. Double-check your email, password, "
                "and region selection (US / Outside US / Japan), and confirm "
                "Dexcom Share is enabled with at least one follower invited."
            ),
        )
    except DexcomRateLimitError:
        raise
    except Exception as error:
        logger.warning("Dexcom validation could not reach Share", exc_info=True)
        raise DexcomConnectionError(
            "Could not verify credentials with Dexcom Share"
        ) from error

    try:
        reading = client.get_current_glucose_reading()
    except dexcom_errors.AccountError:
        return DexcomValidationResult(
            credentials_valid=False,
            error_message="Dexcom rejected the supplied credentials.",
        )
    except DexcomRateLimitError:
        raise
    except Exception:
        logger.info("Dexcom credentials valid; current reading temporarily unavailable")
        return DexcomValidationResult(
            credentials_valid=True,
            client=client,
            error_message="Connected, waiting for the first Dexcom reading.",
            waiting_for_reading=True,
        )

    return DexcomValidationResult(
        credentials_valid=True,
        reading=reading,
        client=client,
        waiting_for_reading=reading is None,
    )


def map_trend(trend_value: str | int) -> TrendDirection:
    """Map pydexcom trend value to our TrendDirection enum.

    Args:
        trend_value: Trend from pydexcom (string or int)

    Returns:
        TrendDirection enum value
    """
    if trend_value in PYDEXCOM_TREND_MAP:
        return PYDEXCOM_TREND_MAP[trend_value]
    return TrendDirection.NOT_COMPUTABLE


def reading_timestamp(reading: Any) -> datetime:
    value = cast(
        datetime, reading.datetime if hasattr(reading, "datetime") else reading.time
    )
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def calculate_next_poll_at(
    *,
    now: datetime,
    poll_phase_at: datetime | None,
    unchanged_attempts: int,
) -> datetime:
    """Schedule bounded probes without moving the fixed five-minute phase."""

    if poll_phase_at is None:
        return now + timedelta(seconds=DEXCOM_READING_INTERVAL_SECONDS)
    if unchanged_attempts == 0:
        return advance_poll_phase(poll_phase_at, now)
    if unchanged_attempts <= DEXCOM_FAST_RETRY_COUNT:
        return now + timedelta(seconds=5)
    if unchanged_attempts <= DEXCOM_MEDIUM_RETRY_COUNT:
        return now + timedelta(seconds=20)
    return advance_poll_phase(poll_phase_at, now)


def advance_poll_phase(poll_phase_at: datetime, now: datetime) -> datetime:
    """Advance a phase anchor by exact five-minute slots until it is future."""

    if poll_phase_at > now:
        return poll_phase_at
    elapsed_seconds = (now - poll_phase_at).total_seconds()
    elapsed_slots = math.floor(elapsed_seconds / DEXCOM_READING_INTERVAL_SECONDS) + 1
    return poll_phase_at + timedelta(
        seconds=elapsed_slots * DEXCOM_READING_INTERVAL_SECONDS
    )


def next_poll_phase_after_reading(
    *,
    reading_at: datetime,
    received_at: datetime,
) -> datetime:
    """Anchor the next probe to the sensor cadence without receipt-time drift.

    A temporarily delayed Share publication must not move every later poll.
    The source timestamp provides the stable five-minute cadence. Poll slightly
    before the next expected timestamp so bounded retries bracket publication.
    """

    source_phase_at = reading_at + timedelta(
        seconds=DEXCOM_READING_INTERVAL_SECONDS - DEXCOM_POLL_LEAD_SECONDS
    )
    if source_phase_at <= received_at:
        # A late response may already be missing a newer expected reading. Probe
        # again on the next scheduler tick instead of skipping another five minutes.
        return received_at + timedelta(seconds=DEXCOM_CATCH_UP_POLL_SECONDS)

    # DT carries the sensor cadence but is still a device supplied wall clock.
    # Keep its useful phase signal while preventing clock skew from scheduling
    # the next request too late or exhausting the bounded retry burst too early.
    earliest_phase_at = received_at + timedelta(
        seconds=DEXCOM_PHASE_EARLIEST_AFTER_RECEIPT_SECONDS
    )
    latest_phase_at = received_at + timedelta(
        seconds=DEXCOM_PHASE_LATEST_AFTER_RECEIPT_SECONDS
    )
    return min(max(source_phase_at, earliest_phase_at), latest_phase_at)


def calculate_failure_retry_at(
    *,
    now: datetime,
    poll_phase_at: datetime | None,
    consecutive_failures: int,
) -> datetime:
    """Use bounded transport retries, then return to the fixed phase."""

    if 1 <= consecutive_failures <= len(DEXCOM_FAILURE_RETRY_SECONDS):
        return now + timedelta(
            seconds=DEXCOM_FAILURE_RETRY_SECONDS[consecutive_failures - 1]
        )
    if poll_phase_at is None:
        return now + timedelta(seconds=DEXCOM_READING_INTERVAL_SECONDS)
    return advance_poll_phase(poll_phase_at, now)


def schedule_transport_failure(
    state: DexcomSyncState,
    *,
    now: datetime,
    message: str,
) -> None:
    """Record one failed Share request and apply the bounded failure policy."""

    state.consecutive_failures += 1
    state.last_error = message
    state.next_poll_at = calculate_failure_retry_at(
        now=now,
        poll_phase_at=state.poll_phase_at,
        consecutive_failures=state.consecutive_failures,
    )
    if state.consecutive_failures > len(DEXCOM_FAILURE_RETRY_SECONDS):
        state.poll_phase_at = state.next_poll_at


async def get_or_create_dexcom_state(
    db: AsyncSession, user_id: uuid.UUID, *, now: datetime | None = None
) -> DexcomSyncState:
    result = await db.execute(
        select(DexcomSyncState).where(DexcomSyncState.user_id == user_id)
    )
    state = result.scalar_one_or_none()
    if state is None:
        current_time = now or datetime.now(UTC)
        state = DexcomSyncState(
            user_id=user_id,
            next_poll_at=current_time,
            poll_phase_at=current_time
            + timedelta(seconds=DEXCOM_READING_INTERVAL_SECONDS),
        )
        db.add(state)
        await db.flush()
    return state


async def acquire_dexcom_sync_lease(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    now: datetime | None = None,
    only_if_due: bool = False,
) -> uuid.UUID | None:
    """Atomically acquire a durable lease shared by every sync entry point."""

    current_time = now or datetime.now(UTC)
    lease_id = uuid.uuid4()
    conditions = [
        DexcomSyncState.user_id == user_id,
        or_(
            DexcomSyncState.sync_lease_expires_at.is_(None),
            DexcomSyncState.sync_lease_expires_at <= current_time,
        ),
    ]
    if only_if_due:
        conditions.append(DexcomSyncState.next_poll_at <= current_time)

    result = await db.execute(
        update(DexcomSyncState)
        .where(*conditions)
        .values(
            sync_lease_id=lease_id,
            sync_lease_expires_at=current_time
            + timedelta(seconds=dexcom_sync_lease_seconds()),
        )
        .returning(DexcomSyncState.sync_lease_id)
    )
    acquired = result.scalar_one_or_none()
    await db.commit()
    return acquired


async def release_dexcom_sync_lease(
    db: AsyncSession, user_id: uuid.UUID, lease_id: uuid.UUID
) -> None:
    """Release only the lease owned by this synchronization attempt."""

    await db.execute(
        update(DexcomSyncState)
        .where(
            DexcomSyncState.user_id == user_id,
            DexcomSyncState.sync_lease_id == lease_id,
        )
        .values(sync_lease_id=None, sync_lease_expires_at=None)
    )
    await db.commit()


async def store_dexcom_readings(
    db: AsyncSession,
    user_id: uuid.UUID,
    readings: list[Any],
    *,
    received_at: datetime | None = None,
) -> tuple[int, dict[str, Any] | None, dict[str, Any] | None]:
    """Store one batch and return the newest fetched and inserted readings."""

    if not readings:
        return 0, None, None
    now = received_at or datetime.now(UTC)
    rows = []
    newest: dict[str, Any] | None = None
    for reading in readings:
        timestamp = reading_timestamp(reading)
        value = getattr(reading, "value", None)
        if (
            not isinstance(value, (int, float))
            or isinstance(value, bool)
            or not math.isfinite(value)
            or not GLUCOSE_MIN_MGDL <= value <= GLUCOSE_MAX_MGDL
        ):
            logger.warning(
                "Discarding invalid Dexcom glucose reading",
                user_id=str(user_id),
                reading_timestamp=timestamp.isoformat(),
                value=value,
            )
            continue
        trend = map_trend(
            reading.trend if hasattr(reading, "trend") else reading.trend_direction
        )
        rows.append(
            {
                "id": uuid.uuid4(),
                "user_id": user_id,
                "value": value,
                "reading_timestamp": timestamp,
                "trend": trend,
                "trend_rate": getattr(reading, "trend_rate", None),
                "received_at": now,
                "source": "dexcom",
            }
        )
        if newest is None or timestamp > newest["timestamp"]:
            newest = {
                "value": value,
                "timestamp": timestamp,
                "trend": trend.value,
            }
    if not rows:
        return 0, None, None

    statement = (
        insert(GlucoseReading)
        .values(rows)
        .on_conflict_do_nothing(index_elements=["user_id", "reading_timestamp"])
        .returning(
            GlucoseReading.value,
            GlucoseReading.reading_timestamp,
            GlucoseReading.trend,
        )
    )
    result = await db.execute(statement)
    inserted_rows = result.all()
    newest_inserted = None
    if inserted_rows:
        inserted = max(inserted_rows, key=lambda row: row.reading_timestamp)
        newest_inserted = {
            "value": inserted.value,
            "timestamp": inserted.reading_timestamp,
            "trend": inserted.trend.value,
        }
    return len(inserted_rows), newest, newest_inserted


async def store_initial_dexcom_reading(
    db: AsyncSession,
    user_id: uuid.UUID,
    reading: Any | None,
) -> dict[str, Any] | None:
    """Persist the reading already fetched while connecting and prime polling."""

    now = datetime.now(UTC)
    state = await get_or_create_dexcom_state(db, user_id, now=now)
    newest = None
    newest_inserted = None
    if reading is not None:
        _, newest, newest_inserted = await store_dexcom_readings(
            db, user_id, [reading], received_at=now
        )
        if newest:
            state.latest_reading_at = newest["timestamp"]
            state.last_success_at = now
            state.poll_phase_at = next_poll_phase_after_reading(
                reading_at=newest["timestamp"],
                received_at=now,
            )
    state.last_attempt_at = now
    state.next_poll_at = now
    if newest is None:
        state.poll_phase_at = now + timedelta(seconds=DEXCOM_READING_INTERVAL_SECONDS)
    state.initial_backfill_complete = False
    state.unchanged_attempts = 0
    state.consecutive_failures = 0
    state.last_error = None
    await db.commit()
    if newest_inserted:
        from src.services.glucose_realtime import publish_glucose_update

        await publish_glucose_update(user_id, newest_inserted["timestamp"])
        await evaluate_realtime_alerts(db, user_id)
    return newest


async def evaluate_realtime_alerts(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Evaluate alerts for a committed reading without failing glucose sync."""

    try:
        from src.services.predictive_alerts import evaluate_alerts_for_user

        await evaluate_alerts_for_user(db, user_id)
    except Exception:
        # The five-minute scheduled alert job remains a fallback. A transient
        # alert-engine failure must not turn a successful glucose sync into a
        # failed one or delay the next adaptive poll.
        logger.exception(
            "Immediate alert evaluation failed after Dexcom sync",
            user_id=str(user_id),
        )


async def sync_dexcom_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    max_readings: int | None = None,
    *,
    only_if_due: bool = False,
) -> dict[str, Any]:
    """Synchronize one user while holding the shared durable lease."""

    credential_result = await db.execute(
        select(IntegrationCredential).where(
            IntegrationCredential.user_id == user_id,
            IntegrationCredential.integration_type == IntegrationType.DEXCOM,
        )
    )
    credential = credential_result.scalar_one_or_none()
    if (
        credential is None
        or credential.status == IntegrationStatus.DISCONNECTED
        or credential.cgm_role == "off"
    ):
        return await _sync_dexcom_for_user(db, user_id, max_readings)

    await get_or_create_dexcom_state(db, user_id)
    await db.commit()
    lease_id = await acquire_dexcom_sync_lease(db, user_id, only_if_due=only_if_due)
    if lease_id is None:
        raise DexcomSyncInProgressError(
            "Dexcom synchronization is already running or is not due"
        )

    try:
        return await _sync_dexcom_for_user(db, user_id, max_readings)
    finally:
        try:
            await db.rollback()
            await release_dexcom_sync_lease(db, user_id, lease_id)
        except Exception:
            logger.exception(
                "Failed to release Dexcom synchronization lease",
                user_id=str(user_id),
                lease_id=str(lease_id),
            )


async def _sync_dexcom_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    max_readings: int | None = None,
) -> dict[str, Any]:
    """Sync Dexcom glucose readings for a specific user.

    Args:
        db: Database session
        user_id: User ID to sync for
        max_readings: Maximum number of readings to fetch (default from settings)

    Returns:
        Dict with sync results (readings_fetched, readings_stored, last_reading)

    Raises:
        DexcomAuthError: If credentials are invalid
        DexcomConnectionError: If connection fails
        DexcomSyncError: For other sync errors

    Note:
        Glucose values here are in mg/dL.
    """
    now = datetime.now(UTC)
    result = await db.execute(
        select(IntegrationCredential).where(
            IntegrationCredential.user_id == user_id,
            IntegrationCredential.integration_type == IntegrationType.DEXCOM,
        )
    )
    credential = result.scalar_one_or_none()

    if not credential:
        logger.warning("No Dexcom credentials found for user", user_id=str(user_id))
        raise DexcomSyncError("Dexcom integration not configured")

    if credential.status == IntegrationStatus.DISCONNECTED:
        logger.warning("Dexcom integration is disconnected", user_id=str(user_id))
        raise DexcomSyncError("Dexcom integration is disconnected")

    if credential.cgm_role == "off":
        invalidate_dexcom_client(user_id)
        return {
            "readings_fetched": 0,
            "readings_stored": 0,
            "last_reading": None,
            "skipped": "disabled",
        }

    state = await get_or_create_dexcom_state(db, user_id, now=now)
    state.last_attempt_at = now

    # Decrypt credentials
    try:
        username = decrypt_credential(credential.encrypted_username)
        password = decrypt_credential(credential.encrypted_password)
    except ValueError as e:
        logger.error(
            "Failed to decrypt Dexcom credentials",
            user_id=str(user_id),
            error=str(e),
        )
        credential.status = IntegrationStatus.ERROR
        credential.last_error = "Credential decryption failed"
        state.last_error = "Credential decryption failed"
        state.consecutive_failures += 1
        await db.commit()
        raise DexcomSyncError("Failed to decrypt credentials") from e

    try:
        dexcom_region = Region((credential.region or "US").lower())
    except ValueError as e:
        credential.status = IntegrationStatus.ERROR
        credential.last_error = "Invalid Dexcom region configured"
        state.last_error = "Invalid Dexcom region configured"
        state.next_poll_at = now + timedelta(seconds=DEXCOM_READING_INTERVAL_SECONDS)
        invalidate_dexcom_client(user_id)
        await db.commit()
        raise DexcomSyncError("Invalid Dexcom region") from e

    client = _dexcom_clients.get(user_id)
    try:
        if client is None:
            client = await asyncio.wait_for(
                asyncio.to_thread(
                    Dexcom,
                    username=username,
                    password=password,
                    region=dexcom_region,
                ),
                timeout=dexcom_multi_request_timeout_seconds(),
            )
            assert client is not None
            cache_dexcom_client(user_id, client)
    except DexcomRateLimitError as e:
        state.consecutive_failures += 1
        state.last_error = "Dexcom Share rate limited; retry scheduled"
        state.next_poll_at = now + timedelta(seconds=e.retry_after_seconds)
        await db.commit()
        raise
    except dexcom_errors.AccountError as e:
        logger.warning(
            "Dexcom authentication failed",
            user_id=str(user_id),
            error=str(e),
        )
        credential.status = IntegrationStatus.ERROR
        credential.last_error = "Authentication failed - check credentials"
        state.last_error = "Authentication failed"
        invalidate_dexcom_client(user_id)
        await db.commit()
        raise DexcomAuthError("Invalid Dexcom credentials") from e
    except Exception as e:
        invalidate_dexcom_client(user_id)
        schedule_transport_failure(
            state,
            now=now,
            message="Dexcom Share is temporarily unavailable",
        )
        await db.commit()
        raise DexcomConnectionError("Failed to connect to Dexcom Share") from e

    is_backfill = not state.initial_backfill_complete
    fetch_minutes = DEXCOM_BACKFILL_MINUTES if is_backfill else 60
    fetch_count = (
        DEXCOM_BACKFILL_MAX_READINGS
        if is_backfill
        else (max_readings or settings.dexcom_max_readings_per_sync)
    )
    try:
        assert client is not None
        readings = await asyncio.wait_for(
            asyncio.to_thread(
                client.get_glucose_readings,
                minutes=fetch_minutes,
                max_count=fetch_count,
            ),
            timeout=dexcom_multi_request_timeout_seconds(),
        )
    except TimeoutError as e:
        invalidate_dexcom_client(user_id)
        schedule_transport_failure(
            state,
            now=now,
            message="Dexcom Share fetch failed; retrying",
        )
        await db.commit()
        raise DexcomSyncError("Failed to fetch Dexcom readings") from e
    except DexcomRateLimitError as e:
        state.consecutive_failures += 1
        state.last_error = "Dexcom Share rate limited; retry scheduled"
        state.next_poll_at = now + timedelta(seconds=e.retry_after_seconds)
        await db.commit()
        raise
    except dexcom_errors.AccountError as e:
        credential.status = IntegrationStatus.ERROR
        credential.last_error = "Authentication failed - check credentials"
        state.last_error = "Authentication failed"
        invalidate_dexcom_client(user_id)
        await db.commit()
        raise DexcomAuthError("Invalid Dexcom credentials") from e
    except dexcom_errors.SessionError as e:
        logger.warning(
            "Dexcom session error",
            user_id=str(user_id),
            error=str(e),
        )
        invalidate_dexcom_client(user_id)
        schedule_transport_failure(
            state,
            now=now,
            message="Dexcom session unavailable; retrying",
        )
        await db.commit()
        raise DexcomConnectionError("Session error") from e
    except Exception as e:
        invalidate_dexcom_client(user_id)
        schedule_transport_failure(
            state,
            now=now,
            message="Dexcom Share fetch failed; retrying",
        )
        await db.commit()
        raise DexcomSyncError("Failed to fetch Dexcom readings") from e

    # Stamp receipt only after Share has returned. The local receipt clock is
    # used for freshness and does not set the fixed sensor phase.
    received_at = datetime.now(UTC)
    stored_count, last_reading, newest_inserted = await store_dexcom_readings(
        db, user_id, list(readings), received_at=received_at
    )
    previous_latest = state.latest_reading_at
    fetched_latest = last_reading["timestamp"] if last_reading else previous_latest
    has_new_latest = bool(
        fetched_latest and (previous_latest is None or fetched_latest > previous_latest)
    )
    if has_new_latest:
        assert fetched_latest is not None
        state.poll_phase_at = next_poll_phase_after_reading(
            reading_at=fetched_latest,
            received_at=received_at,
        )
        state.latest_reading_at = fetched_latest
        state.unchanged_attempts = 0
    elif is_backfill and state.latest_reading_at is not None:
        # The immediate backfill normally includes the reading stored during
        # connection. It should establish history without starting an early
        # retry burst several minutes before the next sensor reading is due.
        state.unchanged_attempts = 0
    else:
        state.unchanged_attempts += 1
        if state.unchanged_attempts > DEXCOM_MEDIUM_RETRY_COUNT:
            state.poll_phase_at = advance_poll_phase(state.poll_phase_at, received_at)

    state.initial_backfill_complete = state.initial_backfill_complete or is_backfill
    state.last_success_at = received_at
    state.consecutive_failures = 0
    state.last_error = None
    state.next_poll_at = calculate_next_poll_at(
        now=received_at,
        poll_phase_at=state.poll_phase_at,
        unchanged_attempts=state.unchanged_attempts,
    )
    credential.status = IntegrationStatus.CONNECTED
    credential.last_sync_at = received_at
    credential.last_error = None
    await db.commit()

    if newest_inserted:
        from src.services.glucose_realtime import publish_glucose_update

        await publish_glucose_update(user_id, newest_inserted["timestamp"])
        await evaluate_realtime_alerts(db, user_id)

    logger.info(
        "Dexcom sync completed",
        user_id=str(user_id),
        readings_fetched=len(readings),
        readings_stored=stored_count,
        reading_timestamp=(
            fetched_latest.isoformat() if has_new_latest and fetched_latest else None
        ),
        received_at=received_at.isoformat() if has_new_latest else None,
        poll_phase_at=state.poll_phase_at.isoformat(),
        unchanged_attempts=state.unchanged_attempts,
        next_poll_at=state.next_poll_at.isoformat(),
    )

    return {
        "readings_fetched": len(readings),
        "readings_stored": stored_count,
        "last_reading": last_reading,
    }


async def get_latest_glucose_reading(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    excluded_sources: list[str] | None = None,
) -> GlucoseReading | None:
    """Get the most recent glucose reading for a user.

    Args:
        db: Database session
        user_id: User ID
        excluded_sources: CGM ``source`` strings to exclude. Leave ``None``
            (default) to resolve the user's primary-source exclusion
            automatically (Story 43.10 / GLY-123) so the latest reading is
            drawn from the primary source only, with the fail-safe
            "no primary => exclude nothing". Pass an explicit list (e.g. an
            ``include_secondary``-aware set) to override the auto-resolution.

    Returns:
        Most recent GlucoseReading or None
    """
    stmt = (
        (await glucose_readings_query(db, user_id, excluded_sources=excluded_sources))
        .order_by(GlucoseReading.reading_timestamp.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_previous_glucose_reading(
    db: AsyncSession,
    user_id: uuid.UUID,
    current_timestamp: datetime,
    *,
    excluded_sources: list[str] | None = None,
) -> GlucoseReading | None:
    """Get the reading immediately before the current primary CGM reading."""

    stmt = (
        (await glucose_readings_query(db, user_id, excluded_sources=excluded_sources))
        .where(GlucoseReading.reading_timestamp < current_timestamp)
        .order_by(GlucoseReading.reading_timestamp.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_glucose_readings(
    db: AsyncSession,
    user_id: uuid.UUID,
    minutes: int = 180,
    limit: int = 36,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    excluded_sources: list[str] | None = None,
) -> list[GlucoseReading]:
    """Get recent glucose readings for a user.

    Args:
        db: Database session
        user_id: User ID
        minutes: Number of minutes of history (default 3 hours)
        limit: Maximum readings to return (applied regardless of date range)
        start: Optional absolute start of date range (overrides minutes)
        end: Optional absolute end of date range (overrides minutes)
        excluded_sources: CGM ``source`` strings to exclude. Leave ``None``
            (default) to resolve the user's primary-source exclusion
            automatically (Story 43.10 / GLY-123) so the history reflects the
            primary CGM only, with the fail-safe "no primary => exclude
            nothing". Pass an explicit list (e.g. an ``include_secondary``-aware
            set) to override the auto-resolution.

    Returns:
        List of GlucoseReading objects, ordered by timestamp descending
    """
    from datetime import timedelta

    if (start is None) != (end is None):
        raise ValueError("Both 'start' and 'end' must be provided together, or neither")
    if start is not None and end is not None:
        if start.tzinfo is None or end.tzinfo is None:
            raise ValueError("'start' and 'end' must be timezone-aware datetimes")
        if start > end:
            raise ValueError(f"'start' must be <= 'end' (got {start} > {end})")
        cutoff = start
        upper = end
    else:
        cutoff = datetime.now(UTC) - timedelta(minutes=minutes)
        upper = None

    stmt = await glucose_readings_query(db, user_id, excluded_sources=excluded_sources)
    stmt = stmt.where(GlucoseReading.reading_timestamp >= cutoff)
    if upper is not None:
        stmt = stmt.where(GlucoseReading.reading_timestamp < upper)
    stmt = stmt.order_by(GlucoseReading.reading_timestamp.desc()).limit(limit)

    result = await db.execute(stmt)
    return list(result.scalars().all())
