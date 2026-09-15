---
title: LibreLinkUp Live Validation
description: How a tester with a real FreeStyle Libre account validates the native LibreLinkUp integration against Abbott's cloud.
---

# LibreLinkUp Live Validation

## Why this guide exists

The native LibreLinkUp connector (the FreeStyle Libre path that replaces the
Nightscout relay) is covered by automated tests against **mocks** and a **real
Postgres**, but nothing in CI ever talks to Abbott's actual LibreLinkUp cloud.
`pylibrelinkup` wraps an **unofficial** API, so a few details are
reverse-engineered and can only be confirmed with a real sensor + follower
account. This guide is what you hand to that tester.

It has two paths:

- **Fast path — the probe** (5 minutes, no app deploy): confirms the
  reverse-engineered assumptions directly against the API.
- **Full path — the app UI**: confirms the reading persists and displays
  correctly end to end.

## What the tester needs

- An **active FreeStyle Libre 2 / 3 / 3+** sensor, worn and streaming to the
  FreeStyle Libre phone app.
- A **LibreLinkUp** follower account (the separate follower app / site) that has
  **accepted a sharing invitation** from the sensor wearer. Without at least one
  accepted connection there is nothing to read. The wearer and the follower can
  be the same person on two apps.
- The account's **region** — one of: `US`, `EU`, `EU2`, `AE`, `AP`, `AU`, `CA`,
  `DE`, `FR`, `JP`, `LA`, `RU`. It must match the region of the account that
  shares to you.

> Use your own (or a throwaway follower) account. Never send credentials to
> anyone — the paths below only ever use them locally / over TLS to Abbott.

## What we're validating (the reverse-engineered bits)

| Assumption | Why it matters if wrong |
|---|---|
| Trend arrow `1=DOWN_FAST … 5=UP_FAST` → our `TrendDirection` | Arrows would point the wrong way on the dashboard. |
| `factory_timestamp` is UTC | A silent 4–8 h offset would put readings in the wrong place on the graph. |
| `value_in_mg_per_dl` is always canonical mg/dL | A mmol/L-region account could store 18× wrong values. |
| `get_patients()` returns the follower connection | No connection → nothing syncs. |
| Region → server resolution | Wrong region looks identical to a wrong password. |

## Fast path — the probe

Run from `apps/api` (uses that service's `uv` environment). It authenticates
once, then prints exactly what to eyeball. It uses the **production** mapping
(`map_libre_trend`, `resolve_api_url`), so a green probe is a green integration.

```bash
cd apps/api
export LIBRELINKUP_TEST_EMAIL='you@example.com'
export LIBRELINKUP_TEST_PASSWORD='your-librelinkup-password'
export LIBRELINKUP_TEST_REGION='EU'   # your region from the list above

uv run python - <<'PY'
import os
from pylibrelinkup import PyLibreLinkUp
from src.services.librelink_sync import map_libre_trend, resolve_api_url

email = os.environ["LIBRELINKUP_TEST_EMAIL"]
password = os.environ["LIBRELINKUP_TEST_PASSWORD"]
region = os.environ.get("LIBRELINKUP_TEST_REGION", "US")

client = PyLibreLinkUp(email=email, password=password, api_url=resolve_api_url(region))
client.authenticate()

patients = client.get_patients()
print(f"patients (sharing connections): {len(patients)}")
if not patients:
    raise SystemExit("No sharing connection -- accept the LibreLinkUp invite first.")

patient = patients[0]
latest = client.latest(patient)
graph = client.graph(patient)

print("\n--- current reading (latest) ---")
print("value_in_mg_per_dl :", latest.value_in_mg_per_dl)
raw = latest.trend
print("raw trend          :", raw, "-> int", getattr(raw, "value", raw))
print("mapped direction   :", map_libre_trend(raw).value)
ts = latest.factory_timestamp
print("factory_timestamp  :", ts, "| tzinfo:", ts.tzinfo)

print("\n--- history (graph) ---")
print("points             :", len(graph))
if graph:
    print("oldest -> newest   :", graph[0].factory_timestamp, "->", graph[-1].factory_timestamp)
PY
```

**Check the output against your LibreLinkUp app, right now:**

1. **`value_in_mg_per_dl`** is within a few mg/dL of what your app shows (there's
   a ~5-minute lag), and it's in **mg/dL even if your app displays mmol/L**
   (e.g. `108`, not `6.0`). If your app is mmol/L: `mmol × 18 ≈ mg/dL`.
2. **`mapped direction`** matches the **arrow** your app shows (e.g. a flat arrow
   → `flat`, a single up arrow → `single_up`). If it's the opposite direction,
   the trend map is inverted — report it.
3. **`factory_timestamp`** — note whether `tzinfo` prints `None` or `UTC`. Both
   are handled by the code; just tell us which so we can confirm.
4. **`patients`** is usually `1`.

## Full path — through the app UI

With a running GlycemicGPT instance you're signed in to:

1. Go to **Settings → Integrations**, open **CGM Integrations**, and expand
   **FreeStyle Libre (LibreLinkUp)**.
2. Enter your LibreLinkUp **email**, **password**, and **region**, then click
   **Test Connection**. A wrong region looks identical to a wrong password, so
   double-check it if the connection fails.
3. On success the card shows **Connected**. The background sync runs on a short
   interval; within a few minutes the dashboard glucose should show your current
   value with the matching trend arrow.
4. Confirm the value and arrow match your FreeStyle Libre app.
5. When done, click **Disconnect** — this removes the stored credentials.

## Pass / fail checklist

- [ ] Probe authenticated and listed at least one patient.
- [ ] `value_in_mg_per_dl` matches the app (in mg/dL).
- [ ] `mapped direction` matches the app's arrow.
- [ ] `factory_timestamp` timezone noted (`None` or `UTC`).
- [ ] UI: connect → **Connected** → glucose appears and matches the app.
- [ ] UI: disconnect works.

## What to report back

Paste the probe output (feel free to redact the email), say whether the value
and the arrow matched your app, and note the `factory_timestamp` timezone. If
anything didn't match, that single mismatch tells us exactly which
reverse-engineered assumption to fix.

## Privacy & cleanup

- Credentials are encrypted at rest (Fernet) and are only used to fetch your own
  glucose data.
- Disconnecting deletes the stored credential.
- Nothing here asks you to share credentials with the developers.
