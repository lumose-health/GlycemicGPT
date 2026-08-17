"""Focused tests for Dexcom phase-aware polling."""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.config import settings
from src.models.integration import IntegrationStatus
from src.routers.integrations import _dexcom_freshness
from src.services import dexcom_sync, scheduler
from src.services.dexcom_sync import (
    Dexcom,
    DexcomConnectionError,
    DexcomRateLimitError,
    DexcomSyncInProgressError,
    acquire_dexcom_sync_lease,
    calculate_failure_retry_at,
    calculate_next_poll_at,
    evaluate_realtime_alerts,
    next_poll_phase_after_reading,
    sync_dexcom_for_user,
    validate_and_fetch_dexcom,
)

NOW = datetime(2026, 8, 11, 12, 0, tzinfo=UTC)


def test_dexcom_freshness_accepts_naive_database_timestamps() -> None:
    latest = datetime(2026, 8, 11, 11, 55)

    assert _dexcom_freshness(latest, NOW) == "connected"


def test_validation_transport_failure_is_not_reported_as_valid_credentials() -> None:
    with (
        patch(
            "src.services.dexcom_sync.Dexcom",
            side_effect=RuntimeError("Share unavailable"),
        ),
        pytest.raises(DexcomConnectionError),
    ):
        validate_and_fetch_dexcom("user@example.com", "password", "US")


@pytest.mark.parametrize("rate_limit_stage", ["login", "current_reading"])
def test_validation_preserves_share_rate_limit_details(rate_limit_stage: str) -> None:
    rate_limit = DexcomRateLimitError(420)
    client = MagicMock()
    if rate_limit_stage == "current_reading":
        client.get_current_glucose_reading.side_effect = rate_limit
        dexcom_side_effect = None
    else:
        dexcom_side_effect = rate_limit

    with (
        patch(
            "src.services.dexcom_sync.Dexcom",
            return_value=client,
            side_effect=dexcom_side_effect,
        ),
        pytest.raises(DexcomRateLimitError) as caught,
    ):
        validate_and_fetch_dexcom("user@example.com", "password", "US")

    assert caught.value is rate_limit
    assert caught.value.retry_after_seconds == 420


async def test_batch_storage_distinguishes_fetched_from_inserted_readings() -> None:
    db = AsyncMock()
    inserted_at = NOW - timedelta(minutes=5)
    fetched_latest_at = NOW
    execute_result = MagicMock()
    execute_result.all.return_value = [
        SimpleNamespace(
            value=118,
            reading_timestamp=inserted_at,
            trend=SimpleNamespace(value="flat"),
        )
    ]
    db.execute.return_value = execute_result
    readings = [
        SimpleNamespace(
            value=118,
            datetime=inserted_at,
            trend=4,
            trend_rate=0.0,
        ),
        SimpleNamespace(
            value=121,
            datetime=fetched_latest_at,
            trend=4,
            trend_rate=0.0,
        ),
    ]

    (
        stored_count,
        newest_fetched,
        newest_inserted,
    ) = await dexcom_sync.store_dexcom_readings(db, uuid.uuid4(), readings)

    assert stored_count == 1
    assert newest_fetched is not None
    assert newest_fetched["timestamp"] == fetched_latest_at
    assert newest_inserted is not None
    assert newest_inserted["timestamp"] == inserted_at


async def test_batch_storage_discards_out_of_range_readings() -> None:
    db = AsyncMock()
    valid_at = NOW - timedelta(minutes=5)
    execute_result = MagicMock()
    execute_result.all.return_value = [
        SimpleNamespace(
            value=120,
            reading_timestamp=valid_at,
            trend=SimpleNamespace(value="flat"),
        )
    ]
    db.execute.return_value = execute_result
    readings = [
        SimpleNamespace(
            value=19,
            datetime=NOW - timedelta(minutes=10),
            trend=4,
            trend_rate=0.0,
        ),
        SimpleNamespace(
            value=120,
            datetime=valid_at,
            trend=4,
            trend_rate=0.0,
        ),
        SimpleNamespace(
            value=501,
            datetime=NOW,
            trend=4,
            trend_rate=0.0,
        ),
    ]

    (
        stored_count,
        newest_fetched,
        newest_inserted,
    ) = await dexcom_sync.store_dexcom_readings(db, uuid.uuid4(), readings)

    statement = db.execute.await_args.args[0]
    params = statement.compile().params
    stored_values = [
        value for key, value in params.items() if key.startswith("value_m")
    ]
    assert stored_values == [120]
    assert stored_count == 1
    assert newest_fetched is not None
    assert newest_fetched["value"] == 120
    assert newest_inserted is not None
    assert newest_inserted["value"] == 120


