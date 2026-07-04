"""GLY-137: Tests for the caregiver "lost contact" / data-gap alert detector.

These are real-DB tests (the detector is query-shaped: funnel ordering,
episode dedup, and lifecycle transitions all live in SQL). Each test creates
its own users and cleans up after itself because the detector commits.
"""

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from src.core.auth import get_current_user
from src.main import app
from src.models import glooko_sync_state
from src.models.alert import Alert, AlertSeverity, AlertType
from src.models.caregiver_link import CaregiverLink
from src.models.device_registration import DeviceRegistration
from src.models.glooko_sync_state import GlookoSyncState
from src.models.glucose import GlucoseReading, TrendDirection
from src.models.medtronic_connect_state import MedtronicConnectState
from src.models.nightscout_connection import (
    NightscoutApiVersion,
    NightscoutAuthType,
    NightscoutConnection,
    NightscoutSyncStatus,
)
from src.models.user import User, UserRole
from src.routers.alert_api import AlertResponse, alert_to_dict
from src.services import data_gap_alerts
from src.services.data_gap_alerts import (
    ARMING_BASELINE_HOURS,
    NO_DATA_ALERT_SOURCE,
    NO_DATA_THRESHOLD_MINUTES,
    DataGapAction,
    evaluate_data_gap_for_user,
    format_gap_message,
    no_data_alert_ttl_minutes,
    resolve_no_data_threshold_minutes,
)
from src.services.escalation_engine import get_unacknowledged_critical_alerts

# ── Fixture helpers ──


async def _make_user(db, role: UserRole) -> User:
    user = User(
        email=f"gly137-{uuid.uuid4().hex}@integration.test",
        hashed_password="x" * 60,  # noqa: S106 -- not a real hash, test-only
        role=role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _make_monitored_patient(
    db, can_receive_alerts: bool = True
) -> tuple[User, User]:
    patient = await _make_user(db, UserRole.DIABETIC)
    caregiver = await _make_user(db, UserRole.CAREGIVER)
    db.add(
        CaregiverLink(
            caregiver_id=caregiver.id,
            patient_id=patient.id,
            can_receive_alerts=can_receive_alerts,
        )
    )
    await db.commit()
    return patient, caregiver


async def _add_reading(
    db,
    user_id: uuid.UUID,
    received_minutes_ago: float,
    value: int = 112,
    source: str = "dexcom",
    reading_timestamp: datetime | None = None,
) -> GlucoseReading:
    received_at = datetime.now(UTC) - timedelta(minutes=received_minutes_ago)
    reading = GlucoseReading(
        user_id=user_id,
        value=value,
        reading_timestamp=reading_timestamp or received_at,
        trend=TrendDirection.FLAT,
        trend_rate=0.0,
        received_at=received_at,
        source=source,
    )
    db.add(reading)
    await db.commit()
    return reading


async def _add_pull_source_state(
    db,
    user_id: uuid.UUID,
    source: str,
    status: str = glooko_sync_state.STATUS_CONNECTED,
    sync_interval_minutes: int = 30,
) -> None:
    """Attach a Glooko / Medtronic Connect sync-state row (default: healthy
    30-min pull), so the per-source threshold widening has something real to
    key off."""
    if source == "glooko":
        db.add(
            GlookoSyncState(
                user_id=user_id,
                encrypted_email="enc-email",
                encrypted_password="enc-password",  # noqa: S106 -- test-only ciphertext stand-in
                status=status,
                sync_interval_minutes=sync_interval_minutes,
            )
        )
    elif source == "medtronic":
        db.add(
            MedtronicConnectState(
                user_id=user_id,
                encrypted_username="enc-user",
                encrypted_refresh_token="enc-token",  # noqa: S106 -- test-only ciphertext stand-in
                status=status,
                sync_interval_minutes=sync_interval_minutes,
            )
        )
    else:
        raise ValueError(f"unknown pull source {source}")
    await db.commit()


async def _no_data_alerts(db, user_id: uuid.UUID) -> list[Alert]:
    result = await db.execute(
        select(Alert)
        .where(Alert.user_id == user_id, Alert.alert_type == AlertType.NO_DATA)
        .order_by(Alert.created_at)
    )
    return list(result.scalars().all())


async def _cleanup(db, *user_ids: uuid.UUID) -> None:
    await db.rollback()
    for table, col in (
        (Alert, Alert.user_id),
        (GlucoseReading, GlucoseReading.user_id),
        (DeviceRegistration, DeviceRegistration.user_id),
        (GlookoSyncState, GlookoSyncState.user_id),
        (MedtronicConnectState, MedtronicConnectState.user_id),
        (NightscoutConnection, NightscoutConnection.user_id),
    ):
        await db.execute(delete(table).where(col.in_(user_ids)))
    await db.execute(
        delete(CaregiverLink).where(
            CaregiverLink.patient_id.in_(user_ids)
            | CaregiverLink.caregiver_id.in_(user_ids)
        )
    )
    await db.execute(delete(User).where(User.id.in_(user_ids)))
    await db.commit()


# ── Discriminating false-alarm guard ──


@pytest.mark.asyncio
class TestNoFalseAlarms:
    async def test_fresh_readings_with_stale_device_heartbeat_no_alert(
        self, db_session
    ):
        """Fresh data arrival + a 60-min-stale DeviceRegistration => NO alert.

        The stale-device fixture is what makes this test discriminate: an
        implementation keyed off phone liveness (last_seen_at) instead of
        data-arrival age would fire here and fail.
        """
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            await _add_reading(db_session, patient.id, received_minutes_ago=5)
            db_session.add(
                DeviceRegistration(
                    user_id=patient.id,
                    device_token=f"tok-{uuid.uuid4().hex}",
                    device_name="stale phone",
                    last_seen_at=datetime.now(UTC) - timedelta(minutes=90),
                )
            )
            await db_session.commit()

            action = await evaluate_data_gap_for_user(db_session, patient.id)

            assert action == DataGapAction.NONE
            assert await _no_data_alerts(db_session, patient.id) == []
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_never_had_data_not_armed(self, db_session):
        """A monitored patient with zero readings (e.g. pump-only Tandem or
        just-onboarded) never arms and never fires."""
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            action = await evaluate_data_gap_for_user(db_session, patient.id)

            assert action == DataGapAction.NONE
            assert await _no_data_alerts(db_session, patient.id) == []
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_gap_older_than_baseline_without_episode_not_armed(self, db_session):
        """A >24h-old last reading with no open episode does not fire; the
        baseline window bounds retroactive alarms on stale accounts."""
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            await _add_reading(
                db_session,
                patient.id,
                received_minutes_ago=ARMING_BASELINE_HOURS * 60 + 60,
            )

            action = await evaluate_data_gap_for_user(db_session, patient.id)

            assert action == DataGapAction.NONE
            assert await _no_data_alerts(db_session, patient.id) == []
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)


