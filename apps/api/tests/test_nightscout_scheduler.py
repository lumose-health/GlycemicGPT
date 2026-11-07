"""Tests for the background Nightscout sync scheduler.

Mocks `sync_nightscout_for_connection` at the module boundary so we
exercise the real discovery query + per-row isolation logic without
hitting an actual Nightscout instance. Live end-to-end coverage --
"the scheduler tick triggers a real fetch + translate" -- is left to
manual verification against the dev synthetic uploader (see
`dev/ns_synthetic_uploader.py`); the unit-tested seam here is the
"who's due, what happens when one fails" decision tree.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.encryption import encrypt_credential
from src.database import get_session_maker
from src.models.nightscout_connection import (
    NightscoutAuthType,
    NightscoutConnection,
    NightscoutSyncStatus,
)
from src.models.user import User
from src.services.integrations.nightscout.scheduler import (
    _INCOMPLETE_SYNC_BACKOFF_MINUTES,
    _TICK_BUDGET_ERROR,
    _clamped_interval,
    _is_due,
    _record_tick_budget_failures,
    run_nightscout_sync_all_users,
)
from src.services.integrations.nightscout.sync import (
    PAGING_INCOMPLETE_ERROR_PREFIX,
    SyncResult,
)

# ---------------------------------------------------------------------------
# _is_due: the discovery predicate
# ---------------------------------------------------------------------------


class TestIsDue:
    def test_never_synced_is_always_due(self):
        now = datetime(2026, 5, 10, 12, 0, tzinfo=UTC)
        assert _is_due(None, 5, now=now) is True

    def test_within_window_not_due(self):
        now = datetime(2026, 5, 10, 12, 0, tzinfo=UTC)
        last = now - timedelta(minutes=3)
        assert _is_due(last, 5, now=now) is False

    def test_at_exact_window_is_due(self):
        now = datetime(2026, 5, 10, 12, 0, tzinfo=UTC)
        last = now - timedelta(minutes=5)
        assert _is_due(last, 5, now=now) is True

    def test_well_past_window_is_due(self):
        now = datetime(2026, 5, 10, 12, 0, tzinfo=UTC)
        last = now - timedelta(hours=3)
        assert _is_due(last, 5, now=now) is True

    def test_naive_timestamp_is_treated_as_utc(self):
        """Defensive: column is timezone=True so we shouldn't see this,
        but if a naive datetime sneaks in we don't want a TypeError."""
        now = datetime(2026, 5, 10, 12, 0, tzinfo=UTC)
        last = datetime(2026, 5, 10, 11, 0)  # naive
        assert _is_due(last, 5, now=now) is True

    def test_budget_failure_backs_off_even_when_never_synced(self):
        now = datetime(2026, 5, 10, 12, 0, tzinfo=UTC)
        attempted = now - timedelta(minutes=_INCOMPLETE_SYNC_BACKOFF_MINUTES - 1)
        assert (
            _is_due(
                None,
                1,
                now=now,
                last_sync_status=NightscoutSyncStatus.ERROR,
                last_sync_error=_TICK_BUDGET_ERROR,
                last_attempt_at=attempted,
            )
            is False
        )

    def test_budget_failure_retries_after_backoff(self):
        now = datetime(2026, 5, 10, 12, 0, tzinfo=UTC)
        attempted = now - timedelta(minutes=_INCOMPLETE_SYNC_BACKOFF_MINUTES)
        assert (
            _is_due(
                None,
                1,
                now=now,
                last_sync_status=NightscoutSyncStatus.ERROR,
                last_sync_error=_TICK_BUDGET_ERROR,
                last_attempt_at=attempted,
            )
            is True
        )

    def test_paging_failure_uses_same_extended_backoff(self):
        now = datetime(2026, 5, 10, 12, 0, tzinfo=UTC)
        attempted = now - timedelta(minutes=5)
        assert (
            _is_due(
                now - timedelta(days=1),
                1,
                now=now,
                last_sync_status=NightscoutSyncStatus.ERROR,
                last_sync_error=f"{PAGING_INCOMPLETE_ERROR_PREFIX}: entries",
                last_attempt_at=attempted,
            )
            is False
        )


class TestClampedInterval:
    def test_in_range_passes_through(self):
        assert _clamped_interval(60) == 60

    def test_below_min_clamps(self):
        # SYNC_INTERVAL_MIN_MINUTES = 1
        assert _clamped_interval(0) == 1
        assert _clamped_interval(-5) == 1

    def test_above_max_clamps(self):
        # SYNC_INTERVAL_MAX_MINUTES = 1440 (24h)
        assert _clamped_interval(10000) == 1440