@pytest.mark.parametrize("value", [20, 500])
async def test_batch_storage_accepts_canonical_glucose_bounds(value: int) -> None:
    db = AsyncMock()
    reading_at = NOW - timedelta(minutes=5)
    execute_result = MagicMock()
    execute_result.all.return_value = [
        SimpleNamespace(
            value=value,
            reading_timestamp=reading_at,
            trend=SimpleNamespace(value="flat"),
        )
    ]
    db.execute.return_value = execute_result

    stored_count, newest_fetched, _ = await dexcom_sync.store_dexcom_readings(
        db,
        uuid.uuid4(),
        [SimpleNamespace(value=value, datetime=reading_at, trend=4, trend_rate=0.0)],
    )

    assert stored_count == 1
    assert newest_fetched is not None
    assert newest_fetched["value"] == value


async def test_sync_state_creation_uses_a_conflict_tolerant_insert() -> None:
    db = AsyncMock()
    existing_state = SimpleNamespace(user_id=uuid.uuid4())
    missing_result = MagicMock()
    missing_result.scalar_one_or_none.return_value = None
    insert_result = MagicMock()
    existing_result = MagicMock()
    existing_result.scalar_one.return_value = existing_state
    db.execute.side_effect = [missing_result, insert_result, existing_result]

    result = await dexcom_sync.get_or_create_dexcom_state(
        db, existing_state.user_id, now=NOW
    )

    insert_statement = str(db.execute.await_args_list[1].args[0])
    assert "ON CONFLICT (user_id) DO NOTHING" in insert_statement
    assert result is existing_state


async def test_existing_initial_reading_is_not_published_again() -> None:
    db = AsyncMock()
    user_id = uuid.uuid4()
    reading_at = NOW
    reading = SimpleNamespace(
        value=121,
        datetime=reading_at,
        trend=4,
        trend_rate=0.0,
    )
    newest = {
        "value": reading.value,
        "timestamp": reading_at,
        "trend": "flat",
    }
    state = SimpleNamespace(
        latest_reading_at=None,
        last_attempt_at=None,
        last_success_at=None,
        next_poll_at=NOW,
        poll_phase_at=NOW,
        unchanged_attempts=0,
        consecutive_failures=0,
        initial_backfill_complete=False,
        last_error=None,
    )

    with (
        patch(
            "src.services.dexcom_sync.get_or_create_dexcom_state",
            new_callable=AsyncMock,
            return_value=state,
        ),
        patch(
            "src.services.dexcom_sync.store_dexcom_readings",
            new_callable=AsyncMock,
            return_value=(0, newest, None),
        ),
        patch(
            "src.services.glucose_realtime.publish_glucose_update",
            new_callable=AsyncMock,
        ) as publish,
        patch(
            "src.services.dexcom_sync.evaluate_realtime_alerts",
            new_callable=AsyncMock,
        ) as evaluate,
    ):
        result = await dexcom_sync.store_initial_dexcom_reading(db, user_id, reading)

    assert result == newest
    assert state.latest_reading_at == reading_at
    publish.assert_not_awaited()
    evaluate.assert_not_awaited()


async def test_rejected_initial_reading_preserves_last_valid_state() -> None:
    db = AsyncMock()
    user_id = uuid.uuid4()
    prior_reading_at = NOW - timedelta(minutes=5)
    prior_success_at = NOW - timedelta(minutes=4)
    reading = SimpleNamespace(
        value=501,
        datetime=NOW,
        trend=4,
        trend_rate=0.0,
    )
    state = SimpleNamespace(
        latest_reading_at=prior_reading_at,
        last_attempt_at=None,
        last_success_at=prior_success_at,
        next_poll_at=NOW,
        poll_phase_at=NOW,
        unchanged_attempts=0,
        consecutive_failures=0,
        initial_backfill_complete=False,
        last_error=None,
    )

    with (
        patch(
            "src.services.dexcom_sync.get_or_create_dexcom_state",
            new_callable=AsyncMock,
            return_value=state,
        ),
        patch(
            "src.services.dexcom_sync.store_dexcom_readings",
            new_callable=AsyncMock,
            return_value=(0, None, None),
        ),
    ):
        result = await dexcom_sync.store_initial_dexcom_reading(db, user_id, reading)

    assert result is None
    assert state.latest_reading_at == prior_reading_at
    assert state.last_success_at == prior_success_at