# ── Lifecycle ──


@pytest.mark.asyncio
class TestLifecycle:
    async def test_gap_fires_exactly_one_warning_alert(self, db_session):
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            await _add_reading(
                db_session, patient.id, received_minutes_ago=35, value=112
            )

            action = await evaluate_data_gap_for_user(db_session, patient.id)

            assert action == DataGapAction.CREATED
            alerts = await _no_data_alerts(db_session, patient.id)
            assert len(alerts) == 1
            alert = alerts[0]
            assert alert.severity == AlertSeverity.WARNING
            assert alert.acknowledged is False
            assert alert.source == NO_DATA_ALERT_SOURCE
            # current_value carries the LAST-KNOWN reading, never 0/fake.
            assert alert.current_value == 112.0
            assert "No CGM data for 35m" in alert.message
            assert "last:" in alert.message
            # Short TTL: held open by renewal, not a long hardcoded expiry.
            ttl = timedelta(minutes=no_data_alert_ttl_minutes())
            assert alert.expires_at <= datetime.now(UTC) + ttl
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_sustained_gap_renews_single_row(self, db_session):
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            await _add_reading(db_session, patient.id, received_minutes_ago=35)
            assert (
                await evaluate_data_gap_for_user(db_session, patient.id)
                == DataGapAction.CREATED
            )
            (alert,) = await _no_data_alerts(db_session, patient.id)
            first_expiry = alert.expires_at

            action = await evaluate_data_gap_for_user(db_session, patient.id)

            assert action == DataGapAction.RENEWED
            alerts = await _no_data_alerts(db_session, patient.id)
            assert len(alerts) == 1  # still exactly one row for the episode
            assert alerts[0].expires_at >= first_expiry
            assert alerts[0].acknowledged is False
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_manual_ack_during_gap_does_not_refire(self, db_session):
        """The HIGH-fix: a caregiver acking a persistent "no data" alert while
        the gap is STILL ongoing must not spawn a new alert every tick --
        onset is gated on data-having-flowed, not on open-ness."""
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            await _add_reading(db_session, patient.id, received_minutes_ago=35)
            await evaluate_data_gap_for_user(db_session, patient.id)
            (alert,) = await _no_data_alerts(db_session, patient.id)

            # Caregiver manually acknowledges mid-gap.
            alert.acknowledged = True
            alert.acknowledged_at = datetime.now(UTC)
            await db_session.commit()

            action = await evaluate_data_gap_for_user(db_session, patient.id)

            assert action == DataGapAction.NONE
            assert len(await _no_data_alerts(db_session, patient.id)) == 1
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_resume_auto_resolves_and_drops_from_pending(self, db_session):
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            await _add_reading(db_session, patient.id, received_minutes_ago=35)
            await evaluate_data_gap_for_user(db_session, patient.id)

            # Caregiver /pending sees the alert while the gap is open.
            app.dependency_overrides[get_current_user] = lambda: caregiver
            try:
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as client:
                    pending = await client.get("/api/v1/alerts/pending")
                    assert pending.status_code == 200
                    types = [a["alert_type"] for a in pending.json()]
                    assert "no_data" in types

                    # Data resumes.
                    await _add_reading(db_session, patient.id, received_minutes_ago=1)
                    action = await evaluate_data_gap_for_user(db_session, patient.id)
                    assert action == DataGapAction.RESOLVED

                    (alert,) = await _no_data_alerts(db_session, patient.id)
                    assert alert.acknowledged is True
                    assert alert.acknowledged_at is not None

                    pending = await client.get("/api/v1/alerts/pending")
                    types = [a["alert_type"] for a in pending.json()]
                    assert "no_data" not in types
            finally:
                app.dependency_overrides.pop(get_current_user, None)
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_resume_then_regap_fires_fresh_episode(self, db_session):
        """Data flowing after a resolved episode re-arms onset."""
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            now = datetime.now(UTC)
            # A previous episode, already resolved 90 minutes ago.
            db_session.add(
                Alert(
                    user_id=patient.id,
                    alert_type=AlertType.NO_DATA,
                    severity=AlertSeverity.WARNING,
                    current_value=110.0,
                    message="No CGM data for 31m (last: 110 mg/dL at 00:00 UTC)",
                    source=NO_DATA_ALERT_SOURCE,
                    acknowledged=True,
                    acknowledged_at=now - timedelta(minutes=60),
                    created_at=now - timedelta(minutes=90),
                    expires_at=now - timedelta(minutes=80),
                )
            )
            await db_session.commit()
            # Data flowed AFTER that episode... then stopped again 40 min ago.
            await _add_reading(db_session, patient.id, received_minutes_ago=40)

            action = await evaluate_data_gap_for_user(db_session, patient.id)

            assert action == DataGapAction.CREATED
            alerts = await _no_data_alerts(db_session, patient.id)
            assert len(alerts) == 2
            assert alerts[-1].acknowledged is False
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_blackout_past_baseline_stays_armed_via_open_episode(
        self, db_session
    ):
        """A >24h blackout with an open episode alert keeps renewing -- the
        patient must not silently de-arm mid-emergency."""
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            now = datetime.now(UTC)
            await _add_reading(
                db_session,
                patient.id,
                received_minutes_ago=ARMING_BASELINE_HOURS * 60 + 60,
            )
            db_session.add(
                Alert(
                    user_id=patient.id,
                    alert_type=AlertType.NO_DATA,
                    severity=AlertSeverity.WARNING,
                    current_value=110.0,
                    message="No CGM data for 24h 30m (last: 110 mg/dL at 00:00 UTC)",
                    source=NO_DATA_ALERT_SOURCE,
                    created_at=now - timedelta(hours=24, minutes=30),
                    expires_at=now + timedelta(minutes=5),
                )
            )
            await db_session.commit()

            action = await evaluate_data_gap_for_user(db_session, patient.id)

            assert action == DataGapAction.RENEWED
            (alert,) = await _no_data_alerts(db_session, patient.id)
            assert alert.acknowledged is False
            assert alert.expires_at > now
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_warmup_gap_fires_once_holds_and_resolves(self, db_session):
        """Pins the v1 D6 decision: a ~2h sensor-warmup gap IS surfaced (the
        caregiver genuinely has no data), held open as a single WARNING, and
        auto-resolves when session data resumes."""
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            await _add_reading(db_session, patient.id, received_minutes_ago=120)

            assert (
                await evaluate_data_gap_for_user(db_session, patient.id)
                == DataGapAction.CREATED
            )
            assert (
                await evaluate_data_gap_for_user(db_session, patient.id)
                == DataGapAction.RENEWED
            )
            alerts = await _no_data_alerts(db_session, patient.id)
            assert len(alerts) == 1
            assert alerts[0].severity == AlertSeverity.WARNING
            assert "2h 0m" in alerts[0].message

            # Warmup ends, data resumes.
            await _add_reading(db_session, patient.id, received_minutes_ago=1)
            assert (
                await evaluate_data_gap_for_user(db_session, patient.id)
                == DataGapAction.RESOLVED
            )
            (alert,) = await _no_data_alerts(db_session, patient.id)
            assert alert.acknowledged is True
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)


