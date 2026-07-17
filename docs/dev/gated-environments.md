---
title: Gated Environments
description: How approval-gated GitHub Environments hold privileged secrets, and how to add a consumer.
---

# Gated Environments

Privileged CI secrets -- 1Password service-account (SA) tokens, release
signing material -- live behind approval-gated GitHub Environments so that a
poisoned same-repo workflow cannot read them. This is the native remediation
for the pipeline-privilege-escalation (PPE) class: a required-reviewer gate
binds to the job that declares `environment:`, and a job that does **not**
declare it resolves the secret to the empty string. There is no way to read a
gated secret without a human approval.

This page describes `op-github-gated`, the reference environment, and how to
add a consumer without weakening the gate.

## `op-github-gated`

**Label: pre-gated bootstrap / no consumers.** (GitHub Environments have no
description field, so the label lives here.) The environment holds
`BACKEND_ACTIONS_SERVICE_ACCOUNT` -- the monorepo's read-only 1Password SA
token, which resolves `op://github/...` references. It has **zero production
consumers today** (the `secrets-plumbing-check` smoke is the only workflow
that exercises it); it is provisioned ahead of the secret migration.

Any *future* consumer of this token must independently prove it is safe (a
"Class-A" job: gated environment, no PR-head code execution while the token is
in scope). An unattended consumer of a whole-vault SA token would recreate the
PPE with vault-wide reach.

### Protection configuration (the load-bearing conditions)

| Setting | Value | Why |
|---|---|---|
| Required reviewers | the maintainer lead (outside the write-actor set) | The gate. A job declaring the environment pauses here before any step runs. |
| `prevent_self_review` | `true` | The dispatcher of a run cannot approve their own deployment. |
| `can_admins_bypass` | `false` | An admin cannot skip the reviewer gate. This is **not** the same as branch/ruleset merge bypass, which is unrelated. |
| Deployment branch policy | custom: `main`, `develop` (protected trunks) | Purely *additive* defense-in-depth: a `workflow_dispatch` from an attacker-pushed feature branch (carrying a tampered local composite) cannot even reach the approval prompt. It never substitutes for the reviewer. Use a **custom** pattern, never the "protected branches" option, which admits the read for same-repo PRs against a protected base. |
| Deployment-protection apps | none | An auto-approver app would silently defeat the human pause. |

The SA token exists **only** as this environment's secret: never as a plain
repo secret and never as an organization secret (both are ungated to
non-environment jobs). The scheduled `secrets-hygiene.yml` audit
(`check-secret-invariants.py`) drift-checks this: every environment must keep
`required_reviewers >= 1`, and a gated secret must not reappear as a plain
copy.

## `release-gated`

**Label: release credentials / live consumers.** Exists on the monorepo,
`website`, `android-unofficial`, and `glycemicgpt-discord-bot`. It holds the
`RELEASE_APP_ID` / `RELEASE_APP_PRIVATE_KEY` GitHub App key (formerly an
org-wide secret) on every repo, plus -- on the monorepo only -- the four
android release-signing keystore secrets (`RELEASE_KEYSTORE_BASE64`,
`RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD`).
The 1Password items remain escrow only; CI reads the environment secrets
directly.

Consumers are every RELEASE-minting job: `changelog-pr.yml` (`changelog`) and
`release.yml` (`release-please`, `fallback-release`, `release-android-apk`,
`update-release-body`), and the equivalent jobs on the sibling repos. All are
`push: main` / `workflow_dispatch` jobs (Class A, pause-tolerant): each run
now pauses for one reviewer approval before the key is in scope.

Configuration differs from `op-github-gated` in two deliberate ways:

- **`prevent_self_review = false`.** The release trigger is already
  lead-only: pushes to `main` are restricted to promotion merges the lead
  performs, so the dispatcher and the only sensible approver are the same
  person. With a single-maintainer topology, `prevent_self_review = true`
  would deadlock every release on a second human without excluding any
  realistic attacker (an attacker who can trigger `push: main` already has
  lead credentials). All other conditions -- `can_admins_bypass = false`,
  custom additive branch policy, no auto-approver apps -- are unchanged.
