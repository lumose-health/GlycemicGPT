"""Read-side dedupe of Nightscout pump events across re-added connections.

Issue #1033: a user who deleted a Nightscout connection and re-added the same
site before the re-add fix (#1029) has every pump event stored twice, once per
``nightscout:<connection_id>`` source. The AI chat pump section, the daily
brief and the insulin summary must count each record once, without hiding
genuinely distinct records or history that only a deleted connection holds.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.database import get_db
from src.main import app
from src.models.glucose import GlucoseReading, TrendDirection
from src.models.nightscout_connection import (
    NightscoutApiVersion,
    NightscoutAuthType,
    NightscoutConnection,
    NightscoutSyncStatus,
)
from src.models.pump_data import PumpEvent, PumpEventType
from src.services.cgm_source import nightscout_source
from src.services.daily_brief import calculate_metrics
from src.services.diabetes_context import (
    build_control_iq_section,
    build_pump_section,
)
from src.services.pump_event_dedupe import nightscout_duplicate_exclusion_clause
from src.services.tandem_sync import get_pump_events


async def _register(client: AsyncClient) -> tuple[str, uuid.UUID]:
    email = f"nsdedupe-{uuid.uuid4().hex[:10]}@example.com"
    reg = await client.post(
        "/api/auth/register", json={"email": email, "password": "SecurePass123"}
    )
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/api/auth/login", json={"email": email, "password": "SecurePass123"}
    )
    cookie = login.cookies.get(settings.jwt_cookie_name)
    me = await client.get("/api/auth/me", cookies={settings.jwt_cookie_name: cookie})
    return cookie, uuid.UUID(me.json()["id"])


async def _add_connection(db: AsyncSession, uid: uuid.UUID, *, is_active: bool) -> str:
    conn = NightscoutConnection(
        user_id=uid,
        name="My NS",
        base_url="https://ns.example.com",
        auth_type=NightscoutAuthType.TOKEN,
        encrypted_credential="enc",
        api_version=NightscoutApiVersion.V1,
        last_sync_status=NightscoutSyncStatus.NEVER,
        is_active=is_active,
    )
    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    return nightscout_source(conn.id)


def _event(
    uid: uuid.UUID,
    source: str,
    ns_id: str | None,
    event_type: PumpEventType,
    ts: datetime,
    units: float | None = None,
    *,
    is_automated: bool = False,
) -> PumpEvent:
    return PumpEvent(
        user_id=uid,
        event_type=event_type,
        event_timestamp=ts,
        units=units,
        is_automated=is_automated,
        received_at=ts,
        source=source,
        ns_id=ns_id,
    )


async def _seed_reimported_history(
    db: AsyncSession, uid: uuid.UUID, now: datetime
) -> tuple[str, str]:
    """Same Nightscout history under a deleted and a re-added connection.

    Returns ``(deleted_source, active_source)``. Rows are inserted with a NULL
    ``dedupe_hash``, like the copies that actually survive re-import (meal-paired
    boluses, suspends, basal injections, rows from before the hash existed);
    hashed copies collide at write time instead.
    """
    deleted = await _add_connection(db, uid, is_active=False)
    active = await _add_connection(db, uid, is_active=True)
    shared = [
        ("ns-b1", PumpEventType.BOLUS, 60, 2.0, False),
        ("ns-b2", PumpEventType.BOLUS, 50, 3.0, False),
        ("ns-c1", PumpEventType.CORRECTION, 40, 0.5, True),
        ("ns-s1", PumpEventType.SUSPEND, 30, None, False),
        ("ns-i1", PumpEventType.BASAL_INJECTION, 20, 20.0, False),
    ]
    for source in (deleted, active):
        for ns_id, etype, mins_ago, units, auto in shared:
            db.add(
                _event(
                    uid,
                    source,
                    ns_id,
                    etype,
                    now - timedelta(minutes=mins_ago),
                    units,
                    is_automated=auto,
                )
            )
    # History only the deleted connection holds must still count.
    db.add(
        _event(
            uid,
            deleted,
            "ns-b3",
            PumpEventType.BOLUS,
            now - timedelta(minutes=70),
            1.0,
        )
    )
    # A non-Nightscout source is unaffected.
    db.add(
        _event(
            uid, "tandem", None, PumpEventType.BOLUS, now - timedelta(minutes=80), 4.0
        )
    )
    # calculate_metrics returns early without glucose readings.
    db.add(
        GlucoseReading(
            user_id=uid,
            value=120,
            reading_timestamp=now - timedelta(minutes=5),
            trend=TrendDirection.FLAT,
            trend_rate=0.0,
            received_at=now,
            source="dexcom",
        )
    )
    await db.commit()
    return deleted, active


async def _kept(db: AsyncSession, uid: uuid.UUID) -> list[PumpEvent]:
    result = await db.execute(
        select(PumpEvent)
        .where(
            PumpEvent.user_id == uid,
            await nightscout_duplicate_exclusion_clause(db, uid),
        )
        .order_by(PumpEvent.event_timestamp)
    )
    return list(result.scalars().all())


@pytest.mark.asyncio
class TestReimportedNightscoutHistory:
    async def test_ai_pump_section_counts_each_record_once(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, uid = await _register(client)
            async for db in get_db():
                await _seed_reimported_history(db, uid, datetime.now(UTC))
                section = await build_pump_section(db, uid)
                break

        assert section is not None
        # ns-b1 + ns-b2 + deleted-only ns-b3 + tandem = 4 boluses, 10.0u.
        assert "- Manual boluses: 4 (10.0u total)" in section
        assert "- Auto-corrections (Control-IQ): 1 (0.5u total)" in section
        assert "- Suspends: 1" in section
        assert section.count("20.0u (") == 1

    async def test_daily_brief_counts_each_record_once(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, uid = await _register(client)
            async for db in get_db():
                now = datetime.now(UTC)
                await _seed_reimported_history(db, uid, now)
                metrics = await calculate_metrics(
                    uid, db, now - timedelta(hours=24), now + timedelta(minutes=1)
                )
                break

        assert metrics.correction_count == 1
        breakdown = metrics.insulin_breakdown
        assert breakdown is not None
        assert breakdown.bolus_count == 4
        assert breakdown.bolus_units == 10.0
        assert breakdown.auto_correction_count == 1
        assert breakdown.auto_correction_units == 0.5
        assert breakdown.basal_injection_count == 1
        assert breakdown.basal_injection_units == 20.0

    async def test_insulin_summary_counts_each_record_once(self):
        # Guard: the summary's (timestamp, units) grouping already folds these
        # copies; the shared filter must not change that.

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie, uid = await _register(client)
            now = datetime.now(UTC)
            async for db in get_db():
                await _seed_reimported_history(db, uid, now)
                break
            resp = await client.get(
                "/api/integrations/insulin/summary",
                params={
                    "start": (now - timedelta(hours=3)).isoformat(),
                    "end": now.isoformat(),
                },
                cookies={settings.jwt_cookie_name: cookie},
            )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["bolus_count"] == 4
        assert data["correction_count"] == 1
        assert data["basal_injection_count"] == 1

    async def test_active_connection_copy_is_kept(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, uid = await _register(client)
            async for db in get_db():
                deleted, active = await _seed_reimported_history(
                    db, uid, datetime.now(UTC)
                )
                kept = await _kept(db, uid)
                break

        by_ns_id = {e.ns_id: e.source for e in kept if e.ns_id}
        assert by_ns_id == {
            "ns-b3": deleted,
            "ns-b1": active,
            "ns-b2": active,
            "ns-c1": active,
            "ns-s1": active,
            "ns-i1": active,
        }
        assert sum(1 for e in kept if e.source == "tandem") == 1


@pytest.mark.asyncio
class TestDistinctRecordsAreKept:
    async def test_distinct_ns_ids_across_sources_all_kept(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, uid = await _register(client)
            async for db in get_db():
                a = await _add_connection(db, uid, is_active=False)
                b = await _add_connection(db, uid, is_active=True)
                ts = datetime.now(UTC) - timedelta(minutes=30)
                db.add(_event(uid, a, "ns-x1", PumpEventType.BOLUS, ts, 1.0))
                db.add(_event(uid, b, "ns-x2", PumpEventType.BOLUS, ts, 1.0))
                await db.commit()
                kept = await _kept(db, uid)
                break

        assert sorted(e.ns_id for e in kept) == ["ns-x1", "ns-x2"]

    async def test_reclassified_record_counts_once_as_active_copy(self):
        """An old import may hold the same record with an older type or time
        (e.g. a long-acting dose stored as BOLUS before #744). The active
        connection's copy wins."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            cookie, uid = await _register(client)
            now = datetime.now(UTC)
            ts = now - timedelta(minutes=30)
            async for db in get_db():
                a = await _add_connection(db, uid, is_active=False)
                b = await _add_connection(db, uid, is_active=True)
                db.add(_event(uid, a, "ns-r", PumpEventType.BOLUS, ts, 20.0))
                db.add(
                    _event(
                        uid,
                        b,
                        "ns-r",
                        PumpEventType.BASAL_INJECTION,
                        ts + timedelta(seconds=1),
                        20.0,
                    )
                )
                await db.commit()
                kept = await _kept(db, uid)
                section = await build_pump_section(db, uid)
                break
            resp = await client.get(
                "/api/integrations/insulin/summary",
                params={
                    "start": (now - timedelta(hours=3)).isoformat(),
                    "end": now.isoformat(),
                },
                cookies={settings.jwt_cookie_name: cookie},
            )

        assert [(e.source, e.event_type) for e in kept] == [
            (b, PumpEventType.BASAL_INJECTION)
        ]
        assert section is not None
        assert "- Manual boluses: 0 (0.0u total)" in section
        assert resp.status_code == 200, resp.text
        data = resp.json()
        # The summary's (timestamp, units) grouping can't fold these copies.
        assert data["bolus_count"] == 0
        assert data["basal_injection_count"] == 1

    async def test_three_copies_keep_exactly_one(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, uid = await _register(client)
            async for db in get_db():
                sources = [
                    await _add_connection(db, uid, is_active=False) for _ in range(3)
                ]
                ts = datetime.now(UTC) - timedelta(minutes=30)
                for source in sources:
                    db.add(_event(uid, source, "ns-3", PumpEventType.SUSPEND, ts))
                await db.commit()
                kept = await _kept(db, uid)
                break

        assert len(kept) == 1

    async def test_null_ns_id_and_non_nightscout_sources_unaffected(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, uid = await _register(client)
            async for db in get_db():
                a = await _add_connection(db, uid, is_active=False)
                b = await _add_connection(db, uid, is_active=True)
                ts = datetime.now(UTC) - timedelta(minutes=30)
                # NULL-ns_id rows fall under the natural-key index, so they
                # can never share a timestamp and type; both must be kept.
                db.add(_event(uid, a, None, PumpEventType.BOLUS, ts, 1.0))
                db.add(
                    _event(
                        uid,
                        b,
                        None,
                        PumpEventType.BOLUS,
                        ts + timedelta(seconds=1),
                        1.0,
                    )
                )
                # Same ns_id as a Nightscout row, but a non-Nightscout source.
                # (source, ns_id) is unique globally, so make it per-run.
                shared_id = f"ns-m-{uuid.uuid4().hex}"
                db.add(_event(uid, b, shared_id, PumpEventType.SUSPEND, ts))
                db.add(_event(uid, "mobile", shared_id, PumpEventType.SUSPEND, ts))
                await db.commit()
                kept = await _kept(db, uid)
                break

        assert len(kept) == 4

    async def test_both_connections_deleted_keeps_one_copy(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, uid = await _register(client)
            async for db in get_db():
                a = await _add_connection(db, uid, is_active=False)
                b = await _add_connection(db, uid, is_active=False)
                ts = datetime.now(UTC) - timedelta(minutes=30)
                for source in (a, b):
                    db.add(_event(uid, source, "ns-d1", PumpEventType.SUSPEND, ts))
                    db.add(
                        _event(
                            uid,
                            source,
                            "ns-d2",
                            PumpEventType.SUSPEND,
                            ts + timedelta(minutes=1),
                        )
                    )
                await db.commit()
                kept = await _kept(db, uid)
                break

        assert sorted(e.ns_id for e in kept) == ["ns-d1", "ns-d2"]
        # The tie-break keeps a whole history from one connection.
        assert len({e.source for e in kept}) == 1

    async def test_other_users_rows_never_shadow(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, uid = await _register(client)
            _, other = await _register(client)
            async for db in get_db():
                mine = await _add_connection(db, uid, is_active=False)
                theirs = await _add_connection(db, other, is_active=True)
                ts = datetime.now(UTC) - timedelta(minutes=30)
                db.add(_event(uid, mine, "ns-u", PumpEventType.SUSPEND, ts))
                db.add(_event(other, theirs, "ns-u", PumpEventType.SUSPEND, ts))
                await db.commit()
                kept = await _kept(db, uid)
                break

        assert [e.source for e in kept] == [mine]


@pytest.mark.asyncio
class TestOtherReaders:
    async def test_control_iq_section_counts_each_record_once(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, uid = await _register(client)
            async for db in get_db():
                await _seed_reimported_history(db, uid, datetime.now(UTC))
                section = await build_control_iq_section(db, uid)
                break

        assert section is not None
        # 6 records (ns-b1/b2/b3, ns-c1, ns-s1, ns-i1) + tandem = 7.
        assert "- Total events: 7 (" in section
        assert "- Auto-corrections: 1 (0.5u total)" in section
        assert "- Suspends: 1 (" in section

    async def test_get_pump_events_flag_off_returns_both_copies(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, uid = await _register(client)
            async for db in get_db():
                await _seed_reimported_history(db, uid, datetime.now(UTC))
                raw = await get_pump_events(db, uid, hours=6, limit=500)
                deduped = await get_pump_events(
                    db, uid, hours=6, limit=500, exclude_nightscout_duplicates=True
                )
                break

        assert len(raw) == 12
        assert len(deduped) == 7

    async def test_two_active_connections_keep_one_copy(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, uid = await _register(client)
            async for db in get_db():
                a = await _add_connection(db, uid, is_active=True)
                b = await _add_connection(db, uid, is_active=True)
                ts = datetime.now(UTC) - timedelta(minutes=30)
                for source in (a, b):
                    db.add(_event(uid, source, "ns-aa", PumpEventType.SUSPEND, ts))
                await db.commit()
                kept = await _kept(db, uid)
                break

        # Which copy wins follows the DB collation; exactly one must remain.
        assert len(kept) == 1
        assert kept[0].source in {a, b}

    async def test_row_without_connection_row_is_kept(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            _, uid = await _register(client)
            async for db in get_db():
                active = await _add_connection(db, uid, is_active=True)
                orphan = nightscout_source(uuid.uuid4())
                ts = datetime.now(UTC) - timedelta(minutes=30)
                for source in (active, orphan):
                    db.add(_event(uid, source, "ns-o", PumpEventType.SUSPEND, ts))
                await db.commit()
                kept = await _kept(db, uid)
                break

        assert sorted(e.source for e in kept) == sorted([active, orphan])