# ── Scope / coverage across source types ──


@pytest.mark.asyncio
class TestSourceCoverage:
    @pytest.mark.parametrize("source", ["glooko", "medtronic"])
    async def test_non_role_managed_sources_fire(self, db_session, source):
        """The HIGH-fix: Glooko / Medtronic-CareLink users write real readings
        but have no cgm_role, so a list_cgm_sources arming gate would silently
        exclude them. They must arm and fire off reading existence alone --
        here past 2x their 30-min pull interval (two missed pulls)."""
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            await _add_pull_source_state(db_session, patient.id, source)
            await _add_reading(
                db_session, patient.id, received_minutes_ago=90, source=source
            )

            action = await evaluate_data_gap_for_user(db_session, patient.id)

            assert action == DataGapAction.CREATED
            (alert,) = await _no_data_alerts(db_session, patient.id)
            assert alert.severity == AlertSeverity.WARNING
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    @pytest.mark.parametrize("source", ["glooko", "medtronic"])
    async def test_healthy_pull_cadence_does_not_false_alarm(self, db_session, source):
        """A CONNECTED 30-min-pull patient whose newest arrival is 45 min old
        is inside normal cadence (threshold widens to 2x interval = 60m) --
        NO alert. A flat 30-min threshold would fire here on every healthy
        sync cycle and train caregivers to ignore the alert."""
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            await _add_pull_source_state(db_session, patient.id, source)
            await _add_reading(
                db_session, patient.id, received_minutes_ago=45, source=source
            )

            action = await evaluate_data_gap_for_user(db_session, patient.id)

            assert action == DataGapAction.NONE
            assert await _no_data_alerts(db_session, patient.id) == []
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_errored_pull_source_does_not_widen_threshold(self, db_session):
        """A broken sync is exactly the outage to surface: an ERROR-status
        Glooko state must not buy itself the widened deadline, so the base
        30-min threshold applies and a 45-min gap fires."""
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            await _add_pull_source_state(
                db_session, patient.id, "glooko", status=glooko_sync_state.STATUS_ERROR
            )
            await _add_reading(
                db_session, patient.id, received_minutes_ago=45, source="glooko"
            )

            action = await evaluate_data_gap_for_user(db_session, patient.id)

            assert action == DataGapAction.CREATED
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_threshold_resolution(self, db_session):
        """No pull sources => base 30; a slow HEALTHY Nightscout connection
        widens to 2x its interval; an erroring one must not (same rule as the
        Glooko/Medtronic connected-only filters -- a broken sync is the outage
        to surface, not a reason to extend the deadline)."""
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            assert (
                await resolve_no_data_threshold_minutes(db_session, patient.id)
                == NO_DATA_THRESHOLD_MINUTES
            )

            conn = NightscoutConnection(
                user_id=patient.id,
                name="slow NS",
                base_url="https://ns.example.com",
                auth_type=NightscoutAuthType.TOKEN,
                encrypted_credential="enc",
                api_version=NightscoutApiVersion.V1,
                last_sync_status=NightscoutSyncStatus.OK,
                sync_interval_minutes=60,
            )
            db_session.add(conn)
            await db_session.commit()

            assert (
                await resolve_no_data_threshold_minutes(db_session, patient.id) == 120
            )

            conn.last_sync_status = NightscoutSyncStatus.AUTH_FAILED
            await db_session.commit()

            assert (
                await resolve_no_data_threshold_minutes(db_session, patient.id)
                == NO_DATA_THRESHOLD_MINUTES
            )
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_job_discovery_skips_unlinked_and_muted_patients(self, db_session):
        """check_data_gaps_all_users only evaluates patients with an
        alert-receiving caregiver link."""
        from src.services.scheduler import check_data_gaps_all_users

        linked, caregiver = await _make_monitored_patient(db_session)
        muted, muted_cg = await _make_monitored_patient(
            db_session, can_receive_alerts=False
        )
        unlinked = await _make_user(db_session, UserRole.DIABETIC)
        try:
            for uid in (linked.id, muted.id, unlinked.id):
                await _add_reading(db_session, uid, received_minutes_ago=45)

            await check_data_gaps_all_users()

            assert len(await _no_data_alerts(db_session, linked.id)) == 1
            assert await _no_data_alerts(db_session, muted.id) == []
            assert await _no_data_alerts(db_session, unlinked.id) == []
        finally:
            await _cleanup(
                db_session, linked.id, caregiver.id, muted.id, muted_cg.id, unlinked.id
            )


