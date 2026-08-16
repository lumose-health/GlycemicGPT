---
title: Gated Environments
description: How gated GitHub Environments hold privileged secrets, and how to add a consumer.
---

# Gated Environments

Privileged CI secrets -- 1Password service-account (SA) tokens, release
signing material -- live behind gated GitHub Environments so that a
poisoned same-repo workflow cannot read them. This is the native remediation
for the pipeline-privilege-escalation (PPE) class: a required-reviewer gate
binds to the job that declares `environment:`, and a job that does **not**
declare it resolves the secret to the empty string. On a reviewer-protected
environment there is no way to read a gated secret without a human approval.
(Three documented reviewerless exceptions exist, each with its own recorded
justification in `check-secret-invariants.py`: the `release-gated`
environment on the private `glycemicgpt-discord-bot` repo cannot carry a
reviewer rule on the org's plan, and the **monorepo's** and **website's**
`release-gated` run reviewerless by design under the release-gate pattern's
verified-isolation argument -- see their section below.)

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
| Deployment branch policy | custom: `main` only | Purely *additive* defense-in-depth: a `workflow_dispatch` from an attacker-pushed feature branch (carrying a tampered local composite) cannot even reach the approval prompt. It never substitutes for the reviewer -- and the converse holds too: a ref that IS on the policy list always passes, whoever triggered the run (the policy binds the ref, not the actor), which is why workflows containing gated jobs must not carry `workflow_dispatch` at all unless the environment's reviewer is pinned as the load-bearing control (MI-1 in `check-secret-invariants.py`). Use a **custom** pattern, never the "protected branches" option, which admits the read for same-repo PRs against a protected base. |
| Deployment-protection apps | none | An auto-approver app would silently defeat the human pause. |

The SA token exists **only** as this environment's secret: never as a plain
repo secret and never as an organization secret (both are ungated to
non-environment jobs). The scheduled `secrets-hygiene.yml` audit
(`check-secret-invariants.py`) drift-checks this: every environment must keep
`required_reviewers >= 1` unless it is pinned in one of the two reviewerless
classes (`REVIEWERLESS_ENV_BASELINE`, `ISOLATION_REVIEWERLESS_ENVS`), and a
gated secret must not reappear as a plain copy.

## `release-gated`

**Label: release credentials / live consumers.** Exists on the monorepo,
`website`, `android-unofficial`, and `glycemicgpt-discord-bot`. It holds the
`RELEASE_APP_ID` / `RELEASE_APP_PRIVATE_KEY` GitHub App key (formerly an
org-wide secret) on every repo. The monorepo no longer builds or signs Android
APKs -- the four release-signing keystore secrets that used to live here
(`RELEASE_KEYSTORE_BASE64`, `RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS`,
`RELEASE_KEY_PASSWORD`) were retired from this repo entirely once the mobile
tree moved to `android-unofficial`, which now holds its own copies for its own
signing pipeline. The 1Password items remain escrow only; CI reads the
environment secrets directly.

Consumers are every RELEASE- or MERGE-minting job: `changelog-pr.yml`
(`changelog`, `merge-changelog`), `sync-main-to-develop.yml` (`sync`),
`release.yml` (`release-please`, `auto-merge-release`, `fallback-release`,
`update-release-body`), and the equivalent jobs on the sibling repos. On the
monorepo and on `website` (ported 2026-08-15; its only gated workflow is
`changelog.yml`) these are `push: main`-only jobs (Class A: the branch policy
plus MI-1 are the whole reachability surface) -- MI-1 in
`check-secret-invariants.py` forbids `workflow_dispatch` on any workflow
containing a gated job, because a dispatch on a policy-listed trunk passes
the deployment branch policy (the policy binds the ref, not the actor).
`android-unofficial`'s equivalent jobs still carry `workflow_dispatch` until
it is ported to MI-1 per the release-gate porting checklist (the scheduled
audit surfaces them as `MI1-PENDING` warnings). On that reviewer-protected
repo each gated job pauses for reviewer approval before the key is in scope,
so a single release run can prompt **more than once** as successive jobs
start; an unapproved job strands that run, and downstream jobs that need
`release_created` skip rather than hang if `release-please` is rejected. On
the three reviewerless exceptions -- the monorepo and `website`, both by
verified isolation (below), and `glycemicgpt-discord-bot` by plan
limitation (below) -- jobs do **not** pause: their secrets are
environment-scoped, not approval-gated.

