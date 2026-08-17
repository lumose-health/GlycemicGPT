---
title: Dexcom Share Sync
description: Architecture, timing, retry policy, realtime delivery, diagnostics, and validation for the Dexcom Share integration.
---

This document is the technical source of truth for the Dexcom Share sync used by Lumose. It covers the backend and current dashboard behavior.

## Goals

The integration is designed to:

1. Show the latest available reading as soon as a connection is established.
2. Detect each new Share reading within a few seconds when Share publishes on its expected cadence.
3. Avoid sustained aggressive polling during sensor gaps, network failures, or Share outages.
4. Deliver committed readings to the dashboard and alert engine immediately.
5. Keep durable scheduler and freshness state for reliable operation and troubleshooting.

Dexcom Share does not provide a webhook for this integration. Lumose must poll it.

## Reading lifecycle

| Stage | Owner | What happens |
|---|---|---|
| Connect | `routers/integrations.py` | Credentials are validated outside the async event loop with a request timeout. The reading returned during validation is retained. |
| Initial storage | `services/dexcom_sync.py` | The validation reading is stored immediately, committed, published to the live stream, and evaluated for alerts. |
| Backfill | `services/dexcom_sync.py` | The first scheduled sync fetches up to 24 hours and 288 readings. It runs without delaying the initial reading. |
| Scheduling | `services/scheduler.py` | A two second scheduler tick finds users whose `next_poll_at` is due. The shared synchronization lease admits one worker per user. The tick does not call Share for every user every two seconds. |
| Fetch and storage | `services/dexcom_sync.py` | Share is queried, readings are inserted idempotently, and per user polling state is updated. |
| Realtime delivery | `services/glucose_realtime.py` and `routers/glucose_stream.py` | A Redis notification wakes the authenticated server sent events stream. The stream reads the committed value from PostgreSQL. |
| Dashboard | `apps/web` dashboard components | The Live CGM value updates immediately. Historical dashboard invalidation remains owned by GLY-217. |
| Alerts | `services/predictive_alerts.py` | Alerts are evaluated immediately after a new reading commits. The scheduled alert job remains a fallback. |

## Connection bootstrap

`POST /api/integrations/dexcom` performs one credential validation and current reading fetch.

When Share returns a reading, Lumose reuses that result instead of issuing a second request. It stores the reading before returning the successful connection response. The dashboard can therefore receive the value immediately.

When credentials are valid but Share has no current reading, the connection remains active with `waiting_for_reading=true`. The scheduler continues from the normal adaptive policy.

When Share cannot be reached or the validation request times out, the endpoint returns `503` and does not store the unverified credentials. `Waiting for data` therefore only follows a completed Share authentication.

The first scheduled fetch is a history backfill:

| Setting | Value |
|---|---:|
| Lookback | 24 hours |
| Maximum readings | 288 |
| Later lookback | 60 minutes |
| Later maximum | `DEXCOM_MAX_READINGS_PER_SYNC` |

Storage uses a conflict safe insert keyed by user and reading timestamp. Repeating a backfill does not create duplicate glucose rows.

## Sensor cadence anchored polling phase

Dexcom readings normally arrive on a five minute cadence. The important scheduling value is `poll_phase_at`, the next predicted time to probe Share for a new reading.

After every new reading, Lumose anchors the next phase to the source reading timestamp plus 300 seconds, with a 15 second early probe. It is not calculated from the interval between actual receipt times. This prevents request duration, scheduler delay, laptop sleep, and a temporarily delayed Share response from moving every future poll later.

The source phase is bounded to 225 through 295 seconds after local receipt. This retains the useful five minute cadence while preventing a device clock that is substantially ahead or behind from moving the probe outside the bounded publication retry window. A source phase that is already past still schedules an immediate catch up probe.

`next_poll_at` is different from `poll_phase_at`:

| Field | Meaning |
|---|---|
| `poll_phase_at` | Stable early probe for the next expected sensor reading. |
| `next_poll_at` | Next execution deadline. It may temporarily point to a short retry. Synchronization ownership is tracked separately by the lease fields. |

The scheduler checks due rows every two seconds by default. A request can therefore begin about zero to two seconds after its stored deadline.

### How the phase is anchored

1. A new source reading at time `T` sets the next early probe to `T + 285 seconds`.
2. If Share has not published the next reading, the bounded five second and twenty second retries begin.
3. Detecting a reading during those retries does not move future phases later. The next phase is anchored to that new reading's source timestamp again.
4. If the expected next phase is already past, such as after process suspension or sleep, Lumose schedules an immediate catch up probe instead of skipping another five minutes.
5. During a long sensor gap, traffic still falls back to one request every five minutes. The first returning reading restores the source cadence anchor.

