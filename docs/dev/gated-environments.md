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
token, which resolves `op://github/...` references. It has **zero runtime
consumers today**; it is provisioned ahead of the secret migration and proven
only by the `secrets-plumbing-check` smoke.

Any *future* consumer of this token must independently prove it is safe (a
"Class-A" job: gated environment, no PR-head code execution while the token is
in scope). An unattended consumer of a whole-vault SA token would recreate the
PPE with vault-wide reach.

### Protection configuration (the load-bearing conditions)

| Setting | Value | Why |
|---|---|---|
| Required reviewers | the lead (`jlengelbrecht`) | The gate. A job declaring the environment pauses here before any step runs. |
| `prevent_self_review` | `true` | The dispatcher of a run cannot approve their own deployment. |
| `can_admins_bypass` | `false` | An admin cannot skip the reviewer gate. This is **not** the same as branch/ruleset merge bypass, which is unrelated. |
| Deployment branch policy | none | A branch policy can only *add* restriction on top of the reviewer; it must never substitute for it. The "protected branches" option in particular admits the read for same-repo PRs against a protected base. |
| Deployment-protection apps | none | An auto-approver app would silently defeat the human pause. |

The SA token exists **only** as this environment's secret: never as a plain
repo secret and never as an organization secret (both are ungated to
non-environment jobs). The scheduled `secrets-hygiene.yml` audit
(`check-secret-invariants.py`) drift-checks this: every environment must keep
`required_reviewers >= 1`, and a gated secret must not reappear as a plain
copy.

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

The SA token's 1Password scope is **vault-level**, so the hardcoded `op://`
reference in the composite is the *only* item-level control anywhere in the
chain. **Prefer a per-purpose composite with hardcoded references over a
generic `item`-input composite** -- a generic composite would let a poisoned
caller point the whole-vault token at any item.

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
the dispatcher.