async def test_active_sync_lease_blocks_every_share_entry_point() -> None:
    db = AsyncMock()
    credential_result = MagicMock()
    credential_result.scalar_one_or_none.return_value = MagicMock(
        status=IntegrationStatus.CONNECTED,
        cgm_role="primary",
    )
    db.execute.return_value = credential_result

    with (
        patch(
            "src.services.dexcom_sync.get_or_create_dexcom_state",
            new_callable=AsyncMock,
        ),
        patch(
            "src.services.dexcom_sync.acquire_dexcom_sync_lease",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "src.services.dexcom_sync._sync_dexcom_for_user",
            new_callable=AsyncMock,
        ) as sync_claimed,
        pytest.raises(DexcomSyncInProgressError),
    ):
        await sync_dexcom_for_user(db, uuid.uuid4())

    sync_claimed.assert_not_awaited()


async def test_sync_lease_is_acquired_atomically_only_when_due_and_unowned() -> None:
    db = AsyncMock()
    user_id = uuid.uuid4()
    acquired_lease_id = uuid.uuid4()
    result = MagicMock()
    result.scalar_one_or_none.return_value = acquired_lease_id
    db.execute.return_value = result

    with patch("src.services.dexcom_sync.uuid.uuid4", return_value=acquired_lease_id):
        lease_id = await acquire_dexcom_sync_lease(
            db,
            user_id,
            now=NOW,
            only_if_due=True,
        )

    statement = str(db.execute.await_args.args[0])
    assert "sync_lease_expires_at IS NULL" in statement
    assert "sync_lease_expires_at <=" in statement
    assert "next_poll_at <=" in statement
    assert lease_id == acquired_lease_id
    db.commit.assert_awaited_once()