# ---------------------------------------------------------------------------
# Discovery + per-row isolation
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def scheduler_ctx() -> AsyncGenerator[tuple[AsyncSession, uuid.UUID], None]:
    """Provide a session + a user that owns several test connections.

    Cleanup uses a *fresh* session from the session_maker rather than
    reusing the test's session: a poisoned session from a cross-loop
    teardown would silently swallow the DELETEs otherwise, leaving
    @example.com user rows + their connections accumulating in the
    dev DB. Each leaked row then shows up in the scheduler's
    discovery query on every tick, dilating wall-clock tick duration.
    Cleanup failures here surface loudly via re-raise so future
    leaks are caught at the source instead of masquerading as a
    slow scheduler.
    """
    session_maker = get_session_maker()
    session = session_maker()
    email = f"sched_{uuid.uuid4().hex[:10]}@example.com"
    user = User(email=email, hashed_password="not-a-real-hash")
    session.add(user)
    await session.flush()
    user_id = user.id
    await session.commit()

    try:
        yield session, user_id
    finally:
        # Close the test's session first. A close-failure here is
        # benign (it usually means the test's loop already shut down)
        # so we swallow it. The DELETE/COMMIT path below uses a fresh
        # session and is NOT swallowed -- a real cleanup failure must
        # surface so future leaks don't silently accumulate.
        try:
            await session.close()
        except Exception:
            pass

        async with session_maker() as cleanup:
            await cleanup.execute(
                delete(NightscoutConnection).where(
                    NightscoutConnection.user_id == user_id
                )
            )
            await cleanup.execute(delete(User).where(User.id == user_id))
            await cleanup.commit()


def _mk_connection(
    user_id: uuid.UUID,
    *,
    name: str,
    interval_minutes: int = 5,
    last_synced_at: datetime | None = None,
    last_sync_status: NightscoutSyncStatus = NightscoutSyncStatus.NEVER,
    is_active: bool = True,
) -> NightscoutConnection:
    return NightscoutConnection(
        user_id=user_id,
        name=name,
        base_url="https://example.com",
        auth_type=NightscoutAuthType.SECRET,
        encrypted_credential=encrypt_credential("test-secret-min-12-chars"),
        sync_interval_minutes=interval_minutes,
        is_active=is_active,
        last_synced_at=last_synced_at,
        last_sync_status=last_sync_status,
    )


def _ok_result(connection_id: uuid.UUID) -> SyncResult:
    return SyncResult(
        connection_id=str(connection_id),
        status=NightscoutSyncStatus.OK,
        entries_inserted=1,
        entries_skipped=0,
        entries_failed=0,
        treatments_inserted_pump=0,
        treatments_inserted_glucose=0,
        treatments_failed=0,
        devicestatuses_inserted=0,
        devicestatuses_failed=0,
        profile_synced=False,
        duration_ms=42,
        error=None,
    )


