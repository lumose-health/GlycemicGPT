# Contract fixtures

Deterministic, **hand-authored** JSON examples of wire shapes described by
`../openapi.json`. This is the one exception to the parent directory's "never
hand-edit" rule: `openapi.json` is generated output, these files are test data,
checked in like any other fixture. `scripts/regen-contracts.sh` does not touch
them.

Each file is one canonical example of a response or event payload, and both
languages validate every file so a shape never quietly drifts between what the
backend defines, what the fixture claims, and what a client expects:

- **Python** (`apps/api/tests/test_contract_fixtures.py`) parses each file
  through the **Pydantic model that authors the shape** — the source of truth
  the OpenAPI document is generated *from*, not the generated document — and
  round-trips it. It also compares key sets, so a field the backend removed
  fails here instead of lingering in the shared JSON (Pydantic silently ignores
  unknown keys).
- **TypeScript** (`apps/web/src/mocks/fixtures.ts`) imports each file and
  `satisfies` it against the corresponding `@/lib/api` alias over the generated
  types (`apps/web/src/generated/api-schema.ts`). Most fixtures go through an
  alias rather than a raw `Schemas[...]` because FastAPI marks an
  `Optional[X] = None` field "not required" even when it always serializes it;
  the aliases re-widen those back, so a fixture cannot drop an always-sent
  field and still type-check.

They are also intended for the Kotlin and Swift client phases to validate
against once those generators exist.

## What a type check cannot catch

Several fields are plain `str` on their schemas — `control_iq_reason`,
`source`, `alert_type`, `severity`, `pump_activity_mode`, and
`BolusReviewItem.event_type`. A fabricated value passes both the Pydantic parse
and `tsc`. The Python suite therefore also asserts the first five against the
enum or the pinned allowlist the **producing code** writes, and derives the
alert fixtures by replaying their own inputs through the real alert engine.

`BolusReviewItem.event_type` is the deliberate inverse. Its fixture exists to
carry a value the backend has *never* emitted, so it is asserted to be **outside**
`PumpEventType` — proving an unknown event type survives that loose `str` field
(instead of 422ing a whole review response) while still being rejected by every
closed-enum surface, and that consumers drop it rather than guessing it into a
bolus. That looseness is a known gap tracked as GLY-241, not a design choice.

If you add a fixture with a free-form string field, add its membership assertion
too — otherwise the fixture is only shape-checked, which is how the first cut of
these files ended up carrying seven values the backend cannot emit.

## Filename convention

`<subject>.json`, or `<subject>_<variant>.json` where one subject has several
wire forms worth pinning: `pump_event_*.json` for the pump/insulin event kinds,
`live_alert_event.json` vs `live_alert_event_caregiver.json` for the two forms
of the same SSE payload. The name is the key used in both languages' inventories,
so renaming a file means editing both.

## Time in a fixture

Every timestamp is fixed — no `now()`, no random data. A fixture's own
`timestamp` / `event_timestamp` / `created_at` is the **reference clock** for any
staleness or interval math a consumer does with it: compare fixture fields with
each other (`received_at` vs `reading_timestamp`, `resume` vs `suspend`), never
against the wall clock, or the test rots the moment the date passes.

## Adding a fixture

Three edits, each glob-checked so a missed one is a red test rather than an
unvalidated file:

1. The JSON itself. Pick the Pydantic response/event schema it represents, and
   take the values from the mapper or service that actually writes them. Respect
   the platform safety invariants: glucose 20-500 mg/dL, storage and transport
   canonical mg/dL (mmol is display-only), insulin in units, basal rate in
   units/hour.
2. Its filename in the inventory in `apps/api/tests/test_contract_fixtures.py`
   (`PUMP_EVENT_FIXTURES` / `ALL_FIXTURES`), plus a membership assertion for any
   free-form string field.
3. A typed import and a `CONTRACT_FIXTURES` entry in
   `apps/web/src/mocks/fixtures.ts`.

Note that `apps/web/tsconfig.json` excludes `fixtures.ts` — `contracts/` is
outside the web Docker build context, so `apps/web/tsconfig.fixtures.json`
type-checks it instead (both run under `npm run typecheck`).