async def test_sync_lease_covers_all_request_budgets_and_processing_overhead(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = AsyncMock()
    user_id = uuid.uuid4()
    result = MagicMock()
    result.scalar_one_or_none.return_value = uuid.uuid4()
    db.execute.return_value = result
    monkeypatch.setattr(settings, "dexcom_request_timeout_seconds", 60)

    await acquire_dexcom_sync_lease(db, user_id, now=NOW)

    statement = db.execute.await_args.args[0]
    params = statement.compile().params
    assert params["sync_lease_expires_at"] == NOW + timedelta(
        seconds=dexcom_sync.dexcom_sync_lease_seconds()
    )
    assert dexcom_sync.dexcom_sync_lease_seconds() > 4 * 60


async def test_sync_lease_is_released_when_share_sync_fails() -> None:
    db = AsyncMock()
    user_id = uuid.uuid4()
    lease_id = uuid.uuid4()
    credential_result = MagicMock()
    credential_result.scalar_one_or_none.return_value = MagicMock(
        status=IntegrationStatus.CONNECTED,
        cgm_role="primary",
    )
    db.execute.return_value = credential_result

    with (
        patch(
            "src.services.dexcom_sync.get_or_create_dexcom_state",
            new_callable=AsyncMock,
        ),
        patch(
            "src.services.dexcom_sync.acquire_dexcom_sync_lease",
            new_callable=AsyncMock,
            return_value=lease_id,
        ),
        patch(
            "src.services.dexcom_sync._sync_dexcom_for_user",
            new_callable=AsyncMock,
            side_effect=DexcomConnectionError("Share unavailable"),
        ),
        patch(
            "src.services.dexcom_sync.release_dexcom_sync_lease",
            new_callable=AsyncMock,
        ) as release,
        pytest.raises(DexcomConnectionError),
    ):
        await sync_dexcom_for_user(db, user_id)

    release.assert_awaited_once_with(db, user_id, lease_id)


async def test_scheduler_defers_claiming_to_the_shared_sync_lease() -> None:
    user_id = uuid.uuid4()
    query_db = AsyncMock()
    user_db = AsyncMock()
    due_result = MagicMock()
    due_result.scalars.return_value.all.return_value = [user_id]
    query_db.execute.return_value = due_result

    query_context = AsyncMock()
    query_context.__aenter__.return_value = query_db
    query_context.__aexit__.return_value = False
    user_context = AsyncMock()
    user_context.__aenter__.return_value = user_db
    user_context.__aexit__.return_value = False
    session_maker = MagicMock(side_effect=[query_context, user_context])

    with (
        patch("src.services.scheduler.get_session_maker", return_value=session_maker),
        patch(
            "src.services.scheduler.sync_dexcom_for_user",
            new_callable=AsyncMock,
            side_effect=DexcomSyncInProgressError("already claimed"),
        ) as sync_user,
    ):
        await scheduler.sync_all_dexcom_users()

    queried_statement = str(query_db.execute.await_args.args[0])
    assert queried_statement.lstrip().startswith("SELECT")
    sync_user.assert_awaited_once_with(user_db, user_id, only_if_due=True)


async def test_scheduler_processes_due_users_with_bounded_concurrency() -> None:
    user_ids = [uuid.uuid4(), uuid.uuid4()]
    query_db = AsyncMock()
    due_result = MagicMock()
    due_result.scalars.return_value.all.return_value = user_ids
    query_db.execute.return_value = due_result

    contexts = []
    for session in [query_db, AsyncMock(), AsyncMock()]:
        context = AsyncMock()
        context.__aenter__.return_value = session
        context.__aexit__.return_value = False
        contexts.append(context)
    session_maker = MagicMock(side_effect=contexts)
    both_started = asyncio.Event()
    started: list[uuid.UUID] = []

    async def sync_user(_db: AsyncMock, user_id: uuid.UUID, **_kwargs: object):
        started.append(user_id)
        if len(started) == len(user_ids):
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=1)
        return {"readings_fetched": 1, "readings_stored": 1}

    with (
        patch("src.services.scheduler.get_session_maker", return_value=session_maker),
        patch(
            "src.services.scheduler.sync_dexcom_for_user",
            new_callable=AsyncMock,
            side_effect=sync_user,
        ),
    ):
        await scheduler.sync_all_dexcom_users()

    assert set(started) == set(user_ids)


async def test_first_scheduled_fetch_completes_backfill_and_learns_phase() -> None:
    db = AsyncMock()
    user_id = uuid.uuid4()
    reading_at = NOW
    reading = SimpleNamespace(
        value=121,
        datetime=reading_at,
        trend=4,
        trend_rate=0.0,
    )
    client = MagicMock()
    client.get_glucose_readings.return_value = [reading]
    credential = SimpleNamespace(
        encrypted_username="encrypted-user",
        encrypted_password="encrypted-password",
        region="US",
        status=IntegrationStatus.CONNECTED,
        cgm_role="primary",
        last_sync_at=None,
        last_error=None,
    )
    credential_result = MagicMock()
    credential_result.scalar_one_or_none.return_value = credential
    db.execute.return_value = credential_result
    state = SimpleNamespace(
        latest_reading_at=None,
        last_attempt_at=None,
        last_success_at=None,
        next_poll_at=NOW,
        poll_phase_at=NOW,
        unchanged_attempts=0,
        consecutive_failures=0,
        initial_backfill_complete=False,
        last_error=None,
    )
    newest = {
        "value": reading.value,
        "timestamp": reading_at,
        "trend": "flat",
    }

    with (
        patch(
            "src.services.dexcom_sync.get_or_create_dexcom_state",
            new_callable=AsyncMock,
            return_value=state,
        ),
        patch(
            "src.services.dexcom_sync.decrypt_credential",
            side_effect=["user@example.com", "password"],
        ),
        patch.dict("src.services.dexcom_sync._dexcom_clients", {user_id: client}),
        patch(
            "src.services.dexcom_sync.store_dexcom_readings",
            new_callable=AsyncMock,
            return_value=(1, newest, newest),
        ),
        patch(
            "src.services.glucose_realtime.publish_glucose_update",
            new_callable=AsyncMock,
        ) as publish,
        patch(
            "src.services.dexcom_sync.evaluate_realtime_alerts",
            new_callable=AsyncMock,
        ),
    ):
        result = await dexcom_sync._sync_dexcom_for_user(db, user_id)

    client.get_glucose_readings.assert_called_once_with(minutes=1440, max_count=288)
    assert result["readings_stored"] == 1
    assert state.initial_backfill_complete is True
    assert state.latest_reading_at == reading_at
    assert state.last_success_at is not None
    assert state.poll_phase_at == next_poll_phase_after_reading(
        reading_at=reading_at,
        received_at=state.last_success_at,
    )
    assert state.next_poll_at == state.poll_phase_at
    assert state.unchanged_attempts == 0
    assert state.consecutive_failures == 0
    assert credential.status == IntegrationStatus.CONNECTED
    assert credential.last_sync_at == state.last_success_at
    publish.assert_awaited_once_with(user_id, reading_at)


