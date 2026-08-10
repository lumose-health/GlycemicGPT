---
name: glycemicgpt-mock-service
description: Understand and safely modify the GlycemicGPT development only MSW web mock API. Use when investigating, debugging, testing, documenting, adding endpoints to, or changing mock data, scenarios, runtime activation, request handlers, generated responses, the development control panel, or the mock service worker in apps/web.
---

# GlycemicGPT Mock Service

Use the repository implementation and API contracts as the source of truth. Do not rely on generic MSW assumptions when the local design answers the question.

## Read Before Acting

Always read:

1. `AGENTS.md`, especially `Web Mock Data Service`
2. `docs/dev/mock-data-service.md`

Then load only the source needed for the task:

1. For activation and production boundaries, read `apps/web/src/middleware.ts`, `apps/web/src/app/layout.tsx`, `apps/web/src/mocks/server.ts`, `apps/web/src/mocks/MockProvider.tsx`, `apps/web/src/mocks/browser.ts`, and `apps/web/Dockerfile`.
2. For scenarios and developer controls, read `apps/web/src/mocks/types.ts`, `apps/web/src/mocks/state.ts`, and `apps/web/src/mocks/DevMockPanel.tsx`.
3. For request behavior, find the endpoint in `apps/web/src/mocks/handlers.ts`, then inspect the response builder in `apps/web/src/mocks/data.ts` and the real API client or contract used by the calling feature.
4. For tests, read the colocated mock tests plus `apps/web/__tests__/middleware.test.ts` when activation is relevant.

Use `rg` to locate an endpoint or builder before reading the large handler and data files in full.

## Understand the Runtime

Activation is request scoped at first render:

1. A browser sends `x-glycemicgpt-mock-api: 1` on the initial request.
2. Middleware honors it only when `NODE_ENV` is `development`. It also treats the request as authenticated for protected dashboard routes and forwards the header.
3. The root layout reads the header and passes the result to `MockProvider`.
4. The provider waits for `startMockWorker()` before rendering the application. Worker startup is memoized, failed starts can retry, and the panel reports failure as `MSW inactive`.
5. The worker intercepts normal `/api/*` calls in the browser. No product component should need mock specific branches.

Request handling follows this path:

1. `handlers.ts` reads request parameters and the current runtime state.
2. It obtains a generated snapshot cached by serialized state and a five minute time bucket.
3. Builders in `data.ts` return deterministic glucose, pump, integration, alert, insight, brief, and settings payloads.
4. Explicit handlers return the same response shapes and status codes expected from the real API.
5. The final catch all handler returns `501` for any uncovered `/api/*` route. Handler order is therefore part of the contract.

Baseline generated data is deterministic but intentionally varied. A seven day cycle includes one brief urgent low excursion and one brief urgent high excursion. Automated basal delivery follows a scheduled profile, then responds to glucose, activity mode, and seeded daily variation. Predicted low suspensions occur with the periodic low excursion rather than every day.

Glucose history, stats, and time in range builders share the same selected window filter. Only history responses apply the default pagination limit. Aggregate endpoints must use every filtered reading unless the request explicitly supplies a limit, otherwise dashboard summaries drift from the glucose trend chart.

Runtime state follows these rules:

1. `types.ts` defines all valid sources, events, limits, and defaults.
2. `state.ts` normalizes every stored value and persists browser state under `glycemicgpt:mock-runtime`.
3. Browser state writes dispatch `glycemicgpt:mock-state-change` and update `updatedAt`, which also invalidates the snapshot cache key.
4. Node based handler tests use the in memory state fallback because `localStorage` is unavailable.
5. Generated daily briefs and insight responses use their own browser storage keys in `data.ts`.
6. Scenario controls persist on selection. `MockProvider` subscribes to state changes and remounts application content so normal API hooks refetch without a browser reload. Backfill days keep an explicit action because the numeric input must be complete before applying it.

Production has two defenses. Development modules are loaded only behind `NODE_ENV === "development"`, and the production image removes `public/mockServiceWorker.js`.

## Change Workflow

1. Trace the real frontend request and its TypeScript contract. Inspect the backend route when the contract or status behavior is unclear.
2. Decide the correct ownership layer. Put deterministic construction and derived calculations in `data.ts`. Put HTTP parsing, response status, and endpoint side effects in `handlers.ts`.
3. Reuse existing builders where possible. Keep dates, limits, units, source identifiers, and empty states consistent across related endpoints.
4. Add the explicit handler before the final guard. Never weaken the guard or allow an unmatched API call to reach a real backend.
5. Add runtime state only for behavior that developers must control across requests. Update `MockRuntimeState`, defaults, normalization, options, panel controls when applicable, and state tests together.
6. Write mutations through `setMockRuntimeState`. Do not mutate the cached snapshot or browser storage directly from a handler.
7. Keep the application mock agnostic. Do not import `src/mocks` from normal feature components or replace API clients with mock specific code.
8. Update `docs/dev/mock-data-service.md` and `AGENTS.md` if activation, architecture, ownership, safety boundaries, or the contributor workflow changes.

## Testing Workflow

Add direct behavioral tests at the changed boundary:

1. Test pure generation and derived responses in `apps/web/src/mocks/data.test.ts` with a fixed date and explicit state.
2. Test normalization, persistence, limits, and subscriptions in `apps/web/src/mocks/state.test.ts`.
3. Test endpoints through MSW's public `setupServer(...handlers)` and `fetch` flow in `apps/web/src/mocks/handlers.test.ts`. Do not test handler source text or private MSW APIs.
4. Test worker startup and failure states in `apps/web/src/mocks/MockProvider.test.tsx`.
5. Test request gating, auth bypass, and header forwarding in `apps/web/__tests__/middleware.test.ts`.

Run focused tests while iterating. Before completion, run from `apps/web`:

```sh
npm test
npm run typecheck
npm run build
```

For runtime or control changes, reuse the app on port `3003`, enable the request header before loading the dashboard, confirm the panel says `MSW active`, exercise the changed scenario, and inspect the intercepted response. Do not start a second web server on another port.

## Critical Rules

1. Keep mock mode opt in, browser side, and development only.
2. Never seed a real backend or send fake data to a real API.
3. Keep production components on real API contracts.
4. Keep the `501` API guard last.
5. Preserve deterministic output for fixed state and time.
6. Verify behavior through requests, not implementation text.
