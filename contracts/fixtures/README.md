# Contract fixtures

Deterministic, **hand-authored** JSON examples of wire shapes described by
`../openapi.json`. This is the one exception to the parent directory's "never
hand-edit" rule: everything else under `contracts/` is generated output, but
these files are test data, checked in like any other fixture.

Each file is one canonical example of a response or event payload. Both
languages validate every file against the same generated types so a shape
never quietly drifts between what the backend defines, what the fixture
claims, and what a client expects:

- **Python** (`apps/api/tests/test_contract_fixtures.py`) parses each file
  through the Pydantic model that defines the shape and round-trips it.
- **TypeScript** (`apps/web/src/mocks/fixtures.ts`) imports each file and
  types it against `Schemas["..."]`, generated from this same contract
  (`apps/web/src/generated/api-schema.ts`). A backend shape change that isn't
  reflected here fails `tsc` at the `satisfies` check.

They are also intended for the Kotlin and Swift client phases to validate
against once those generators exist.

## Adding a fixture

1. Pick the Pydantic response/event schema it represents.
2. Write realistic, deterministic values -- no `now()`, no random data. Respect
   platform safety invariants (glucose 20-500 mg/dL canonical mg/dL, insulin in
   units, basal rate in units/hour).
3. Add it to both validation suites: a case in
   `apps/api/tests/test_contract_fixtures.py` and an import + `satisfies` in
   `apps/web/src/mocks/fixtures.ts`.