async def test_fetch_timeout_uses_full_budget_and_invalidates_cached_client() -> None:
    db = AsyncMock()
    user_id = uuid.uuid4()
    client = MagicMock()
    credential = SimpleNamespace(
        encrypted_username="encrypted-user",
        encrypted_password="encrypted-password",
        region="US",
        status=IntegrationStatus.CONNECTED,
        cgm_role="primary",
        last_sync_at=None,
        last_error=None,
    )
    credential_result = MagicMock()
    credential_result.scalar_one_or_none.return_value = credential
    db.execute.return_value = credential_result
    state = SimpleNamespace(
        latest_reading_at=None,
        last_attempt_at=None,
        last_success_at=None,
        next_poll_at=NOW,
        poll_phase_at=NOW,
        unchanged_attempts=0,
        consecutive_failures=0,
        initial_backfill_complete=False,
        last_error=None,
    )
    observed_timeout = None

    async def raise_timeout(awaitable: object, *, timeout: float) -> None:
        nonlocal observed_timeout
        observed_timeout = timeout
        awaitable.close()  # type: ignore[attr-defined]
        raise TimeoutError

    with (
        patch(
            "src.services.dexcom_sync.get_or_create_dexcom_state",
            new_callable=AsyncMock,
            return_value=state,
        ),
        patch(
            "src.services.dexcom_sync.decrypt_credential",
            side_effect=["user@example.com", "password"],
        ),
        patch.dict(
            "src.services.dexcom_sync._dexcom_clients", {user_id: client}, clear=True
        ),
        patch("src.services.dexcom_sync.asyncio.wait_for", side_effect=raise_timeout),
    ):
        with pytest.raises(dexcom_sync.DexcomSyncError):
            await dexcom_sync._sync_dexcom_for_user(db, user_id)
        assert user_id not in dexcom_sync._dexcom_clients

    assert observed_timeout == dexcom_sync.dexcom_multi_request_timeout_seconds()


async def test_unexpected_fetch_failure_invalidates_cached_client() -> None:
    db = AsyncMock()
    user_id = uuid.uuid4()
    client = MagicMock()
    client.get_glucose_readings.side_effect = RuntimeError("broken session")
    credential = SimpleNamespace(
        encrypted_username="encrypted-user",
        encrypted_password="encrypted-password",
        region="US",
        status=IntegrationStatus.CONNECTED,
        cgm_role="primary",
        last_sync_at=None,
        last_error=None,
    )
    credential_result = MagicMock()
    credential_result.scalar_one_or_none.return_value = credential
    db.execute.return_value = credential_result
    state = SimpleNamespace(
        latest_reading_at=None,
        last_attempt_at=None,
        last_success_at=None,
        next_poll_at=NOW,
        poll_phase_at=NOW,
        unchanged_attempts=0,
        consecutive_failures=0,
        initial_backfill_complete=False,
        last_error=None,
    )

    with (
        patch(
            "src.services.dexcom_sync.get_or_create_dexcom_state",
            new_callable=AsyncMock,
            return_value=state,
        ),
        patch(
            "src.services.dexcom_sync.decrypt_credential",
            side_effect=["user@example.com", "password"],
        ),
        patch.dict(
            "src.services.dexcom_sync._dexcom_clients", {user_id: client}, clear=True
        ),
    ):
        with pytest.raises(dexcom_sync.DexcomSyncError):
            await dexcom_sync._sync_dexcom_for_user(db, user_id)
        assert user_id not in dexcom_sync._dexcom_clients


