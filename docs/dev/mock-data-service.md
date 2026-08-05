---
title: Mock Data Service
description: Development only mock API data for device and integration flows.
---

# Mock Data Service

GlycemicGPT supports many possible device and data connections, including CGMs, pumps, Nightscout variants, cloud sync providers, and live glucose streams. Most developers do not have access to every real device, account, credential, or historical dataset needed to test these flows properly.

Without a reliable mock layer, device specific UI and data handling are hard to develop, hard to review, and easy to regress. The mock data service gives developers a development focused way to simulate supported connections so they can work with realistic device data even when they do not personally own or have access to those devices.

This mock layer must never ingest fake data into production systems. It is a browser side development tool that uses the existing web API contracts and returns fake responses before requests leave the browser.

## Enabling Mock Mode

Mock mode is opt in. The first browser request must include this request header:

```text
x-glycemicgpt-mock-api: 1
```

Use a browser header extension such as ModHeader:

1. Create a request header named `x-glycemicgpt-mock-api`.
2. Set its value to `1`.
3. Scope it to the local web app, for example `http://localhost:3003/*`.
4. Open or reload `/dashboard`.

The middleware treats this header as a development only mock runtime signal. In development, it allows dashboard access without a real session and forwards the same header into the App Router request context. The root layout reads that header, starts the MSW worker, and mounts the mock control panel.

If the header is missing, mock mode does not start. The app follows the normal auth and backend API paths.

## Benefits

1. Developers can test CGM, pump, Nightscout, Glooko, Tandem, Medtronic, and live stream surfaces without real credentials.
2. UI review becomes repeatable because reviewers can select the same simulated device and glucose scenario.
3. Error prone integration pages can be developed while the real backend, cloud account, or physical device is unavailable.
4. Regression testing is easier because mocked responses use the same `/api/*` shapes that production screens already consume.
5. Fake device data stays out of production databases because the mock layer responds inside the browser.

## How It Works