class TestRunNightscoutSyncAllUsers:
    @pytest.mark.asyncio
    async def test_only_due_connections_get_synced(self, scheduler_ctx):
        """Connections whose interval hasn't elapsed are skipped.

        Filters synced IDs to this test's user so leftover rows from
        prior interrupted runs don't pollute the assertion.
        """
        session, user_id = scheduler_ctx
        now = datetime.now(UTC)
        # Due (never synced)
        a = _mk_connection(user_id, name="due-a", interval_minutes=5)
        # Due (last synced 10m ago, interval=5)
        b = _mk_connection(
            user_id,
            name="due-b",
            interval_minutes=5,
            last_synced_at=now - timedelta(minutes=10),
            last_sync_status=NightscoutSyncStatus.OK,
        )
        # Not due (last synced 1m ago, interval=60)
        c = _mk_connection(
            user_id,
            name="not-due",
            interval_minutes=60,
            last_synced_at=now - timedelta(minutes=1),
            last_sync_status=NightscoutSyncStatus.OK,
        )
        session.add_all([a, b, c])
        await session.commit()
        a_id, b_id, c_id = a.id, b.id, c.id

        synced_for_test_user: set[uuid.UUID] = set()

        async def fake_sync(_session, conn):
            if conn.user_id == user_id:
                synced_for_test_user.add(conn.id)
            return _ok_result(conn.id)

        with patch(
            "src.services.integrations.nightscout.scheduler.sync_nightscout_for_connection",
            side_effect=fake_sync,
        ):
            await run_nightscout_sync_all_users()

        assert synced_for_test_user == {a_id, b_id}
        assert c_id not in synced_for_test_user

    @pytest.mark.asyncio
    async def test_inactive_connections_excluded(self, scheduler_ctx):
        """Soft-deleted (is_active=false) rows are ignored."""
        session, user_id = scheduler_ctx
        active = _mk_connection(user_id, name="active")
        inactive = _mk_connection(user_id, name="inactive", is_active=False)
        session.add_all([active, inactive])
        await session.commit()
        active_id = active.id

        synced_for_test_user: list[uuid.UUID] = []

        async def fake_sync(_session, conn):
            if conn.user_id == user_id:
                synced_for_test_user.append(conn.id)
            return _ok_result(conn.id)

        with patch(
            "src.services.integrations.nightscout.scheduler.sync_nightscout_for_connection",
            side_effect=fake_sync,
        ):
            await run_nightscout_sync_all_users()

        assert synced_for_test_user == [active_id]

    @pytest.mark.asyncio
    async def test_auth_failed_connection_excluded(self, scheduler_ctx):
        """AUTH_FAILED is sticky -- requires user re-auth, no auto retry."""
        session, user_id = scheduler_ctx
        ok = _mk_connection(user_id, name="ok-conn")
        broken = _mk_connection(
            user_id,
            name="auth-failed-conn",
            last_sync_status=NightscoutSyncStatus.AUTH_FAILED,
        )
        session.add_all([ok, broken])
        await session.commit()
        ok_id = ok.id

        synced_for_test_user: list[uuid.UUID] = []

        async def fake_sync(_session, conn):
            if conn.user_id == user_id:
                synced_for_test_user.append(conn.id)
            return _ok_result(conn.id)

        with patch(
            "src.services.integrations.nightscout.scheduler.sync_nightscout_for_connection",
            side_effect=fake_sync,
        ):
            await run_nightscout_sync_all_users()

        assert synced_for_test_user == [ok_id]

    @pytest.mark.asyncio
    async def test_paused_statuses_set_is_minimal(self):
        """Pinned set for the discovery filter.

        UNREACHABLE is intentionally NOT in `_PAUSED_STATUSES` yet --
        the model defines it for a future "consecutive-failure circuit
        breaker" that no code path currently writes. Adding it to the
        exclusion now would advertise a circuit breaker that doesn't
        exist. When the breaker is wired in its own PR, expand this
        test alongside the new code.
        """
        from src.services.integrations.nightscout.scheduler import (
            _PAUSED_STATUSES,
        )

        assert frozenset({NightscoutSyncStatus.AUTH_FAILED}) == _PAUSED_STATUSES

    @pytest.mark.asyncio
    async def test_one_connection_failing_does_not_block_others(self, scheduler_ctx):
        """Per-connection isolation: a raise on one row doesn't kill the tick."""
        session, user_id = scheduler_ctx
        a = _mk_connection(user_id, name="a")
        b = _mk_connection(user_id, name="b")
        c = _mk_connection(user_id, name="c")
        session.add_all([a, b, c])
        await session.commit()
        a_id, b_id, c_id = a.id, b.id, c.id

        synced_ok_for_test_user: set[uuid.UUID] = set()

        async def fake_sync(_session, conn):
            if conn.id == b_id:
                raise RuntimeError("simulated upstream blowup on conn-b")
            if conn.user_id == user_id:
                synced_ok_for_test_user.add(conn.id)
            return _ok_result(conn.id)

        with patch(
            "src.services.integrations.nightscout.scheduler.sync_nightscout_for_connection",
            side_effect=fake_sync,
        ):
            # Should NOT raise.
            await run_nightscout_sync_all_users()

        assert synced_ok_for_test_user == {a_id, c_id}

    @pytest.mark.asyncio
    async def test_tick_budget_marks_started_but_not_queued_syncs(
        self, scheduler_ctx, monkeypatch
    ):
        """Slow upstream cannot extend a tick past the wall budget.

        APScheduler is configured `coalesce=True, max_instances=1`,
        so a tick that runs longer than its base interval delays
        every subsequent tick by the overrun. The budget cap
        prevents a slow upstream from silently dilating the
        scheduler.
        """
        import asyncio as _asyncio

        from src.services.integrations.nightscout import scheduler as sched_mod

        # 5s budget gives discovery + `_sync_one`'s refetch wide
        # headroom on slow CI before fake_sync's sleep traps. The 6x
        # gap to the 30s sleep ensures the budget fires comfortably
        # mid-sleep.
        monkeypatch.setattr(sched_mod, "_TICK_WALL_BUDGET_SECONDS", 5.0)
        monkeypatch.setattr(sched_mod, "_MAX_PARALLEL_SYNCS", 1)

        session, user_id = scheduler_ctx
        discovery_marker = datetime(2001, 2, 3, 4, 5, 6, 789012, tzinfo=UTC)
        # Select only this test's two rows without mutating unrelated persisted
        # connections. Full-suite runs can leave many otherwise-due fixtures in
        # the shared database, which would consume the one-slot budget first.
        monkeypatch.setattr(
            sched_mod,
            "_is_due",
            lambda last_synced_at, _interval, **_kwargs: (
                last_synced_at == discovery_marker
            ),
        )
        slow = _mk_connection(
            user_id, name="slow-conn", last_synced_at=discovery_marker
        )
        queued = _mk_connection(
            user_id, name="queued-conn", last_synced_at=discovery_marker
        )
        session.add_all([slow, queued])
        await session.commit()
        test_ids = {slow.id, queued.id}

        entered_fake_sync = _asyncio.Event()
        cancelled_for_test_user: list[uuid.UUID] = []
        completed_for_test_user: list[uuid.UUID] = []

        async def fake_sync(_session, conn):
            if conn.user_id != user_id:
                return _ok_result(conn.id)
            if entered_fake_sync.is_set():
                completed_for_test_user.append(conn.id)
                return _ok_result(conn.id)
            entered_fake_sync.set()
            try:
                await _asyncio.sleep(30.0)  # well past the budget
                completed_for_test_user.append(conn.id)
                return _ok_result(conn.id)
            except _asyncio.CancelledError:
                cancelled_for_test_user.append(conn.id)
                raise

        with patch(
            "src.services.integrations.nightscout.scheduler.sync_nightscout_for_connection",
            side_effect=fake_sync,
        ):
            # Must NOT raise -- budget exceedance is logged + swallowed.
            await run_nightscout_sync_all_users()

        # If fake_sync was reached at all, the slow path must have been
        # cancelled (never completed).
        assert entered_fake_sync.is_set(), (
            "fake_sync was never entered; widen the budget so the test exercises cancellation"
        )
        assert len(cancelled_for_test_user) == 1
        assert not completed_for_test_user
        cancelled_id = cancelled_for_test_user[0]
        queued_id = (test_ids - {cancelled_id}).pop()
        await session.refresh(slow)
        await session.refresh(queued)
        rows = {slow.id: slow, queued.id: queued}
        assert rows[cancelled_id].last_sync_status == NightscoutSyncStatus.ERROR
        assert rows[cancelled_id].last_sync_error == _TICK_BUDGET_ERROR
        assert rows[queued_id].last_sync_status == NightscoutSyncStatus.NEVER
        assert rows[queued_id].last_sync_error is None
        # ``scheduler_ctx`` tears down on the session-scoped fixture loop, while
        # this refresh opened a NullPool connection on the test loop. End the
        # read transaction here so asyncpg closes it on its owning loop.
        await session.rollback()

    @pytest.mark.asyncio
    async def test_repeated_budget_failures_refresh_attempt_timestamp(
        self, scheduler_ctx
    ):
        import asyncio as _asyncio

        session, user_id = scheduler_ctx
        conn = _mk_connection(user_id, name="repeated-budget")
        session.add(conn)
        await session.commit()
        session_maker = get_session_maker()

        await _record_tick_budget_failures(session_maker, [conn.id])
        await session.refresh(conn)
        first_attempt = conn.updated_at
        await _asyncio.sleep(0.002)
        await _record_tick_budget_failures(session_maker, [conn.id])
        await session.refresh(conn)

        assert conn.last_sync_status == NightscoutSyncStatus.ERROR
        assert conn.last_sync_error == _TICK_BUDGET_ERROR
        assert conn.updated_at > first_attempt
        await session.rollback()

    @pytest.mark.asyncio
    async def test_no_connections_for_test_user_means_no_call(self, scheduler_ctx):
        """Sanity: scheduler does not invoke sync for THIS test's user
        when that user has zero connections.

        We can't assert the global mock was never called -- the dev DB
        may have leftover rows from prior interrupted test runs and the
        scheduler scans all users. Scope the assertion to "no call
        referenced one of OUR connections" to stay isolation-clean.
        """
        _session, user_id = scheduler_ctx

        synced_for_test_user: list[uuid.UUID] = []

        async def fake_sync(_session, conn):
            if conn.user_id == user_id:
                synced_for_test_user.append(conn.id)
            return _ok_result(conn.id)

        with patch(
            "src.services.integrations.nightscout.scheduler.sync_nightscout_for_connection",
            side_effect=fake_sync,
        ):
            await run_nightscout_sync_all_users()

        assert synced_for_test_user == []