The source timestamp is useful for cadence but is not treated as an authoritative wall clock. Device clock skew is bounded before it can influence the next polling deadline. User facing freshness continues to use Lumose receipt time.

## A successful response with no new reading

A valid Share response that contains only readings Lumose already has is an unchanged response. This is not a transport failure.

The retry sequence is bounded:

| Step | Delay from the previous response | Number of requests |
|---|---:|---:|
| Predicted phase request | None | 1 |
| Fast detection | 5 seconds | 5 |
| Medium detection | 20 seconds | 5 |
| Long gap recovery | Exact five minute phase | 1 per phase |

One publication cycle can therefore use at most 11 requests during roughly the first 125 seconds after the predicted phase. If the sensor or uploader remains unavailable, traffic falls back to one request every five minutes.

This policy handles common sensor gaps without continuously polling Share every five seconds.

## Failures and rate limits

| Failure | Behavior |
|---|---|
| Invalid credentials | Mark the integration as error, invalidate the cached client, and stop normal connected polling. |
| Credential decryption failure | Mark the integration as error and retain the failure for diagnostics. |
| Expired or invalid Share session | Invalidate the cached client and use bounded transport retries. |
| Timeout, network failure, or server failure | Retry after 5, 10, 20, 40, and 60 seconds, then return to the fixed five minute phase. |
| HTTP 429 | Honor `Retry-After`, with a minimum delay of five minutes. |
| Successful fetch | Clear the transport failure count and error. |

The Share client applies an explicit timeout to every request. Blocking `pydexcom` calls run in worker threads so they do not block the API event loop.

## Request volume

When the early probe already contains the reading, normal traffic is one Share request every five minutes for each connected user. If Share publishes closer to or after the source timestamp, the bounded retry sequence may use several requests for that cycle. The hard cycle limit remains 11 requests, and long gaps return to one request every five minutes.

For the expected two or three connected users, normal traffic is 24 to 36 requests per hour. A delayed publication can temporarily add the bounded retry burst described above.

Dexcom does not publish a reliable rate limit contract for this Share endpoint. The implementation limits risk through fixed phase polling, bounded bursts, conservative 429 handling, and a fall back to one request per five minutes during long gaps.

## Multiple users and API replicas

Sync state is stored per user in `dexcom_sync_states`. Each connected user can have a separate Share account and publication phase.

Every scheduled and manual synchronization acquires the same durable per user lease before calling Share. The lease has an ownership token and a two minute expiry. Only the owner can release it, and expiry permits recovery if a process terminates before cleanup.

Schedulers may discover the same due user concurrently, but only one can acquire the lease. A manual request made while that lease is active returns `409` instead of issuing a second Share request.

## Sync status

The integration status response exposes scheduler and freshness fields for troubleshooting.

| Field | Meaning | Safe interpretation |
|---|---|---|
| `latest_reading_at` | Timestamp supplied with the Dexcom reading. | Clinical reading time. |
| `latest_received_at` | Lumose time after the Share response completed. | When the value became available to this application. |
| `last_sync_attempt_at` | Time the latest sync attempt began. | Scheduler activity. |
| `last_sync_success_at` | Time the latest successful Share response completed. | Share availability. |
| `next_sync_at` | Current `next_poll_at`. | Next scheduled phase or retry deadline. |

The Live CGM and Live Connections age counters use `received_at`. They show time since Lumose received the reading, not time since the Dexcom device timestamp.

## Freshness states

Connection freshness uses Lumose receipt time:

| State | Age since Lumose receipt |
|---|---:|
| Connected | Up to and including 6 minutes |
| Delayed | More than 6 minutes and up to 10 minutes |
| Stale | More than 10 minutes and up to 24 hours |
| No recent data | No value in the completed 24 hour backfill, or older than 24 hours |
| Waiting for data | Connected, but the initial backfill has not completed and no value exists |

The six minute connected window allows the normal five minute sensor cadence plus a small amount of scheduler and network time.

When the current live source is Dexcom and freshness is Delayed, or when the live reading is Stale, the dashboard applies the Panel header content color to both the glucose shape and displayed number. It also disables the range pulse and adds the freshness state to the accessible announcement. The existing very old reading safeguard can still replace the number with an unavailable placeholder. A newly received reading clears the untrusted treatment immediately, even if the periodic integration status response still describes the previous reading.

## Realtime dashboard and alert flow

After a new reading is committed:

1. Lumose publishes only update metadata to a user specific Redis channel. Glucose values remain in PostgreSQL.
2. The server sent events connection wakes immediately and reads the committed glucose and active alerts.
3. If Redis is unavailable, the stream falls back to its timed database check, with heartbeats every 30 seconds and a glucose check at least every 60 seconds.
4. Alert evaluation runs immediately. The regular five minute alert job is retained as a safety fallback.

The Live CGM value follows the live stream. Historical charts and derived dashboard resources keep their existing refresh behavior until GLY-217 introduces targeted source invalidation.

## Sensor gaps and upstream delays

Lumose cannot determine the cause of an unchanged successful Share response. Possible causes include sensor signal loss, phone connectivity, uploader suspension, Share processing delay, or an actual Share outage.

The correct behavior is therefore:

1. Probe briefly around the expected source publication phase.
2. Reduce request frequency after the bounded retry window.
3. Keep the connection configured.
4. Let the dashboard progress through Delayed and Stale based on Lumose receipt time.
5. Learn a new phase when readings return after a long gap.

## Local development and sleep

A laptop cannot poll while it is asleep. On wake, the scheduler finds overdue work, acquires the shared lease, fetches current Share data, and immediately reanchors future polling to the newest source reading cadence.

Run the local web app and API on the ports configured for your development environment.

The local LaunchAgent can leave an old Uvicorn child process behind when its wrapper is force restarted. After restarting the API locally, confirm there is only one scheduler process. Multiple local schedulers make timing logs difficult to interpret even though database leases protect each user.

Useful checks:

```bash
curl -fsS http://localhost:8000/health
lsof -nP -iTCP:8000 -sTCP:LISTEN
ps -axo pid,ppid,command | rg 'uvicorn|glycemicgpt'
```

## Troubleshooting checklist

1. Confirm the official Dexcom app or Clarity has a current value.
2. Check the connection freshness, latest receipt time, last attempt, last success, and next sync.
3. Look for `Dexcom sync completed`, session errors, timeouts, or rate limit messages in API logs.
4. Confirm only one local scheduler is running after a development restart.
5. If the host slept, evaluate polling only after the next complete publication cycle.

Example Docker log command:

```bash
docker compose logs --tail=300 api | rg 'Dexcom sync completed|Scheduled Dexcom sync|rate limited|session'
```

The manual endpoint `POST /api/integrations/dexcom/sync` is useful for diagnosis. It does not replace the adaptive scheduler and should not be repeatedly called as a polling loop. Its reading response is loaded from the persisted row so `received_at` remains the original Lumose receipt time.

## Persistence and migrations

The durable polling state and synchronization ownership are introduced together:

| Revision | Purpose |
|---|---|
| `081_add_dexcom_sync_states` | Per user scheduler, phase, health, backfill, and lease state. |

Disconnecting Dexcom removes both the encrypted credential and its sync state. Reconnecting creates a fresh phase and performs the initial reading flow again.

## Validation

The focused test coverage lives in:

1. `apps/api/tests/test_dexcom_adaptive_sync.py`
2. `apps/api/tests/test_glucose_realtime.py`
3. `apps/api/tests/test_glucose_stream.py`
4. `apps/api/tests/test_integrations.py`
5. `apps/api/tests/test_predictive_alerts.py`
6. Dashboard component and hook tests under `apps/web`

Validation should include:

1. A clean migration from the first database revision through the current revision.
2. Unit tests for phase advancement, clock skew bounds, retry boundaries, long gap recovery, 429 handling, and initial storage.
3. Integration tests for shared lease ownership, scheduler state transitions, status fields, Redis wakeup, server sent events payloads, and immediate alert evaluation.
4. A real Share sequence covering at least two consecutive five minute publication phases.
5. A signed in local dashboard check confirming the age counter, live value, connection freshness, and alerts.

## Code map

| Area | File |
|---|---|
| Adaptive algorithm and storage | `apps/api/src/services/dexcom_sync.py` |
| Due row selection and lease handoff | `apps/api/src/services/scheduler.py` |
| Durable state model | `apps/api/src/models/dexcom_sync_state.py` |
| Connect, status, disconnect, and manual sync | `apps/api/src/routers/integrations.py` |
| Redis update fanout | `apps/api/src/services/glucose_realtime.py` |
| Live glucose and alert stream | `apps/api/src/routers/glucose_stream.py` |
| Immediate alert evaluation | `apps/api/src/services/predictive_alerts.py` |
| Dashboard integration | Find `DashboardPageContent` under `apps/web/src/app` |

For user setup and nontechnical behavior, see [Connecting Your Dexcom CGM](../daily-use/connecting-dexcom.md). For general stale glucose troubleshooting, see [BG isn't updating](../troubleshooting/bg-not-updating.md).
