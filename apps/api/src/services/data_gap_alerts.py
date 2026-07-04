"""GLY-137: Caregiver "lost contact" / data-gap alert detector.

Fires a WARNING ``NO_DATA`` alert when a caregiver-monitored patient's
glucose data stops ARRIVING at the backend, so the caregiver sees an
explicit "No CGM data for Nm" instead of a silently frozen tile. The
predictive alert engine deliberately suppresses on stale data
(``evaluate_alerts_for_user``), which is correct for threshold alerts but
leaves the caregiver blind during exactly the blackout that can mask a low.

Load-bearing invariants (adversarial history in the GLY-137 story; the
per-decision rationale lives on the functions below):

- Age keys off backend data-ARRIVAL (``received_at``), never phone liveness
  or device clocks -- cloud-sync users' data flows regardless of their phone.
- Armed on caregiver link + recent-baseline (or an existing episode), never
  a source list -- Glooko/Medtronic/CareLink write readings without a
  ``cgm_role`` and must still arm.
- One alert per gap episode, held open while blind, auto-resolved on resume:
  in the normal path "cleared" means "data resumed". The only silent clear
  is detector death -> short-TTL expiry, an accepted operational fail-safe.
- No dedicated patient alarm: ``notify_user_of_alerts`` (patient Telegram)
  is never called; delivery rides the existing caregiver SSE/poll fan-out
  unchanged. Like any ``Alert`` row keyed on the patient, it DOES also
  appear on the patient's own generic alert surfaces (poll/SSE/notification)
  -- honest, non-escalating, and consistent with the staleness banner the
  patient already sees.
- Sensor warmup (~2h) fires by design in v1 -- the caregiver genuinely has
  no data, and the WARNING tile auto-resolves; session-aware suppression is
  deferred to v2.
"""

import uuid
from datetime import UTC, datetime, timedelta
from enum import Enum

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.core.units import format_glucose
from src.logging_config import get_logger
from src.models import glooko_sync_state, medtronic_connect_state
from src.models.alert import Alert, AlertSeverity, AlertType
from src.models.glooko_sync_state import GlookoSyncState
from src.models.glucose import GlucoseReading
from src.models.medtronic_connect_state import MedtronicConnectState
from src.models.nightscout_connection import NightscoutConnection
from src.services.cgm_source import glucose_readings_query
from src.services.glucose_unit import resolve_glucose_unit

logger = get_logger(__name__)

# Base threshold: fire when no reading has arrived for this long. Above the
# 5-min check tick and GLUCOSE_STALE_MINUTES=10 (a routine CGM hiccup), below
# anything that would leave a caregiver blind through a real emergency. For
# patients on slow PULL sources (Glooko / Medtronic Connect default to 30-min
# sync intervals, and received_at is stamped at sync time) the effective
# threshold widens to 2x their slowest active source interval -- otherwise a
# perfectly healthy 30-min-pull patient would false-alarm on every cycle.
# See resolve_no_data_threshold_minutes.
NO_DATA_THRESHOLD_MINUTES = 30

# Arming baseline: only patients whose data actually flowed recently are
# watched, so never-configured / just-onboarded users don't false-alarm. An
# open NO_DATA episode keeps a >24h blackout armed past this window.
ARMING_BASELINE_HOURS = 24

# Alert.source value for data-gap alerts (existing values: "predictive",
# "current", "iob").
NO_DATA_ALERT_SOURCE = "data_gap"


class DataGapAction(str, Enum):
    """What a detector tick did for one patient (for job-level logging)."""

    CREATED = "created"
    RENEWED = "renewed"
    RESOLVED = "resolved"
    NONE = "none"


