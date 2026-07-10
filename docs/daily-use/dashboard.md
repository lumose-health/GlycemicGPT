---
title: Reading Your Dashboard
description: What each part of the GlycemicGPT dashboard shows you.
---

The dashboard is the main view in GlycemicGPT. It pulls together your latest glucose, insulin data, and trends in one place. This page explains what you're looking at.

> **The dashboard reflects the data flowing into the platform.** If a number looks wrong, the platform may be displaying what your CGM or pump reported -- including any errors. Always verify against your CGM's official app for medical decisions, and consult your healthcare provider for any clinical interpretation.

## Layout overview

The dashboard has several main areas:

- **Glucose** -- your current blood glucose, trend arrow, and recent readings chart
- **CGM summary statistics** -- average glucose, standard deviation, coefficient of variation (CV%), GMI, and CGM-active percentage over the selected window
- **AGP chart** -- Ambulatory Glucose Profile percentile bands by hour-of-day across the selected window
- **Time in Range (TIR)** -- five-bucket breakdown of how your glucose has been distributed
- **Insulin on Board (IoB)** -- how much active insulin is in your system
- **Insulin summary** -- bolus / basal breakdown, recent insulin events
- **Pump status** -- battery, reservoir, basal rate (rendered inline in the glucose hero card when a pump is connected)
- **Bolus review** -- a tabular view of recent insulin events
- **Status row** at the very top -- a compact strip of icons showing your pump connection, sync state, server reachability, and which integrations are active (see [Reading the status row](#reading-the-status-row))

The exact arrangement depends on your screen size -- on phones it stacks vertically, on larger screens it spreads out.

## Reading the status row

The row of small icons at the very top of the dashboard is your at-a-glance health check. Read it left to right: **pump connection**, then (if you've connected a server) **sync** and **server reachability**, then a **brand mark for each active integration**. A healthy setup is quiet -- solid/blue icons with no warning text. Anything needing attention turns red or amber and, where it matters, spells out the problem in words.

### Pump connection (the Bluetooth icon)

The first icon is your Bluetooth link to the pump. It has three "moods":

| Icon | Colour | State | What it means |
|------|--------|-------|---------------|
| Bluetooth (solid) | Blue | Connected | Live link to your pump; data is flowing. |
| Bluetooth (searching / plain) | Amber | Scanning / Connecting / Reconnecting | Actively (re)establishing the link -- shows "Scanning…", "Connecting…", or "Reconnecting…". A brief disruption lands here while it recovers. |
| Bluetooth (crossed out) | Red | No pump connected / Pairing failed | No live link right now. This is the resting state when no pump is paired, the pump is idle or out of range, or a pairing attempt failed ("Pairing failed"). |

So the **crossed-out Bluetooth is not an error in itself** -- it simply means there is no active pump connection at the moment. If you expect to be connected and it stays crossed-out, see [BG isn't updating](../troubleshooting/bg-not-updating.md).

### Sync and server reachability (the cloud icons)

These two cloud icons appear **only if you've connected a server** (Settings → Connect a Server). In BLE-only mode -- using the app as a direct pump monitor with no server -- they're hidden, because there's no cloud to sync to.

The **first cloud is your sync status** -- whether your local data has made it up to your server:

| Icon | Colour | State | What it means |
|------|--------|-------|---------------|
| Up/down arrows | Blue | Synced | Your data is up to date on the server. |
| Cloud with sync arrows | Amber | Pending | Readings are queued, waiting to upload (e.g. after a brief outage). Normal; clears itself. |
| Cloud (crossed out) | Red / grey | Not synced / Sync error | Nothing has synced yet, or the last upload failed. |

The **second cloud is server reachability** -- whether your server is answering right now:

| Icon | Colour | State | What it means |
|------|--------|-------|---------------|
| Cloud with checkmark | Blue | Reachable | Your server responded recently. (Shown with no text -- the quiet, healthy state.) |
| Cloud (crossed out) | Red | Backend unreachable | Your device is online but the server isn't responding. Labeled "Backend unreachable". |
| Cloud (crossed out) | Red | Offline | Your device has no network at all (airplane mode / no Wi-Fi). Labeled "Offline". |

> **Why two clouds?** They answer different questions. Sync is *"is my data uploaded?"*; reachability is *"can I reach the server this instant?"*. You can be reachable with a sync backlog still draining, or fully synced but momentarily offline -- during a hiccup the two icons together tell you which layer is affected. When everything is healthy the sync icon is up/down arrows and the reachability icon is the cloud-checkmark, so they read as two distinct signals rather than a duplicate.

### Active integrations (brand marks)

After the status icons, each **active integration shows its brand mark**: the Tandem logo, the Medtronic logo, or the Nightscout owl. This is a quick confirmation of what's currently feeding the app. Only one pump can be active at a time, so you'll see at most one pump mark plus any data sources (like Nightscout). Activate or deactivate integrations under **Settings → Plugins**; the marks appear and disappear to match.

## Glucose

The big number at the top is your most recent glucose reading. Below it:

- **Trend arrow** -- the direction your glucose is moving (rising, falling, steady)
- **Last reading time** -- when this value was recorded. If it's more than a few minutes old, your data flow may have stalled -- see [BG isn't updating](../troubleshooting/bg-not-updating.md).
- **Glucose chart** -- typically the last few hours of readings, with shaded bands showing your target range

Your target range is configured in **Settings → Glucose Range**. Defaults are typical clinical guidelines; ask your healthcare provider what targets they recommend for you.

## Time in Range (TIR)

A bar showing how your glucose has been distributed across these zones over the selected time window:

- **In range** (target zone)
- **Above range** (high)
- **Below range** (low)
- **Severely below** (urgent low)

You can change the time window with the period selector. Longer windows are useful for talking with your endocrinologist; shorter windows are useful for "how am I doing today."

> **Time in Range is a guideline, not a goal in itself.** Your endocrinologist may have specific recommendations for your TIR targets based on your treatment plan.

## CGM summary statistics

A panel showing the standard CGM-statistic set computed over your selected window:

- **Average glucose** -- mean blood glucose over the window
- **Standard deviation** -- how much your glucose varies around that average
- **CV% (coefficient of variation)** -- standard deviation as a percentage of the average; a normalized variability metric clinicians use
- **GMI (Glucose Management Indicator)** -- an estimate of A1C derived from your CGM data. Different from a lab-measured A1C but useful as a between-appointments check.
- **CGM active %** -- how much of the window your CGM was actually reporting (e.g., low values indicate sensor warmups, gaps, or disconnects)

These match the standard set produced by Tidepool, Dexcom Clarity, and clinical CGM-reporting tools.

## AGP chart

The dashboard renders an [Ambulatory Glucose Profile](../concepts/glossary.md#agp----ambulatory-glucose-profile) -- the standardized clinical chart that overlays glucose curves across days to surface daily patterns, with percentile bands by hour-of-day:

- **p50** -- median glucose at each hour
- **p25 / p75** -- inter-quartile range
- **p10 / p90** -- the wider distribution

The window is selectable (typically 7 / 14 / 30 / 90 days). AGP is the lingua franca clinicians use; having it on the home dashboard means you can see what your endo would see without exporting anywhere.

> Note: a *printable* AGP-format report (the standardized PDF format clinicians often print) is a roadmap item -- the dashboard AGP visualization is what's available today.

## Insulin on Board (IoB)

The amount of bolus insulin still active in your system, calculated from your recent boluses and your insulin action time. The value updates as time passes (insulin decays).

If you have a Tandem pump connected, GlycemicGPT reads IoB directly from the pump's onboard calculation. If you're only using a CGM (no pump), IoB shows zero or "not available."

## Pump status

Pump information (battery, reservoir, basal rate, IoB) renders inline in the glucose hero card when your pump is connected and reporting:

- **Battery** -- the pump's remaining battery percentage
- **Reservoir** -- how much insulin is left in the cartridge / pod
- **Basal rate** -- your current basal delivery rate

If any of these are missing or stale, the data flow from your pump has likely stalled -- see [BG isn't updating](../troubleshooting/bg-not-updating.md).

## Bolus review

A tabular view of recent insulin events -- when each dose was delivered, how much, and its type: a manual bolus, a Control-IQ correction, or a long-acting (basal) injection.

If you take long-acting injections (MDI -- e.g. Lantus, Tresiba, Levemir), they show here as a distinct **Basal injection** row, clearly separated from rapid-acting boluses. They are counted toward your basal total and total daily dose, but deliberately kept out of the rapid-acting Insulin on Board calculation -- long-acting insulin acts over ~24 hours and doesn't belong in the rapid-acting IoB curve. In the insulin summary, a long-acting injection is folded into your **Basal** figure (with the injected amount shown on its own line) since for an MDI user it is the basal therapy.

## Period selector

Different cards offer different period ranges:

- **TIR bar / glucose chart** -- 24h / 3 days / 7 days / 14 days / 30 days
- **CGM summary stats** -- selectable window (matches your TIR selection)
- **AGP chart** -- 7 days / 14 days / 30 days / 90 days

Time periods longer than what the platform has actually collected will show only the data that's there. If you only started running GlycemicGPT yesterday, picking "30 days" on the TIR bar will show that one day of data; the rest of the window appears empty until your platform fills in over time. This isn't a bug; the platform can't show what it hasn't received yet.

## Printing reports for your endocrinologist

A clinical-style printable report exists today; access it from **Settings → Data → Reports**. You can pick a date range; the generated report includes Time in Range, glucose statistics, and key patterns. (A direct **Reports** link in the main sidebar is on the roadmap; today the entry point is under Settings → Data.)

> The dashboard already shows an [AGP chart](#agp-chart) (the standardized clinical visualization). What's still on the roadmap is a **printable / exportable AGP-format report** in the standard PDF format clinicians sometimes print. If your endo specifically wants the standard AGP PDF, today the easier path is generating it from [Tidepool](https://www.tidepool.org/), Dexcom Clarity, or LibreView -- which all produce it in the standard format. We expect to close this gap; tracking in [ROADMAP.md](https://github.com/GlycemicGPT/GlycemicGPT/blob/main/ROADMAP.md).

## A few honest reminders

- **The dashboard does not provide medical advice.** It shows your data and AI-generated observations, both labeled as informational.
- **Numbers can be wrong.** If a value looks impossibly high or low, your CGM or pump may have a sensor or hardware issue. Verify against the device's official app.
- **The platform stores your data on infrastructure you control.** Nothing on the dashboard is shared with anyone unless you explicitly link a caregiver (see [Caregiver overview](../caregivers/overview.md)).