Configuration differs from `op-github-gated` in three deliberate ways:

- **The monorepo and `website` `release-gated` carry no reviewer rule:
  reviewerless by verified isolation.** This is the release-gate pattern's
  `release-auto` posture: every *use* of the environment's credentials on
  either repo is revertible bookkeeping (version bumps, changelog PRs,
  release bodies, PR auto-merge, main->develop sync; on website, the
  changelog PR open-and-merge) -- though the MERGE key itself
  remains a durable org-ruleset bypass, which is why the argument bounds
  exactly who else holds one. The load-bearing claim -- the gated secrets
  resolve **only** for a `push: main` run of a workflow copy on `main`,
  no non-lead actor can move `main`, and only a lead-merged PR
  puts a workflow copy there -- is pinned per repo in
  `ISOLATION_REVIEWERLESS_ENVS` in `check-secret-invariants.py` and
  re-verified on every audit in three legs: a `main`-only **custom**
  deployment branch policy (`ENV-ISOLATION-POLICY`); `main` unpushable by
  any non-lead actor -- the pinned `pull_request` + `update` rulesets
  stay active on `main`, each ruleset's bypass-actor list stays within
  its own pinned bound, the lead stays the only admin, and the default
  branch stays `main`
  (`ENV-ISOLATION-RULES`/`-BYPASS`/`-ADMINS`/`-BRANCH`); and MI-1 holding
  for every job declaring the environment (`ENV-ISOLATION-MI1`). One
  caveat on the bypass bound: GitHub reveals a ruleset's bypass-actor
  list only to ruleset-**write** callers, and the audit app is
  deliberately read-only, so the scheduled audit cannot compare the
  list directly. It instead verifies that the list *cannot have
  changed* without the lead -- single lead admin plus no app
  installation holding administration write -- and surfaces the
  deferral as a standing `ENV-ISOLATION-BYPASS-REDACTED` warning; the
  actual bound is compared on privileged (user-token) runs during the
  periodic review. Any
  broken leg fails the audit; the remediation is restoring the leg or
  restoring the reviewer, never widening the pin. A reviewer
  *reappearing* is flagged too (`ENV-PROTECTION`): posture changes in
  either direction must be reviewed edits. This posture is only sound
  because dispatch reachability was closed first -- reviewerless *and*
  dispatch-reachable is exactly the PPE this page exists to prevent,
  which makes the cutover ordering load-bearing: the change that
  removes `workflow_dispatch` from a repo's gated workflows must be
  merged **before** the lead deletes that repo's reviewer rule, never
  after.

  **The website port is a trade the monorepo accepts, stated plainly:
  website `main` formally joins the monorepo-`main` trusted base.**
  Website's copy of the org-wide RELEASE/MERGE keys was previously
  guarded by website's required reviewer; it is now guarded by website's
  own pinned isolation legs, re-verified on every audit by the same leg
  checks as the monorepo's own -- not by a human. An actor who could land
  a workflow copy on website `main` could mint MERGE, an org-ruleset
  bypass that reaches the monorepo's `main`, which is why the monorepo's
  pin names this reliance explicitly instead of leaving it inferred. The
  content checkpoint that replaces website's deploy-time reviewer:
  website's CODEOWNERS assigns `*` and `.github/` to the lead, and
  code-owner review is required on website `main` (org ruleset
  `Protect main`; the requirement is pinned in
  `required_rule_parameters` and re-verified every audit), so every
  **human-authored** PR into website `main` needs the lead's approval
  before it can merge. The one actor that merges past that review --
  the `lumose-web-merge` app, which auto-merges green Renovate PRs
  under its own audited confinement contract -- refuses to carry any
  PR touching `.github/` (a guard in website's `renovate-automerge.yml`,
  itself under `.github/` and therefore lead-reviewed to change), so no
  unreviewed merge can alter website's gated workflow surface;
  unreviewed dependency bumps outside `.github/` cannot reach it.

  **Stated residual risk.** The removed reviewer was also a deploy-time
  checkpoint on workflow *content*: a human saw every gated run before
  the secrets resolved. The isolation legs bind the **ref** that runs,
  not what the ref contains. What replaces the reviewer on that path is
  `main`'s own PR ruleset, which requires **code-owner** review: the
  monorepo's CODEOWNERS assigns `/.github/workflows/` and
  `/scripts/security/` to the lead -- so a promotion PR that edits a
  gated job's step body cannot merge to `main` without the lead's
  code-owner approval, and the `update` rule keeps any non-lead from
  moving `main` around it. The gap this leaves is narrow: an edit that
  reaches a gated secret *without* touching a code-owned path, which
  this file's bypass/SA reference invariants are the backstop for. On
  website every PR path is code-owned (its CODEOWNERS assigns `*`) --
  though the CODEOWNERS assignment itself is asserted, not audited: the
  audit pins the code-owner-review *requirement*, but no check reads
  the CODEOWNERS file. Website also has no PR-time run of the invariant
  script (the monorepo runs `--repo-local` on every PR via
  `workflow-lint.yml`), so its legs are detective-only via the
  scheduled and push-triggered live audits. Accepted residuals; tracked
  hardenings: audit CODEOWNERS content, port the `--repo-local` step to
  website CI, and extend code-owner review to `.github/workflows/**` on
  the monorepo's **develop** (develop's PR rule requires zero approvals
  today) -- the last being a ruleset change, outside the release-gate
  pattern's scope.