# ── Correctness ──


@pytest.mark.asyncio
class TestCorrectness:
    async def test_age_measured_off_received_at_not_reading_timestamp(self, db_session):
        """A future-skewed device clock (reading_timestamp ahead of now) must
        not mask a blackout: the reading ARRIVED 45 min ago, so it fires. A
        reading_timestamp-based implementation would compute a negative age
        and stay silent."""
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            await _add_reading(
                db_session,
                patient.id,
                received_minutes_ago=45,
                reading_timestamp=datetime.now(UTC) + timedelta(minutes=10),
            )

            action = await evaluate_data_gap_for_user(db_session, patient.id)

            assert action == DataGapAction.CREATED
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_tz_naive_received_at_normalized(self, db_session, monkeypatch):
        """A tz-naive received_at (non-PG backends return naive datetimes) is
        treated as UTC, not a crash or a skewed age."""
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            naive_received = datetime.now(UTC).replace(tzinfo=None) - timedelta(
                minutes=45
            )
            fake_reading = SimpleNamespace(value=112, received_at=naive_received)
            monkeypatch.setattr(
                data_gap_alerts,
                "_latest_reading_by_arrival",
                AsyncMock(return_value=fake_reading),
            )

            action = await evaluate_data_gap_for_user(db_session, patient.id)

            assert action == DataGapAction.CREATED
            (alert,) = await _no_data_alerts(db_session, patient.id)
            assert "45m" in alert.message
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_warning_severity_not_selected_by_escalation(self, db_session):
        """NO_DATA stays WARNING => the escalation engine's URGENT/EMERGENCY
        selection never picks it up (v1 has no emergency-contact paging)."""
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            await _add_reading(db_session, patient.id, received_minutes_ago=35)
            await evaluate_data_gap_for_user(db_session, patient.id)

            critical = await get_unacknowledged_critical_alerts(db_session, patient.id)
            assert critical == []
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_detector_never_notifies_the_patient(self, db_session, monkeypatch):
        """No dedicated patient alarm path: the detector must not call the
        patient Telegram notifier. (The row still appears on the patient's
        own generic alert surfaces like any Alert -- that is accepted and
        honest; what is pinned here is that no Telegram push fires.)"""
        from src.services import alert_notifier

        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            spy = AsyncMock(
                side_effect=AssertionError(
                    "notify_user_of_alerts must not run for NO_DATA"
                )
            )
            monkeypatch.setattr(alert_notifier, "notify_user_of_alerts", spy)

            await _add_reading(db_session, patient.id, received_minutes_ago=35)
            action = await evaluate_data_gap_for_user(db_session, patient.id)

            assert action == DataGapAction.CREATED
            spy.assert_not_called()
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)

    async def test_alert_response_round_trip(self, db_session):
        """A NO_DATA row serializes through the mobile/SSE payload path
        (nullable predicted/iob/trend fields) without a 500."""
        patient, caregiver = await _make_monitored_patient(db_session)
        try:
            await _add_reading(db_session, patient.id, received_minutes_ago=35)
            await evaluate_data_gap_for_user(db_session, patient.id)
            (alert,) = await _no_data_alerts(db_session, patient.id)

            response = AlertResponse(**alert_to_dict(alert, patient_name="Alice"))

            assert response.alert_type == "no_data"
            assert response.severity == "warning"
            assert response.patient_name == "Alice"
            assert response.predicted_value is None
            assert response.iob_value is None
        finally:
            await _cleanup(db_session, patient.id, caregiver.id)


# ── Message formatting ──


class TestFormatGapMessage:
    def test_minutes(self):
        msg = format_gap_message(
            42.7, "112 mg/dL", datetime(2026, 7, 4, 13, 5, tzinfo=UTC)
        )
        assert msg == "No CGM data for 42m (last: 112 mg/dL at 13:05 UTC)"

    def test_hours(self):
        msg = format_gap_message(
            150.0, "6.2 mmol/L", datetime(2026, 7, 4, 3, 15, tzinfo=UTC)
        )
        assert msg == "No CGM data for 2h 30m (last: 6.2 mmol/L at 03:15 UTC)"

    def test_threshold_constant_sane(self):
        # Above the 5-min tick and the 10-min staleness window, well below
        # anything that would hide a real emergency.
        assert 10 < NO_DATA_THRESHOLD_MINUTES <= 60