async def resolve_no_data_threshold_minutes(
    db: AsyncSession, user_id: uuid.UUID
) -> int:
    """Effective gap threshold: ``max(base, 2x slowest active pull interval)``.

    ``received_at`` is stamped at SYNC time for pull sources, so a healthy
    patient's arrival age is bounded by their sync interval, not the CGM's
    5-min cadence -- Glooko and Medtronic Connect default to 30-min pulls,
    which would sit exactly on the base threshold and false-alarm every
    cycle. 2x the interval means roughly two consecutive missed pulls before
    the caregiver is alerted (the classic heartbeat rule).

    Only sources that could currently be DELIVERING readings widen the
    threshold: a disconnected/errored source is exactly the outage this
    detector exists to surface, so it must not buy itself a longer deadline.
    With several sources the slowest wins -- conservative against false
    alarms; a real blackout means ALL of them stopped, and the slowest one's
    cadence bounds how long "no new rows" is still normal.
    """
    intervals: list[int] = []

    glooko = (
        await db.execute(
            select(GlookoSyncState.sync_interval_minutes).where(
                GlookoSyncState.user_id == user_id,
                GlookoSyncState.enabled.is_(True),
                GlookoSyncState.cgm_sync_enabled.is_(True),
                GlookoSyncState.status == glooko_sync_state.STATUS_CONNECTED,
            )
        )
    ).scalar_one_or_none()
    if glooko is not None:
        intervals.append(glooko)

    medtronic = (
        await db.execute(
            select(MedtronicConnectState.sync_interval_minutes).where(
                MedtronicConnectState.user_id == user_id,
                MedtronicConnectState.enabled.is_(True),
                MedtronicConnectState.status
                == medtronic_connect_state.STATUS_CONNECTED,
            )
        )
    ).scalar_one_or_none()
    if medtronic is not None:
        intervals.append(medtronic)

    ns_intervals = (
        (
            await db.execute(
                select(NightscoutConnection.sync_interval_minutes).where(
                    NightscoutConnection.user_id == user_id,
                    NightscoutConnection.is_active.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    # sync_interval_minutes is non-null by schema on all three tables; the
    # None-filter is belt-and-braces so a future nullable column can't turn
    # max() into a tick-aborting TypeError.
    intervals.extend(i for i in ns_intervals if i is not None)

    # Dexcom Share syncs on the global interval (default 5 min) -- always well
    # under the base threshold, so it never widens and needs no lookup here.

    return max(NO_DATA_THRESHOLD_MINUTES, 2 * max(intervals, default=0))


def no_data_alert_ttl_minutes() -> int:
    """Open-alert TTL: 2x the check interval.

    Long enough that a healthy detector always renews before expiry, short
    enough that a dead detector's alert self-clears in ~2 ticks instead of
    lingering as a stale "no data" claim.
    """
    return 2 * settings.data_gap_check_interval_minutes


def format_gap_message(
    age_minutes: float,
    last_value_display: str,
    last_received: datetime,
) -> str:
    """Human message for the caregiver tile.

    The timestamp is the backend ingestion time (UTC) -- "when we last heard"
    -- matching the detection semantic, not the device-reported reading time.
    """
    minutes = int(age_minutes)
    age_str = f"{minutes}m" if minutes < 60 else f"{minutes // 60}h {minutes % 60}m"
    return (
        f"No CGM data for {age_str} "
        f"(last: {last_value_display} at {last_received.strftime('%H:%M')} UTC)"
    )


async def _render_gap_message(
    db: AsyncSession,
    user_id: uuid.UUID,
    age_minutes: float,
    latest: GlucoseReading,
    last_received: datetime,
) -> str:
    """Resolve the patient's display unit and render the gap message."""
    unit = await resolve_glucose_unit(db, user_id)
    return format_gap_message(
        age_minutes, format_glucose(float(latest.value), unit), last_received
    )


async def _latest_reading_by_arrival(
    db: AsyncSession, user_id: uuid.UUID
) -> GlucoseReading | None:
    """Most recently ARRIVED reading via the GLY-123 primary funnel.

    Ordered by ``received_at`` (ingestion clock), not ``reading_timestamp``:
    the detector's semantic is "data stopped arriving", and a skewed device
    clock must not mask or fake a blackout. The funnel decides which sources
    count (fail-safe: no primary => exclude nothing).
    """
    stmt = (
        (await glucose_readings_query(db, user_id))
        .order_by(desc(GlucoseReading.received_at))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _episode_alert(
    db: AsyncSession,
    user_id: uuid.UUID,
    last_received: datetime | None,
) -> Alert | None:
    """Newest NO_DATA alert belonging to the CURRENT gap episode.

    An alert belongs to the current episode iff it was created after the
    last received reading -- i.e. no data has flowed since it fired. When
    the user has no readings at all (``last_received is None``), any
    NO_DATA alert is episode-relevant.
    """
    stmt = select(Alert).where(
        Alert.user_id == user_id,
        Alert.alert_type == AlertType.NO_DATA,
    )
    if last_received is not None:
        stmt = stmt.where(Alert.created_at > last_received)
    stmt = stmt.order_by(desc(Alert.created_at)).limit(1)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _resolve_open_alerts(
    db: AsyncSession, user_id: uuid.UUID, now: datetime
) -> bool:
    """Ack every unacknowledged NO_DATA alert for the user (data resumed)."""
    result = await db.execute(
        select(Alert).where(
            Alert.user_id == user_id,
            Alert.alert_type == AlertType.NO_DATA,
            Alert.acknowledged.is_(False),
        )
    )
    alerts = list(result.scalars().all())
    for alert in alerts:
        alert.acknowledged = True
        alert.acknowledged_at = now
    return bool(alerts)


async def evaluate_data_gap_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> DataGapAction:
    """Run one data-gap detector tick for a caregiver-monitored patient.

    The caller has already established that the patient has at least one
    caregiver link with ``can_receive_alerts``; this function applies the
    recent-baseline arming gate and the episode lifecycle, and commits.
    """
    now = datetime.now(UTC)

    latest = await _latest_reading_by_arrival(db, user_id)

    last_received: datetime | None = None
    if latest is not None:
        last_received = latest.received_at
        if last_received.tzinfo is None:
            last_received = last_received.replace(tzinfo=UTC)

    episode = await _episode_alert(db, user_id, last_received)

    if latest is None:
        # No readings via the funnel at all. Armed only if an episode alert
        # already exists (e.g. readings aged out of retention mid-blackout);
        # hold it open, never fire fresh (no baseline, no last-known value).
        if episode is not None and not episode.acknowledged:
            episode.expires_at = now + timedelta(minutes=no_data_alert_ttl_minutes())
            await db.commit()
            return DataGapAction.RENEWED
        return DataGapAction.NONE

    age_minutes = (now - last_received).total_seconds() / 60

    # Only pay the per-source lookups once the base threshold is exceeded --
    # under it, data is fresh for every source type.
    threshold_minutes = NO_DATA_THRESHOLD_MINUTES
    if age_minutes > NO_DATA_THRESHOLD_MINUTES:
        threshold_minutes = await resolve_no_data_threshold_minutes(db, user_id)

    if age_minutes <= threshold_minutes:
        # Data is flowing (within the patient's normal arrival cadence) --
        # the episode (if any) is over.
        if await _resolve_open_alerts(db, user_id, now):
            await db.commit()
            logger.info(
                "Data-gap alert auto-resolved (data resumed)",
                user_id=str(user_id),
                age_minutes=round(age_minutes, 1),
            )
            return DataGapAction.RESOLVED
        return DataGapAction.NONE

    # In a gap.
    if episode is not None:
        if episode.acknowledged:
            # Someone acked this ongoing episode; no data has flowed since it
            # fired, so do NOT re-fire every tick. Known v1 limitation of the
            # shared per-patient row (as for every alert type): one
            # caregiver's ack clears it for all caregivers -- per-caregiver
            # ack state / re-fire-after-N-hours is deferred with escalation
            # to v2.
            return DataGapAction.NONE
        # Hold the alert open while blind (also revives an expired-unacked
        # episode row after a detector outage, instead of creating a
        # duplicate). Refresh the message so the reported age stays honest.
        episode.expires_at = now + timedelta(minutes=no_data_alert_ttl_minutes())
        episode.message = await _render_gap_message(
            db, user_id, age_minutes, latest, last_received
        )
        await db.commit()
        return DataGapAction.RENEWED

    if age_minutes > ARMING_BASELINE_HOURS * 60:
        # No readings in the baseline window and no open episode: not armed.
        # (A blackout that FIRED before crossing 24h stays armed above via
        # the episode branch.) Accepted blind spot: a caregiver who links to
        # a patient ALREADY dark for >24h gets no retroactive alert -- the
        # baseline gate exists to stop alarm storms on long-dormant accounts,
        # and the caregiver dashboard still shows no data for them.
        return DataGapAction.NONE

    # Onset: data flowed since the last NO_DATA episode (or there never was
    # one) and has now been absent past the threshold -- fire one alert.
    # (A reading landing between the queries above and this insert produces a
    # one-tick spurious alert; the next tick's resume branch auto-resolves
    # it, so the blast radius is one check interval.)
    alert = Alert(
        user_id=user_id,
        alert_type=AlertType.NO_DATA,
        severity=AlertSeverity.WARNING,
        # current_value is non-null by schema; carry the LAST-KNOWN value
        # (never 0 / a fake low). Clients branch on alert_type == "no_data"
        # and render the message, not this number, as the headline.
        current_value=float(latest.value),
        predicted_value=None,
        prediction_minutes=None,
        iob_value=None,
        message=await _render_gap_message(
            db, user_id, age_minutes, latest, last_received
        ),
        trend_rate=None,
        source=NO_DATA_ALERT_SOURCE,
        created_at=now,
        expires_at=now + timedelta(minutes=no_data_alert_ttl_minutes()),
    )
    db.add(alert)
    await db.commit()
    logger.info(
        "Data-gap alert created",
        user_id=str(user_id),
        age_minutes=round(age_minutes, 1),
    )
    return DataGapAction.CREATED