- **`prevent_self_review = false` on `android-unofficial`'s
  reviewer-bearing `release-gated` environment.** On a `push: main` run
  the trigger is lead-only -- pushes to `main` are restricted to
  promotion merges the lead performs -- so the triggerer and the only
  sensible approver are the same person. This repo has **not** yet been
  MI-1 ported and still carries `workflow_dispatch` on its gated jobs
  (the audit surfaces this as `MI1-PENDING`), so a dispatch run *is*
  reachable by a non-lead write actor; there the required **reviewer**
  is the load-bearing control, and it holds regardless of who dispatched
  -- only the lead is in the reviewer set, and the modeled attacker (a
  non-admin write actor) is not. That is the difference from the
  monorepo and website, which removed dispatch reachability so their
  reviewers could come off; here the reviewer stays until
  android-unofficial is ported. (An earlier form of this
  rationale leaned on "the lead is the only write-capable collaborator";
  the area write delegation ended that, which is exactly why dispatch
  reachability had to be closed rather than reasoned away.) Approval
  authority itself never widens: whoever triggers a run, only the
  required reviewer (the lead) can approve it -- `prevent_self_review =
  false` merely stops the lead's own promotions from deadlocking on a
  second human. With a single-lead reviewer set,
  `prevent_self_review = true` would stall every release without
  excluding any realistic attacker. All other conditions --
  `can_admins_bypass = false`, custom additive branch policy, no
  auto-approver apps -- are unchanged. Revisit this setting if the
  reviewer set ever widens.
- **`glycemicgpt-discord-bot` carries no reviewer rule at all.** The repo is
  private, and on the org's current plan the required-reviewer rule is
  rejected for private repos (empirically: the API returns HTTP 422
  "billing plan" for the reviewer rule, while custom deployment branch
  policies on the same environment are accepted and live -- they are not
  the same plan gate). Compensating controls, all **verified** by the
  drift audit rather than assumed: a `main`-only custom branch policy
  (`ENV-REVIEWERLESS-POLICY` fires if removed or widened), zero
  non-admin write actors (`ENV-REVIEWERLESS-TRIPWIRE`), a single admin
  (`ENV-REVIEWERLESS-ADMINS`), and the repo staying private
  (`ENV-REVIEWERLESS-PUBLIC` -- if it ever goes public, add the reviewer
  rule and remove the pin).

The monorepo's own release-signing smoke test (formerly `release-signing-smoke.yml`, which
built and verified the Android release APKs' signing certificate) was retired along with the
keystore secrets -- APK signing verification now lives in `android-unofficial`'s own workflows
against its own copy of the `release-gated` environment.

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
the dispatcher. And because the branch policy admits only `main`, dispatch
the smoke from that ref.

Give the `canary` field a distinctive value (e.g. `backend-actions-plumbing-ok`),
not a short common string: `load-secrets-action` masks the resolved value
run-wide, and masking a 2-character token would garble unrelated words in the
logs.