async def test_invalid_stored_region_is_a_permanent_configuration_error() -> None:
    db = AsyncMock()
    user_id = uuid.uuid4()
    credential = SimpleNamespace(
        encrypted_username="encrypted-user",
        encrypted_password="encrypted-password",
        region="invalid",
        status=IntegrationStatus.CONNECTED,
        cgm_role="primary",
        last_sync_at=None,
        last_error=None,
    )
    credential_result = MagicMock()
    credential_result.scalar_one_or_none.return_value = credential
    db.execute.return_value = credential_result
    state = SimpleNamespace(
        latest_reading_at=None,
        last_attempt_at=None,
        last_success_at=None,
        next_poll_at=NOW,
        poll_phase_at=NOW,
        unchanged_attempts=0,
        consecutive_failures=0,
        initial_backfill_complete=False,
        last_error=None,
    )

    with (
        patch(
            "src.services.dexcom_sync.get_or_create_dexcom_state",
            new_callable=AsyncMock,
            return_value=state,
        ),
        patch(
            "src.services.dexcom_sync.decrypt_credential",
            side_effect=["user@example.com", "password"],
        ),
        patch("src.services.dexcom_sync.Dexcom") as dexcom_client,
        pytest.raises(dexcom_sync.DexcomSyncError, match="Invalid Dexcom region"),
    ):
        await dexcom_sync._sync_dexcom_for_user(db, user_id)

    assert credential.status == IntegrationStatus.ERROR
    assert credential.last_error == "Invalid Dexcom region configured"
    assert state.last_error == "Invalid Dexcom region configured"
    dexcom_client.assert_not_called()


def test_new_reading_uses_fixed_poll_phase() -> None:
    poll_phase = NOW + timedelta(seconds=42)

    next_poll = calculate_next_poll_at(
        now=NOW,
        poll_phase_at=poll_phase,
        unchanged_attempts=0,
    )

    assert next_poll == poll_phase


def test_poll_starts_immediately_when_prediction_is_already_past() -> None:
    next_poll = calculate_next_poll_at(
        now=NOW,
        poll_phase_at=NOW - timedelta(minutes=6),
        unchanged_attempts=0,
    )

    assert next_poll == NOW + timedelta(minutes=4)


def test_unchanged_reading_uses_bounded_probe_bursts() -> None:
    phase = NOW - timedelta(seconds=1)

    fast = calculate_next_poll_at(now=NOW, poll_phase_at=phase, unchanged_attempts=5)
    medium = calculate_next_poll_at(now=NOW, poll_phase_at=phase, unchanged_attempts=10)
    recovery = calculate_next_poll_at(
        now=NOW, poll_phase_at=phase, unchanged_attempts=11
    )

    assert fast == NOW + timedelta(seconds=5)
    assert medium == NOW + timedelta(seconds=20)
    assert recovery == phase + timedelta(minutes=5)


def test_next_reading_poll_uses_sensor_cadence_with_early_probe() -> None:
    reading_at = NOW
    received_at = NOW + timedelta(seconds=50)

    next_phase = next_poll_phase_after_reading(
        reading_at=reading_at,
        received_at=received_at,
    )

    assert next_phase == NOW + timedelta(minutes=4, seconds=45)


def test_late_share_publication_cannot_permanently_shift_future_polls() -> None:
    next_phase = next_poll_phase_after_reading(
        reading_at=NOW,
        received_at=NOW + timedelta(minutes=1),
    )

    assert next_phase == NOW + timedelta(minutes=4, seconds=45)


def test_future_device_clock_cannot_schedule_the_next_probe_late() -> None:
    received_at = NOW

    next_phase = next_poll_phase_after_reading(
        reading_at=NOW + timedelta(minutes=3),
        received_at=received_at,
    )

    assert next_phase == received_at + timedelta(minutes=4, seconds=55)


def test_lagging_device_clock_cannot_exhaust_retries_too_early() -> None:
    received_at = NOW

    next_phase = next_poll_phase_after_reading(
        reading_at=NOW - timedelta(minutes=3),
        received_at=received_at,
    )

    assert next_phase == received_at + timedelta(minutes=3, seconds=45)


def test_late_catch_up_schedules_an_immediate_follow_up() -> None:
    received_at = NOW + timedelta(minutes=5)

    next_phase = next_poll_phase_after_reading(
        reading_at=NOW,
        received_at=received_at,
    )

    assert next_phase == received_at + timedelta(seconds=1)