- **`glycemicgpt-discord-bot` carries no reviewer rule at all.** The repo is
  private and the org plan only supports environment protection rules on
  public repos. Compensating controls: a `main`-only custom branch policy and
  zero non-admin write actors, both drift-checked (`ENV-REVIEWERLESS` /
  `ENV-REVIEWERLESS-TRIPWIRE` in `check-secret-invariants.py`). Add the
  reviewer rule if that repo ever goes public.

`release-signing-smoke.yml` (`workflow_dispatch`) proves the monorepo
plumbing without cutting a release: the gated job mints a RELEASE app token,
signs `:app` / `:wear-device` / `:watchface` from the environment-held
keystore, and asserts the signing certificate SHA-256 still matches the
shipped release cert (the frozen signing identity); the no-environment job
asserts all six secrets resolve `len=0` outside the gate.

## The `op-load-secrets` composite

`.github/actions/op-load-secrets/action.yml` is the reference composite for
loading secrets from 1Password inside a gated job. It mirrors
android-unofficial's `op-load-signing-secrets`:

1. **Fail-closed preflight** -- errors if `OP_SERVICE_ACCOUNT_TOKEN` is unset
   (which is what happens outside the gated environment).
2. **SHA-pinned 1Password actions** -- `install-cli-action` and
   `load-secrets-action`, pinned by commit with a version comment.
3. **Text fields** via `load-secrets-action` with `export-env: true`, the
   1Password field name identical to the exported env-var name (no renaming).
4. **File attachments** via `op read --out-file` under `umask 077` with a
   pre-delete, an `ERR` trap, and `chmod 600` -- `load-secrets-action` cannot
   resolve file attachments.
5. **Caller sets `OP_SERVICE_ACCOUNT_TOKEN` at job env** -- a composite cannot
   read the `secrets` context, so the token is mapped by the calling job and
   inherited, never re-declared here.
6. **Caller-side `if: always()` cleanup** -- a composite cannot register a
   post-job step, so the caller removes any materialized file.

### op:// references are hardcoded on purpose

The SA token's 1Password scope is **vault-level** -- it can read any item in
the vault -- so the hardcoded `op://` reference is **not** access control on
the token. It is the only item-level control in the *caller chain*: it stops a
poisoned caller from repointing the whole-vault token at another item.
**Prefer a per-purpose composite with hardcoded references over a generic
`item`-input composite**, which would hand a poisoned caller exactly that
repoint. True item-level isolation of the token itself requires per-purpose
scoped service accounts or a `github`-vault split -- tracked as a follow-up,
and the reason a *future* consumer of this whole-vault token must independently
prove it is safe.

## Adding a consumer

1. Copy `op-load-secrets` to a per-purpose composite; swap the hardcoded
   `op://` references for your item's fields/attachments and rename the
   exported env vars to match the field names.
2. Give the consuming job `environment: op-github-gated` (job level -- a
   reusable workflow's `on.workflow_call` and a composite both cannot declare
   it, so the job is the gate point) and map
   `OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.BACKEND_ACTIONS_SERVICE_ACCOUNT }}`
   at job env.
3. Never reference the SA token in a `pull_request` / `pull_request_target`
   workflow (`check-secret-invariants.py` flags this as `SA-REF-PR`).
4. When you move a secret behind the environment, delete every plain repo and
   organization copy in the same change, and add the environment to
   `EXPECTED_GATED_ENVIRONMENTS` in `check-secret-invariants.py`.

## Proving the plumbing

`secrets-plumbing-check.yml` (`workflow_dispatch`) proves the pattern without
touching a real secret:

- The **gated** job declares the environment, pauses on the reviewer, and --
  once approved -- resolves the non-secret `canary` field via the composite.
- The **no-environment** job resolves `BACKEND_ACTIONS_SERVICE_ACCOUNT` and
  asserts it is empty (`len=0`); a non-empty value means a plain copy still
  exists outside the gate.

Because `prevent_self_review = true`, the approver must be someone other than
the dispatcher. And because the branch policy admits only `main`/`develop`,
dispatch the smoke from one of those refs.

Give the `canary` field a distinctive value (e.g. `backend-actions-plumbing-ok`),
not a short common string: `load-secrets-action` masks the resolved value
run-wide, and masking a 2-character token would garble unrelated words in the
logs.