The web app uses [Mock Service Worker](https://mswjs.io/) in development. MSW registers a service worker in the browser and intercepts network requests that match configured handlers. The app still calls the same URLs it normally calls, such as `/api/integrations/glucose/history` or `/api/integrations/pump/status`. When mock mode is active, MSW catches those requests and returns generated JSON instead of allowing the browser to send the request to the real backend.

The implementation lives in `apps/web/src/mocks`:

1. `browser.ts` starts the MSW browser worker.
2. `handlers.ts` maps API routes to mock responses.
3. `data.ts` generates realistic glucose, pump, alert, brief, insight, and integration payloads.
4. `state.ts` stores the selected mock scenario in `localStorage`.
5. `DevMockPanel.tsx` exposes tabbed development controls for connections, glucose events, knowledge base data, AI chat, notifications, and API behavior.
6. `MockNotificationsBridge.tsx` connects immediate notification test actions to the V2 notification context.
7. `api-controls.ts` defines reusable frontend request probes for covered routes and the missing handler guard.

The mock controls open in a full width bottom sheet over a subtle black backdrop. Clicking the backdrop dismisses the sheet. A persistent Caregiver view switch changes the mocked current account role and remounts the application, so normal role routing opens the caregiver dashboard with a linked mock patient. Top level tabs separate connections, glucose events, knowledge base data, AI chat, notifications, and API controls. Separate CGM and insulin pump tabs keep the connection checkboxes manageable as new integrations are added. Connection checkboxes, glucose events, AI chat scenarios, and live stream selections take effect immediately. Any number of CGM and insulin data connections can be enabled, including none. The first selected connection remains the primary source for generated history and source specific payloads. The Knowledge base tab controls the deterministic document count returned by the knowledge endpoints. Set it to 21 or more to exercise pagination on the V2 Knowledge Base page. The mock endpoint applies the same page, page size, trust tier, and source name search parameters as the real endpoint. The AI chat controls cover a connected provider, no configured provider, an unavailable server, a slow response, a provider generation error, an empty provider response, and a provider that disconnects when a message is sent. The notification controls trigger neutral, success, warning, error, and queue examples through the V2 notification context. These actions are transient and are not stored in mock runtime state. The API tab can run real frontend requests through MSW, configure endpoint specific failures, trigger a failed Tandem automatic sync, or enable a complete mock API outage. The Tandem automatic sync trigger changes the mocked status response so the product notification path is exercised. During an outage, the first handler returns `503` for every `/api/*` request, including otherwise uncovered routes. Disabling the outage restores normal explicit handlers and the final `501` guard. `MockProvider.tsx` listens for runtime state changes and remounts the application content so existing API hooks fetch the selected scenario without a browser reload. CGM backfill days and the knowledge document count keep explicit buttons because numeric values must be completed before they are applied.

The mock service fails closed for API routes. If the browser requests an `/api/*` endpoint without a mock handler, the catch all handler returns `501` with a clear missing handler message. That prevents silent success when a new API route has not been modeled yet.

## Development Only Boundary

The mock runtime is guarded by `NODE_ENV === "development"`. Production builds do not start MSW, and the production Docker image removes `public/mockServiceWorker.js` from the runtime image.

The mock service does not write to the real backend. It stores temporary mock state in browser `localStorage`, for example the selected account role, CGM connections, insulin data connections, backfill duration, knowledge document count, live stream mode, selected glucose event, AI chat scenario, and complete API outage mode.

## Basic Flow

When mock mode is active:

1. The dashboard asks the normal API client for glucose history.
2. The browser sends a request to `/api/integrations/glucose/history?minutes=1440&limit=288`.
3. MSW matches that route in `handlers.ts`.
4. The handler reads the current mock runtime state from `localStorage`.
5. `data.ts` generates a CGM history response using the primary selected CGM connection.
6. The dashboard receives a normal `GlucoseHistoryResponse` and renders as if it came from the real API.

The dashboard does not need special mock specific code. It only sees the same API contract it already uses.

Glucose history, glucose stats, and time in range endpoints filter the same generated readings by the requested start and end timestamps. History responses still honor their pagination limit. Aggregate stats and time in range calculations use every reading in the selected window when no limit is requested, so their counts and percentages match the glucose trend range.

## Example Glucose Reading Mock

The glucose generator creates readings at a five minute cadence. It starts from a repeatable daily glucose pattern, adds source specific sensor bias, then optionally blends the most recent hour toward a selected event target.

For example, an urgent low scenario targets the latest readings toward `48 mg/dL`:

```ts
type MockGlucoseEvent =
  "baseline" | "low" | "urgent-low" | "high" | "urgent-high";

function glucoseEventTarget(event: MockGlucoseEvent): number | null {
  const targets: Record<MockGlucoseEvent, number | null> = {
    baseline: null,
    low: 62,
    "urgent-low": 48,
    high: 215,
    "urgent-high": 285,
  };

  return targets[event];
}

function mockGlucoseValueAtMinutesAgo(
  minutesAgo: number,
  baselineValue: number,
  event: MockGlucoseEvent,
): number {
  const target = glucoseEventTarget(event);

  if (target === null || minutesAgo > 60) {
    return baselineValue;
  }

  const blend = 1 - minutesAgo / 60;
  return Math.round(baselineValue * (1 - blend) + target * blend);
}
```

That means old history remains a realistic generated day, while the latest readings can simulate a low, urgent low, high, or urgent high. The alert and live stream mocks then derive their payloads from the same generated readings.

The baseline pattern also includes brief deterministic excursions roughly once per seven day cycle. One excursion crosses the urgent low threshold and one crosses the urgent high threshold, while most readings remain in range. This keeps common multi day chart views useful without making every day look unstable.

Automated pump basal history starts from a time of day schedule, then varies with glucose, activity mode, and seeded daily variation. Predicted low suspensions align with the occasional urgent low pattern instead of appearing every day.

Closed loop sources report their automation engine through pump status. Loop can also report a named active override. AAPS uses temporary targets through Nightscout treatments instead, so the AAPS mock does not fabricate a Loop style override.

## What MSW Gives Us

MSW is useful here because it intercepts requests at the network boundary instead of forcing every component to import mock data directly. This keeps application code honest:

1. Components still use the real API client.
2. Request URLs, methods, query parameters, and response shapes stay visible.
3. Missing API coverage is obvious through the `501` guard.
4. Developers can switch scenarios without changing component code.

This is intentionally different from seeding fake records in a backend database. The mock service is for local development and UI review. It should not become a production data ingestion path.