def test_transport_failures_use_bounded_backoff_then_fixed_phase() -> None:
    phase = NOW - timedelta(seconds=1)

    assert calculate_failure_retry_at(
        now=NOW, poll_phase_at=phase, consecutive_failures=1
    ) == NOW + timedelta(seconds=5)
    assert calculate_failure_retry_at(
        now=NOW, poll_phase_at=phase, consecutive_failures=5
    ) == NOW + timedelta(seconds=60)
    assert calculate_failure_retry_at(
        now=NOW, poll_phase_at=phase, consecutive_failures=6
    ) == phase + timedelta(minutes=5)


def test_share_requests_have_an_explicit_timeout() -> None:
    client = object.__new__(Dexcom)
    client._base_url = "https://share.example.test"
    client._session = MagicMock()
    response = MagicMock()
    response.json.return_value = {"ok": True}
    client._session.post.return_value = response

    assert client._post("/readings") == {"ok": True}
    assert client._session.post.call_args.kwargs["timeout"] == (
        settings.dexcom_request_timeout_seconds
    )


def test_multi_request_operations_receive_a_full_timeout_budget() -> None:
    assert dexcom_sync.dexcom_multi_request_timeout_seconds() == (
        settings.dexcom_request_timeout_seconds * 3
    )


def test_share_rate_limit_uses_conservative_retry_after() -> None:
    client = object.__new__(Dexcom)
    client._base_url = "https://share.example.test"
    client._session = MagicMock()
    response = MagicMock(status_code=429)
    response.headers = {"Retry-After": "600"}
    client._session.post.return_value = response

    with pytest.raises(DexcomRateLimitError) as error:
        client._post("/readings")

    assert error.value.retry_after_seconds == 600


def test_share_rate_limit_defaults_to_five_minutes() -> None:
    client = object.__new__(Dexcom)
    client._base_url = "https://share.example.test"
    client._session = MagicMock()
    response = MagicMock(status_code=429)
    response.headers = {}
    client._session.post.return_value = response

    with pytest.raises(DexcomRateLimitError) as error:
        client._post("/readings")

    assert error.value.retry_after_seconds == 300


@pytest.mark.parametrize(
    "retry_after",
    ["86400000", "Fri, 31 Dec 9999 23:59:59 GMT"],
)
def test_share_rate_limit_caps_pathological_retry_after(retry_after: str) -> None:
    response = MagicMock()
    response.headers = {"Retry-After": retry_after}

    assert dexcom_sync._rate_limit_retry_after_seconds(response) == 30 * 60


def test_sync_state_migration_staggers_connected_users() -> None:
    migration = (
        Path(__file__).parents[1]
        / "migrations"
        / "versions"
        / "081_add_dexcom_sync_states.py"
    ).read_text()

    assert "hashtextextended(user_id::text, 0)" in migration
    assert "* interval '1 second'" in migration


@pytest.mark.parametrize("retry_after", ["nan", "inf", "-inf"])
def test_share_rate_limit_rejects_non_finite_retry_after(retry_after: str) -> None:
    client = object.__new__(Dexcom)
    client._base_url = "https://share.example.test"
    client._session = MagicMock()
    response = MagicMock(status_code=429)
    response.headers = {"Retry-After": retry_after}
    client._session.post.return_value = response

    with pytest.raises(DexcomRateLimitError) as error:
        client._post("/readings")

    assert error.value.retry_after_seconds == 300


async def test_committed_reading_triggers_immediate_alert_evaluation() -> None:
    db = AsyncMock()
    user_id = uuid.uuid4()

    with patch(
        "src.services.predictive_alerts.evaluate_alerts_for_user",
        new_callable=AsyncMock,
    ) as evaluate:
        await evaluate_realtime_alerts(db, user_id)

    evaluate.assert_awaited_once_with(db, user_id)


async def test_alert_failure_does_not_fail_glucose_sync() -> None:
    db = AsyncMock()
    user_id = uuid.uuid4()

    with patch(
        "src.services.predictive_alerts.evaluate_alerts_for_user",
        new_callable=AsyncMock,
        side_effect=RuntimeError("alert engine unavailable"),
    ):
        await evaluate_realtime_alerts(db, user_id)
