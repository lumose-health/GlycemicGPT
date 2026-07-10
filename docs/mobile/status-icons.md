---
title: The App Status Icons
description: What the icons at the top of the GlycemicGPT app's home screen mean.
---

The row of small icons at the very top of the app's home screen is your at-a-glance health check. It shows whether your **pump is connected**, whether your data is **syncing to your server**, whether that **server is reachable**, and which **integrations are active**.

Read it left to right. A healthy setup is quiet -- solid blue icons, no warning text. Anything that needs attention turns red or amber and, where it matters, spells out the problem in words.

> This is specific to the **Android app**, which is what talks to your pump over Bluetooth. The web dashboard doesn't have a pump connection, so it doesn't show these icons -- see [Reading Your Dashboard](../daily-use/dashboard.md) for what the shared dashboard shows.

## Pump connection (the Bluetooth icon)

The first icon is your Bluetooth link to the pump. It has three "moods":

| Icon | Colour | State | What it means |
|------|--------|-------|---------------|
| Bluetooth (solid) | Blue | Connected | Live link to your pump; data is flowing. |
| Bluetooth (searching / plain) | Amber | Scanning / Connecting / Reconnecting | Actively (re)establishing the link -- shows "Scanning…", "Connecting…", or "Reconnecting…". A brief disruption lands here while it recovers. |
| Bluetooth (crossed out) | Red | No pump connected / Pairing failed | No live link right now. This is the resting state when no pump is paired, the pump is idle or out of range, or a pairing attempt failed ("Pairing failed"). |

So the **crossed-out Bluetooth is not an error in itself** -- it simply means there is no active pump connection at the moment. If you expect to be connected and it stays crossed-out, see [BG isn't updating](../troubleshooting/bg-not-updating.md) or [Can't pair pump](../troubleshooting/cant-pair-pump.md).

## Sync and server icons

These two icons appear **only if you've connected a server** (Settings → Connect a Server). In BLE-only mode -- using the app as a direct pump monitor with no server -- they're hidden, because there's no cloud to sync to.

The **first is your sync status** -- whether your local data has made it up to your server. When everything is synced it's an up/down-arrows icon; when there's a backlog or a problem it becomes a cloud:

| Icon | Colour | State | What it means |
|------|--------|-------|---------------|
| Up/down arrows | Blue | Synced | Your data is up to date on the server. |
| Cloud with sync arrows | Amber | Pending | Readings are queued, waiting to upload (e.g. after a brief outage). Normal; clears itself. |
| Cloud (crossed out) | Red / grey | Not synced / Sync error | Nothing has synced yet, or the last upload failed. |

The **second is server reachability** -- whether your server is answering right now:

| Icon | Colour | State | What it means |
|------|--------|-------|---------------|
| Cloud with checkmark | Blue | Reachable | Your server responded recently. (Shown with no text -- the quiet, healthy state.) |
| Cloud (crossed out) | Red | Backend unreachable | Your device is online but the server isn't responding. Labeled "Backend unreachable". |
| Cloud (crossed out) | Red | Offline | Your device has no network at all (airplane mode / no Wi-Fi). Labeled "Offline". |

> **Why two clouds?** They answer different questions. Sync is *"is my data uploaded?"*; reachability is *"can I reach the server this instant?"*. You can be reachable with a sync backlog still draining, or fully synced but momentarily offline -- during a hiccup the two icons together tell you which layer is affected. When everything is healthy the sync icon is up/down arrows and the reachability icon is the cloud-checkmark, so they read as two distinct signals rather than a duplicate.

## Active integrations (brand marks)

After the status icons, each **supported active integration shows its brand mark**: the Tandem logo, the Medtronic logo, or the Nightscout owl. This is a quick confirmation of what's currently feeding the app. (An integration without a bundled logo -- for example a custom plugin you added yourself -- stays active but shows no mark here.)

Only one pump can be active at a time, so you'll see at most one pump mark (Tandem *or* Medtronic) plus any data sources (like Nightscout). Activate or deactivate integrations under **Settings → Plugins**; the marks appear and disappear to match. If enough are active to run wide, they scroll sideways so they never crowd out the status icons.
