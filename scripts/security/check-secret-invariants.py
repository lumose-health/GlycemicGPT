#!/usr/bin/env python3
"""Org-wide secret-placement invariants and environment drift checks.

Two standing invariants (mirrors the guard comment in the website repo's
renovate-automerge.yml -- workflow_run executes the default-branch copy,
so a PR cannot substitute its own steps into a job that mints a
privileged token):

  SA invariant      No 1Password service-account token may exist as a
                    plain (non-environment) Actions secret on a repo that
                    has -- or could gain -- a write actor. Either the
                    token is environment-gated behind required reviewers,
                    or the repo is proven latent-safe (zero non-admin
                    write actors) and tripwired below.

  Bypass invariant  No workflow that wields a ruleset-bypass credential
                    (merge/release app key today; add any new bypass
                    actor's secret to BYPASS_REF_RE) may carry a
                    pull_request or pull_request_target trigger. Those
                    events run PR-controlled code -- pull_request with the
                    PR-head copy of the workflow, pull_request_target
                    with secrets in scope of PR-labelled context -- which
                    hands the bypass credential to anyone who can open a
                    pull request.

One standing confinement check (GLY-56.24 impl-5 -- the review-mandated
enforcement of the web-merge design, not a recommendation):

  WEB_MERGE confinement  The website-only auto-merge app's key
                    (WEB_MERGE_APP_ID/_PRIVATE_KEY) may exist ONLY as a
                    plain secret on the website repo, and only while
                    website has zero non-admin write actors -- the
                    fork-based premise that makes an ungated bypass key
                    non-PR-exfiltable. The app's org installation must
                    stay repository_selection=selected with exactly
                    contents:write + pull_requests:write. Any org-level
                    or off-website copy, any write actor on the holding
                    repo, and any installation-scope or permission
                    widening fails the audit. Once WEB_MERGE material
                    exists anywhere, an audit token that cannot read the
                    org installation list fails closed rather than
                    reporting an unverified confinement as clean.

One reachability invariant (the release-gate pattern; enforced per repo
via MI1_ENFORCED_REPOS as the pattern is proven and ported):

  MI-1              For every job J declaring environment E, the set of
                    (event, ref) tuples that can cause J to resolve E
                    must be a subset of {(push, b) : b in policy(E)} --
                    the deployment branch policy binds the REF, not the
                    ACTOR, so a workflow_dispatch on ref=main yields
                    github.ref=refs/heads/main and PASSES a main-scoped
                    policy, handing the gated secret's run to any write
                    actor. Five clauses: (1) gated policies are custom,
                    never protected_branches (a PR merge ref satisfies
                    "protected"), and their branch list stays within a
                    pinned bound (MI1_POLICY_BRANCH_BOUND) so widening
                    cannot pass silently; (2) no workflow containing a
                    gated job declares workflow_dispatch, and its push
                    trigger names only trusted branches; (3) hard fail on
                    pull_request_target / workflow_run /
                    repository_dispatch / workflow_call / schedule
                    reachability -- the first four run with a base or
                    default-branch github.ref, so the policy gives them
                    zero isolation, and workflow_call inherits the
                    caller's ref, which cannot be resolved statically
                    from the callee; (4) a dispatch-reachable gated job
                    that checks out repo code pins a trusted ref --
                    defense in depth only, because a dispatched run
                    executes the DISPATCHED ref's copy of the workflow
                    YAML itself, which no checkout pin can change; (5)
                    escape hatch -- where reachability cannot be proven
                    statically (dispatch-only canaries), the environment
                    must keep required_reviewers >= 1 and is pinned in
                    MI1_DISPATCH_SAFE_ENVS: that reviewer, not the branch
                    policy and not the checkout pin, is the load-bearing
                    control for dispatch reachability.

Three drift checks (scaffolding for the gated-environment migration; the
EXPECTED_GATED_ENVIRONMENTS map is populated as each secret moves behind
an approval-gated environment):

  env-secrets drift  Each gated environment must hold exactly its
                     expected secret list, and none of those secrets may
                     reappear as a plain repo secret (plain-copy re-add)
                     or as an org-wide secret (org-level re-add -- the
                     RELEASE key's pre-migration home).

  reviewer drift     Every environment on every org repo must carry a
                     required_reviewers protection rule with >= 1
                     reviewer. Pre-existing ungated environments are
                     pinned in UNGATED_ENV_BASELINE; environments that
                     cannot carry a reviewer rule (private repo on the
                     current org plan) are pinned in
                     REVIEWERLESS_ENV_BASELINE, warn while every verified
                     leg of the contract holds (main-only custom branch
                     policy, zero write actors, single admin, repo still
                     private), and fail the moment any leg breaks;
                     environments whose reviewer was deliberately REMOVED
                     on a verified-isolation argument (the release-gate
                     pattern's release-auto posture) are pinned in
                     ISOLATION_REVIEWERLESS_ENVS and must re-verify all
                     three legs of that argument on every audit (main-only
                     custom branch policy; main unpushable -- pinned rules
                     active on main with per-ruleset bypass bounds, a
                     single lead admin, default branch main; MI-1 for
                     every job declaring the environment), failing the
                     moment any leg breaks, with the pin's static
                     consistency separately enforced in every mode by
                     check_isolation_pin_consistency; any environment in
                     none of these pins fails.

  protection drift   Every gated environment must keep the reviewer-rule
                     posture pinned in GATED_ENV_PROTECTION_BASELINE:
                     prevent_self_review, can_admins_bypass, and the
                     exact typed reviewer set (User vs Team
                     distinguished). prevent_self_review is FALSE by
                     design on android-unofficial's public release-gated
                     environment (single-lead topology: the modeled
                     attacker -- a non-admin write actor -- is not in the
                     reviewer set), and the monorepo's and website's
                     release-gated carry no reviewer rule at all (see
                     ISOLATION_REVIEWERLESS_ENVS); pinning it here means
                     that accepted posture cannot drift silently, and
                     changing it requires editing the pin in a reviewed
                     PR.

Modes:
  --self-test        Run the bundled red-team fixtures and assert every
                     violation class is caught, including the evasive
                     trigger/accessor syntax variants (fail-closed
                     proof). No network. CI runs this before every live
                     audit.
  --repo-local DIR   Run the bypass/SA reference invariants against a
                     local workflow directory (used by workflow-lint on
                     every PR; no network, no token). Requires
                     --repo-name so allowlist pins resolve.
  --live             Audit the real org via the GitHub API (gh CLI;
                     needs GH_TOKEN with: repo Secrets read,
                     Environments read, Administration read, Contents
                     read; org Secrets read and org Plan read -- the
                     latter for the installation-scope repo-count guard;
                     org Administration read for the app-installation
                     listing -- without it the WEB_MERGE confinement
                     check fails closed once WEB_MERGE material exists --
                     and for the org-ruleset reads backing the
                     isolation-reviewerless leg 2, which otherwise fail
                     closed as ENV-ISOLATION-UNVERIFIED).

Trigger detection parses the workflow YAML (all documented `on:` shapes:
mapping, string, flow/block sequence, quoted keys). A workflow that
references a guarded secret but does not parse as YAML is treated as
violating -- fail closed, not blind.

Static limits, stated honestly. These checks are tripwires for the
direct forms; the org ruleset, review requirements, and this scheduled
audit of trusted-branch copies are the controls for deliberate evasion.
Known gaps, tracked rather than hidden:
  - Trigger scope is pull_request/pull_request_target only. Comment- and
    review-driven triggers (issue_comment, pull_request_review,
    pull_request_review_comment) share the base-copy-with-secrets trust
    shape; a bypass-credential mint on those is not yet flagged. (Extend
    PR_TRIGGERS once a concrete need appears -- doing so blindly risks
    false-positives on legitimate comment-ops workflows.)
  - Branch coverage is the default branch plus develop; a poisoned
    workflow parked on another long-lived branch is unaudited (planting
    it already requires write access).
  - The latent-safe write-actor tripwires (SA and WEB_MERGE) read the
    collaborators endpoint, which does not enumerate GitHub App
    installations holding contents:write -- such an app is a write actor
    the tripwires miss.
  - The org installation listing reports each app's repository_selection
    and permissions but not its repo list; enumerating another app's
    repos needs a user token (/user/installations/{id}/repositories),
    which the audit app cannot use. When the web-merge repo list is
    unreadable the check verifies selection+permissions+key placement
    and emits a warning for the unverified repo list instead of a
    hollow clean.
  - MI-1 clause 4 sees only actions/checkout steps (case-insensitively);
    a checkout performed by a fork of the action or by raw git commands
    in a run step is not flagged, and jobs inside an externally-hosted
    reusable workflow are invisible to the static scan. The clause-5
    reviewer remains the primary control for every dispatch-reachable
    shape.
  - MI-1 does not evaluate a gated job whose workflow's only trigger is
    plain pull_request: the custom branch policy rejects PR merge refs
    at deploy time, and the bypass/SA reference invariants already fail
    the crown-jewel secrets under PR triggers. The uncovered slice -- a
    gated environment holding some other secret, reached from a
    same-repo PR -- is caught by the scheduled --live audit's other
    checks, not statically here.

Exit codes: 0 clean, 1 violations, 2 operational error (missing token,
missing permissions, truncated API listing -- the audit fails closed
rather than skipping silently).
"""

from __future__ import annotations

import argparse
import base64
import json
import pathlib
import re
import subprocess
import sys
import urllib.parse
from typing import Any

ORG = "lumose-health"

# A secret with this shape is a 1Password service-account token: the
# credential that unlocks a vault. For PPE the attack is a read, so a
# plain copy on a repo with a write actor is a standing exfil path.
# IGNORECASE for the same reason every name comparison in this file is
# case-insensitive: GitHub resolves secret names case-insensitively, so a
# non-uppercase-named copy is fully functional and must not evade the
# existence checks (see _upper below).
SA_SECRET_RE = re.compile(r"^[A-Z0-9_]*_ACTIONS_SERVICE_ACCOUNT$", re.IGNORECASE)


def _upper(names) -> set[str]:
    """Uppercase-normalize a secret-name collection for comparison.

    GitHub secret lookup is case-insensitive (the IGNORECASE rationale on
    BYPASS_REF_RE), so `web_merge_app_id` IS the WEB_MERGE key. Every
    existence-side comparison in this file goes through this helper so a
    non-uppercase-named copy cannot slip past a case-sensitive set
    intersection while remaining fully functional in a workflow.
    """
    return {n.upper() for n in names}


# Workflow-text reference to a ruleset-bypass credential, in either
# documented accessor form: `secrets.NAME` or `secrets['NAME']` /
# `secrets["NAME"]`, with optional whitespace around the dot. The app
# identities holding a ruleset bypass: MERGE (org Protect-main 14524652 +
# Protect-develop 14524658, plus repo-level grants), RELEASE (org
# "Restrict main merges to lead" 18965811, which targets every repo's
# main -- but NOT org Protect-main/Protect-develop, so it cannot bypass
# the PR requirement), and WEB_MERGE (GLY-56.24 impl-5: a website-only
# app bypassing org Protect-main 14524652 and website 18965811 so website
# Renovate can auto-merge without the org-wide MERGE key; its key is a
# website repo secret, never gated, and is safe only while website stays
# fork-based -- an invariant check_web_merge_confinement enforces, and it
# must never appear in a pull_request workflow). RENOVATE is deliberately
# NOT here: it holds no bypass (the develop-bypass reuse plan was
# dropped). Extend this pattern in the same PR that grants any new actor
# bypass.
#
# IGNORECASE is load-bearing, not cosmetic: GitHub secret names and
# expression property dereference are case-insensitive, so
# `secrets.merge_app_id` mints the real MERGE token. A case-sensitive
# pattern would pass a fully functional exfil workflow as clean.
BYPASS_REF_RE = re.compile(
    r"secrets\s*(?:\.\s*|\[\s*['\"])(MERGE|RELEASE|WEB_MERGE)_APP_(ID|PRIVATE_KEY)\b",
    re.IGNORECASE,
)

# Workflow-text reference to any SA token, both accessor forms (the
# reference form of the SA invariant -- existence is checked against the
# secrets API above). IGNORECASE for the same reason as BYPASS_REF_RE.
SA_REF_RE = re.compile(
    r"secrets\s*(?:\.\s*|\[\s*['\"])[A-Z0-9_]*_ACTIONS_SERVICE_ACCOUNT\b",
    re.IGNORECASE,
)

# Opaque secret access that exfiltrates the WHOLE secret context without
# naming any single secret, so the name regexes above cannot see it:
# `toJSON(secrets)` dumps every secret, and a dynamic index
# `secrets[<expr>]` (anything not opening with a quote) resolves a name
# the checker cannot predict. On a repo where the org-wide MERGE/RELEASE
# keys are in scope (they are, visibility=all today), either form in a
# PR-triggered workflow leaks the bypass credentials. Fail closed.
OPAQUE_SECRET_RE = re.compile(
    r"toJSON\s*\(\s*secrets\s*\)|secrets\s*\[\s*(?!['\"])",
    re.IGNORECASE,
)

PR_TRIGGERS = frozenset({"pull_request", "pull_request_target"})

# ---------------------------------------------------------------------
# WEB_MERGE confinement (GLY-56.24 impl-5). The web-merge app is the one
# DURABLE ruleset bypass that survives the MERGE closure, and everything
# that makes it safe is asserted here rather than assumed:
#   - its key lives ONLY as a plain secret on the website repo
#     (org-level or off-website copies re-create the exact exposure the
#     MERGE closure removed);
#   - website stays fork-based (zero non-admin write actors) -- a plain
#     bypass key next to a write actor is one same-repo poisoned PR away
#     from exfiltration (same shape as SA-TRIPWIRE);
#   - the app's installation stays selected:[website] with exactly
#     contents:write + pull_requests:write (every other glycemicgpt-*
#     app runs selection=all today, so widening drift has precedent).
# ---------------------------------------------------------------------
WEB_MERGE_SECRETS = frozenset({"WEB_MERGE_APP_ID", "WEB_MERGE_APP_PRIVATE_KEY"})
WEB_MERGE_HOME_REPO = "website"
WEB_MERGE_APP_SLUG = "lumose-web-merge"
# metadata:read is implicitly granted to every GitHub App and is excluded
# from the comparison (an explicit metadata:WRITE would still fail it).
WEB_MERGE_EXPECTED_PERMISSIONS = {"contents": "write", "pull_requests": "write"}
WEB_MERGE_IMPLICIT_PERMISSION = ("metadata", "read")

# (repo, environment) -> the pinned reviewer-rule posture for every gated
# environment. Values verified live 2026-07-18 (typed identities
# re-verified 2026-07-19; the monorepo release-gated entry re-pinned
# reviewer-free 2026-08-14 and the website entry 2026-08-15, each for its
# isolation-reviewerless cutover -- see the CUTOVER RECORD on
# ISOLATION_REVIEWERLESS_ENVS). Reviewers are pinned as "Type:name"
# (User login / Team slug): a Team slugged like the pinned User login
# must not satisfy the pin. prevent_self_review is
# FALSE by design on android-unofficial's public release-gated
# environment (accepted: single-lead topology -- the modeled attacker, a
# restored non-admin write actor, is not in the reviewer set; the custom
# branch policy rejects PR-ref deployments) and TRUE on the
# op-github-gated environments; discord's release-gated has no reviewer
# rule at all (see REVIEWERLESS_ENV_BASELINE), so its posture is
# reviewer-free with can_admins_bypass=false, and the monorepo's and
# website's release-gated have no reviewer rule BY DESIGN since the
# release-gate pattern's reviewer removal (see
# ISOLATION_REVIEWERLESS_ENVS -- the isolation legs, not a reviewer, are
# their load-bearing control), so their posture is the same
# reviewer-free shape; a reviewer REAPPEARING on either is drift too,
# because an unreviewed posture change in either direction means someone
# is editing release controls outside a PR. Pinning means none of this
# can drift silently; changing the intent requires editing this map in a
# reviewed PR. Every environment in EXPECTED_GATED_ENVIRONMENTS must
# have an entry here (enforced by check_env_protection_drift).
GATED_ENV_PROTECTION_BASELINE: dict[tuple[str, str], dict[str, Any]] = {
    ("GlycemicGPT", "op-github-gated"): {
        "prevent_self_review": True,
        "can_admins_bypass": False,
        "reviewers": {"User:jlengelbrecht"},
    },
    ("GlycemicGPT", "release-gated"): {
        "prevent_self_review": None,
        "can_admins_bypass": False,
        "reviewers": set(),
    },
    ("ios-unofficial", "op-github-gated"): {
        "prevent_self_review": True,
        "can_admins_bypass": False,
        "reviewers": {"User:jlengelbrecht"},
    },
    ("website", "release-gated"): {
        "prevent_self_review": None,
        "can_admins_bypass": False,
        "reviewers": set(),
    },
    ("android-unofficial", "release-gated"): {
        "prevent_self_review": False,
        "can_admins_bypass": False,
        "reviewers": {"User:jlengelbrecht"},
    },
    ("glycemicgpt-discord-bot", "release-gated"): {
        "prevent_self_review": None,
        "can_admins_bypass": False,
        "reviewers": set(),
    },
}

# pull_request_target executes the BASE-ref copy of a workflow, so the
# integration branch matters as much as the default branch.
EXTRA_BRANCHES = ("develop",)

# ---------------------------------------------------------------------
# Pinned allowlists. These only ever ratchet DOWN: entries are removed as
# migrations land, never added without the same scrutiny that created
# this file. Every entry names its removal condition.
# ---------------------------------------------------------------------

# (repo, secret) -> reason
#   "pending-migration": known violation, tracked by the gated-environment
#       migration; surfaces as a warning so it is never invisible.
#   "latent-safe": allowed only while the repo has zero non-admin write
#       actors; the check itself is the tripwire and fails the moment a
#       write actor appears.
SA_ALLOWLIST: dict[tuple[str, str], str] = {
    # BACKEND_ACTIONS_SERVICE_ACCOUNT (monorepo) has moved behind the
    # op-github-gated environment and its plain repo copy is deleted, so it
    # is no longer pinned here -- it is now enforced by
    # EXPECTED_GATED_ENVIRONMENTS below (env-secrets drift + plain-re-add).
    # Android signing bootstrap; latent-safe while android-unofficial has
    # no non-admin write actor. Tripwired -- do not convert to
    # "pending-migration" to silence a trip; gate the environment instead.
    ("android-unofficial", "ANDROID_ACTIONS_SERVICE_ACCOUNT"): "latent-safe",
}

# (repo, workflow path) entries that mint a bypass credential from a
# pull_request/pull_request_target context today. Each is replaced by the
# workflow_run + direct-REST merge redesign (the website
# renovate-automerge.yml template); remove each entry in that PR.
# SCOPE: a pin ONLY downgrades this file's BYPASS-PR finding (the known,
# tracked bypass-credential mint) to a warning. It is NOT a whole-file
# skip -- a SECRETS-DUMP (toJSON(secrets)/dynamic index) or an SA-REF-PR
# in the same file still fails, so pinning cannot be used to smuggle a
# different exfil into a known-offender file. Keep the pins short-lived
# anyway: the tracked bypass mint itself stays live until removed.
#
# GLY-56.24 impl-5 removed the monorepo auto-merge-renovate.yml pin: that
# workflow's pull_request MERGE mint is gone (auto-merge moved to the
# RENOVATE app in a workflow_run job on develop only). The android entry
# stays pinned until android's own renovate redesign lands.
BYPASS_ALLOWLIST: set[tuple[str, str]] = {
    ("android-unofficial", ".github/workflows/auto-merge-renovate.yml"),
}

# repo -> environment -> exact set of secret names the environment must
# hold. Populated as secrets move behind gated environments. Each entry
# asserts the environment holds exactly its expected secret list and that
# none of those secrets reappears as a plain repo copy.
# GLY-56.24 impl-5 folds the MERGE app key into release-gated on every
# repo that merges bot PRs to a protected branch. MERGE is a durable
# org-ruleset bypass (GITHUB_TOKEN cannot be a bypass actor), so it cannot
# be ephemeralised; instead every MERGE-minting job (sync, changelog,
# release, discord merge-pr) is now pause-tolerant and gated, the org
# MERGE_APP_* pair is deleted, and the key survives ONLY inside these
# environments. The org-level delete is the last step of the coordinated
# cutover, so these entries and that delete land together (an org copy
# left behind trips ENV-READD-ORG below).
EXPECTED_GATED_ENVIRONMENTS: dict[str, dict[str, set[str]]] = {
    "GlycemicGPT": {
        "op-github-gated": {"BACKEND_ACTIONS_SERVICE_ACCOUNT"},
        "release-gated": {
            "RELEASE_APP_ID",
            "RELEASE_APP_PRIVATE_KEY",
            "MERGE_APP_ID",
            "MERGE_APP_PRIVATE_KEY",
        },
    },
    "ios-unofficial": {"op-github-gated": {"IOS_ACTIONS_SERVICE_ACCOUNT"}},
    "website": {
        "release-gated": {
            "RELEASE_APP_ID",
            "RELEASE_APP_PRIVATE_KEY",
            "MERGE_APP_ID",
            "MERGE_APP_PRIVATE_KEY",
        }
    },
    "android-unofficial": {
        # android consumes MERGE in FOUR develop-branch workflows
        # (changelog-pr, release, sync-main-to-develop -- all gated here --
        # plus auto-merge-renovate.yml which impl-5 deletes, android Renovate
        # going manual). Its default branch (main) carries no workflows, which
        # is why a default-branch code search misses these. MERGE is gated in
        # android's release-gated env like the other consuming repos.
        "release-gated": {
            "RELEASE_APP_ID",
            "RELEASE_APP_PRIVATE_KEY",
            "MERGE_APP_ID",
            "MERGE_APP_PRIVATE_KEY",
        }
    },
    "glycemicgpt-discord-bot": {
        "release-gated": {
            "RELEASE_APP_ID",
            "RELEASE_APP_PRIVATE_KEY",
            "MERGE_APP_ID",
            "MERGE_APP_PRIVATE_KEY",
        }
    },
}

# Environments that hold gated secrets but cannot carry a required-reviewer
# rule: the repo is private, and on the org's current plan the reviewer rule
# is rejected for private repos (empirically HTTP 422 "billing plan"), while
# custom deployment branch policies ARE accepted and live. Every leg of the
# compensating contract is VERIFIED by check_reviewer_drift rather than
# assumed: a main-only custom deployment branch policy
# (ENV-REVIEWERLESS-POLICY fires if it is removed or widened), zero
# non-admin write actors (ENV-REVIEWERLESS-TRIPWIRE), a single admin
# (ENV-REVIEWERLESS-ADMINS), and the repo staying private
# (ENV-REVIEWERLESS-PUBLIC -- once public, add the reviewer and remove the
# pin).
REVIEWERLESS_ENV_BASELINE: set[tuple[str, str]] = {
    ("glycemicgpt-discord-bot", "release-gated"),
}

# ---------------------------------------------------------------------
# Isolation-justified reviewerless environments (the release-gate
# pattern's release-auto posture). DISTINCT from REVIEWERLESS_ENV_BASELINE
# and never to be merged with it: that baseline records an environment
# that CANNOT carry a reviewer (private-repo plan limitation) and is
# compensated by branch policy alone on a repo with zero write actors.
# This class records an environment whose reviewer was deliberately
# REMOVED because isolation, not the reviewer, is the load-bearing
# control -- a stronger claim that must be re-proven on every audit, on a
# PUBLIC repo, tolerating non-admin write actors (neither visibility nor
# a zero-write-actor roster is one of its legs):
#
#   Leg 1  The environment's deployment branch policy is CUSTOM and
#          exactly {main}, so the gated secrets resolve only for a run on
#          refs/heads/main (never protected_branches: a PR merge ref
#          satisfies "protected"). Verified live against the environment
#          (ENV-ISOLATION-POLICY) and statically against
#          MI1_POLICY_BRANCH_BOUND, which must pin exactly {"main"} for
#          the environment (ENV-ISOLATION-PIN) so the policy cannot be
#          re-widened without editing two pins in a reviewed PR.
#
#   Leg 2  main is unpushable by any non-lead actor. The class is
#          main-anchored, like MI1_TRUSTED_REF_RE: the repo's default
#          branch must BE main (ENV-ISOLATION-BRANCH -- a default-branch
#          flip would silently redirect both this leg's rule collection
#          and leg 3's workflow scan), each required rule must be present
#          on main AND supplied by its pinned ruleset with
#          enforcement=active (ENV-ISOLATION-RULES -- a same-typed rule
#          from a substitute ruleset does not count: extra rulesets only
#          tighten, but the pinned one is the one whose bypass list is
#          bounded), each pinned rule must keep the parameters pinned in
#          required_rule_parameters (ENV-ISOLATION-RULES -- code-owner
#          review on the pull_request rule is the content checkpoint
#          that replaced the deploy-time reviewer, so weakening it is a
#          leg break, not a style change), each pinned ruleset's
#          bypass-actor list must stay
#          within ITS OWN pinned bound (ENV-ISOLATION-BYPASS -- per
#          ruleset, not a union, so moving an actor from one ruleset to
#          another is a caught widening), and the repo's admin set must
#          be exactly {lead} (ENV-ISOLATION-ADMINS) because
#          OrganizationAdmin is a blanket bypass. Unreadable rule or
#          bypass state fails closed (ENV-ISOLATION-UNVERIFIED), never
#          silently green.
#
#   Leg 3  MI-1 holds for every job declaring the environment: the repo
#          is in MI1_ENFORCED_REPOS and the environment is NOT pinned
#          dispatch-safe (both static, ENV-ISOLATION-PIN -- a clause-5 pin
#          presumes the reviewer this class removes), and the workflow
#          reachability scan restricted to this environment's jobs is
#          clean (ENV-ISOLATION-MI1, in addition to the MI1-* codes the
#          full scan reports independently).
#
# Together the legs prove the GLY-56.24 P0 stays closed without the
# reviewer: the secrets resolve only on push:main runs of a workflow copy
# on main, no write actor can move main, and only a lead-merged PR puts
# a workflow copy there. Like every pin in this file the
# verification is detective, not preventive -- an org admin can break a
# leg between audits, and the next scheduled/on-push run goes red -- and
# like every exemption it warns (ENV-ISOLATION) even when fully verified,
# so the reviewerless posture is never invisible.
#
# STATED RESIDUAL RISK (accepted, not hidden): the removed reviewer was
# also a deploy-time checkpoint on workflow CONTENT -- a human saw every
# run before the secrets resolved. The isolation legs bind the REF that
# runs, not what the ref contains. On each pinned repo's main that
# checkpoint is replaced by main's PR ruleset requiring CODE-OWNER
# review: the monorepo's CODEOWNERS assigns /.github/workflows/ and
# /scripts/security/ to the lead, so a promotion PR editing a gated
# job's step body cannot merge to main without the lead's code-owner
# approval -- the narrow gap (an edit that reaches a gated secret
# without touching a code-owned path) is backstopped by the bypass/SA
# reference invariants in this file, and the tracked end-to-end
# hardening is extending code-owner review to .github/workflows/** on
# develop (a ruleset change, out of this pattern's scope). Website's
# CODEOWNERS assigns `*` and `.github/` to the lead, so every website
# PR path is code-owned -- but the code-owner REQUIREMENT is what this
# audit pins (required_rule_parameters); the CODEOWNERS file itself is
# asserted, not audited (no check reads it, and deleting it would
# hollow the pinned parameter without a finding). Website also has no
# PR-time run of this script (the monorepo runs --repo-local on every
# PR via workflow-lint.yml); its legs are detective-only via the
# scheduled/push-triggered live audit. Both are accepted residuals;
# tracked hardenings: audit CODEOWNERS content, and port the
# --repo-local step to website CI. See docs/dev/gated-environments.md.
#
# CUTOVER RECORD (monorepo 2026-08-14, website 2026-08-15): each pin and
# its reviewer-free GATED_ENV_PROTECTION_BASELINE posture land BEFORE the
# lead deletes that environment's live reviewer rule -- the reviewed
# argument first, then the flip. ORDERING IS LOAD-BEARING for website:
# the website PR that removes changelog.yml's workflow_dispatch must be
# merged to website main BEFORE the reviewer comes off -- reversed, the
# environment would be reviewerless AND dispatch-reachable on ref=main
# (the policy binds the ref, not the actor), the exact PPE this class
# exists to prevent, with only the next scheduled audit
# (ENV-ISOLATION-MI1) to catch it. Between a pin reaching an audited
# branch and the lead action, the audit is red with exactly one expected
# finding for that environment (ENV-PROTECTION: live reviewer vs pinned
# reviewer-free posture); the lead removes the reviewer and re-runs the
# audit green. Until then the reviewer is still on, so nothing is
# unverified -- the environment is simply still gated.
#
# Do NOT resolve a broken leg by widening this pin; restore the leg, or
# put the reviewer back and remove the entry.
ISOLATION_REVIEWERLESS_ENVS: dict[tuple[str, str], dict[str, Any]] = {
    # Monorepo release-gated: RELEASE_APP_* + MERGE_APP_*. Every use of
    # these credentials here is revertible bookkeeping (version bumps,
    # changelog PRs, release bodies, PR auto-merge, main->develop sync);
    # nothing signed or irreversibly published, so the repo has no
    # release-publish split. MERGE remains a durable org-ruleset bypass
    # ("crown jewel"), which is why leg 2 bounds exactly who else holds
    # one. Both keys exist only inside release-gated ENVIRONMENTS
    # org-wide -- also on website, android-unofficial and the discord bot
    # -- each drift-tracked by ENV-DRIFT/ENV-READD/ENV-READD-ORG. This
    # entry does not re-verify the siblings; what carries each sibling's
    # copy is stated here so the reliance is explicit, not inferred:
    #   - website: NOT a human reviewer. Website's release-gated is
    #     itself pinned in this class (entry below), so its copy of the
    #     org-wide keys is guarded by website's own pinned isolation
    #     legs, re-verified every audit by the same leg checks as this
    #     entry's (see that entry for the one asymmetry: 4342011 CAN
    #     mint on website). The accepted trade, stated plainly: website
    #     main FORMALLY JOINS THE MONOREPO-main TRUSTED BASE -- an actor
    #     who can land a workflow copy on website main can mint MERGE,
    #     an org-ruleset bypass that reaches this repo's main. The
    #     content checkpoint replacing website's deploy-time reviewer is
    #     website's CODEOWNERS (assigning `*` and `.github/` to the
    #     lead) plus org ruleset 14524652's pull_request rule requiring
    #     code-owner review on website main (pinned below via
    #     required_rule_parameters), so every HUMAN-authored PR into
    #     website main needs the lead's approval before it can merge.
    #     The one actor that merges past that review -- lumose-web-merge
    #     (4342011), which auto-merges green Renovate PRs -- refuses to
    #     carry any PR touching .github/ (guard in website's
    #     renovate-automerge.yml, itself under .github/ and therefore
    #     lead-reviewed to change), so no unreviewed merge can alter
    #     website's gated workflow surface; unreviewed dependency bumps
    #     outside .github/ cannot reach it.
    #   - android-unofficial: its required reviewer, pinned in
    #     GATED_ENV_PROTECTION_BASELINE.
    #   - discord bot: its reviewerless contract, verified leg by leg
    #     via REVIEWERLESS_ENV_BASELINE.
    ("GlycemicGPT", "release-gated"): {
        "lead": "jlengelbrecht",
        # Leg-2 rule identity: each required rule TYPE is pinned to the
        # exact ruleset that must supply it on main. pull_request blocks
        # direct pushes (all changes arrive via PR); update restricts who
        # may move the ref at all, PR merges included.
        "required_rules": {
            "pull_request": 14524652,  # org "Protect main"
            "update": 18965811,  # org "Restrict main merges to lead"
        },
        # Load-bearing parameters of the pinned rules, verified live
        # 2026-08-15. code-owner review is the content checkpoint that
        # replaced the deploy-time reviewer (STATED RESIDUAL RISK
        # above), so an org admin flipping it off -- or zeroing the
        # approval count -- must be a leg break, not silent drift.
        "required_rule_parameters": {
            "pull_request": {
                "require_code_owner_review": True,
                "required_approving_review_count": 1,
            },
        },
        # Leg-2 bypass bounds, PER RULESET, verified live 2026-08-14
        # (14524652 deliberately does NOT include 3227286: the release
        # app cannot bypass the PR requirement on main -- see the
        # fallback-release note in release.yml). OrganizationAdmin is
        # the lead (single admin, leg 2). Integrations: 3227286 =
        # glycemicgpt-release and 3227426 = glycemicgpt-merge, whose
        # keys live only inside release-gated environments (see the
        # entry comment above); 4342011 = lumose-web-merge, whose
        # installation is verified selected (check_web_merge_confinement)
        # so it cannot mint a token for this repo -- but its repo LIST is
        # only warning-verified with an app token, so removing 4342011
        # from the org rulesets is the tracked hardening that retires
        # this reliance. ANY new actor, or an actor appearing on a
        # ruleset that never had it, fails ENV-ISOLATION-BYPASS.
        "bypass_actor_bound": {
            14524652: frozenset(
                {
                    "OrganizationAdmin:always",
                    "Integration[3227426]:always",
                    "Integration[4342011]:always",
                }
            ),
            18965811: frozenset(
                {
                    "OrganizationAdmin:always",
                    "Integration[3227286]:always",
                    "Integration[3227426]:always",
                    "Integration[4342011]:always",
                }
            ),
        },
    },
    # Website release-gated: the same org-wide RELEASE_APP_* +
    # MERGE_APP_* keys (see the monorepo entry's reliance note -- this
    # entry is what that note leans on). Same release-auto shape:
    # changelog.yml is the only workflow declaring the environment, and
    # its jobs open and merge the changelog PR -- revertible
    # bookkeeping, nothing signed or irreversibly published. Leg 2 leans
    # on the same two ORG rulesets as the monorepo entry (they target
    # every repo's main), so the bounds below intentionally repeat that
    # entry's values: each entry states its own per-ruleset bound (never
    # a union, never shared state), and a widening of either org ruleset
    # goes red on BOTH entries. Website's repo-level ruleset 14700912
    # (pull_request at zero approvals, non_fast_forward, status checks)
    # is live noise the identity match ignores: aggregated rules only
    # tighten, and the pinned pull_request rule must still be supplied
    # by 14524652 -- the ruleset whose bypass list is bounded and whose
    # pull_request rule carries the pinned code-owner-review parameters.
    #
    # Bypass legend, website-specific (ids as on the monorepo entry,
    # but the risk profile differs): 3227426 (merge app) and 3227286
    # (release app) hold keys only inside release-gated environments;
    # 4342011 (lumose-web-merge) is the asymmetry -- website IS its
    # selected repo and its key is a PLAIN website secret, so unlike on
    # the monorepo it can mint here at any time. What keeps that from
    # voiding leg 2: the WEB_MERGE confinement contract is audited
    # every run (check_web_merge_confinement -- key placement,
    # selection, permissions, and zero non-admin write actors, whose
    # breach fires WEB-MERGE-TRIPWIRE), and the app's merge workflow
    # refuses to carry any PR touching .github/ past main's code-owner
    # review, so it cannot alter the gated workflow surface. This entry
    # therefore leans on the WEB_MERGE checks by name -- if they are
    # ever weakened, this pin's leg 2 is weakened with them.
    ("website", "release-gated"): {
        "lead": "jlengelbrecht",
        # Leg-2 rule identity and per-ruleset bypass bounds verified
        # live 2026-08-15 (integration ids: see the legend above).
        "required_rules": {
            "pull_request": 14524652,  # org "Protect main"
            "update": 18965811,  # org "Restrict main merges to lead"
        },
        # Same live org rule object as the monorepo entry's parameters
        # pin; stated per entry so weakening it for one repo cannot
        # hide behind the other.
        "required_rule_parameters": {
            "pull_request": {
                "require_code_owner_review": True,
                "required_approving_review_count": 1,
            },
        },
        "bypass_actor_bound": {
            14524652: frozenset(
                {
                    "OrganizationAdmin:always",
                    "Integration[3227426]:always",
                    "Integration[4342011]:always",
                }
            ),
            18965811: frozenset(
                {
                    "OrganizationAdmin:always",
                    "Integration[3227286]:always",
                    "Integration[3227426]:always",
                    "Integration[4342011]:always",
                }
            ),
        },
    },
}

# The pin keys every ISOLATION_REVIEWERLESS_ENVS entry must carry;
# check_isolation_pin_consistency fails a malformed entry as a finding
# instead of letting the audit crash on a KeyError (exit 2 would mask
# WHICH pin is broken).
ISOLATION_PIN_REQUIRED_KEYS = frozenset(
    {"lead", "required_rules", "required_rule_parameters", "bypass_actor_bound"}
)

# Environments that predate the gating work and hold zero secrets. They
# surface as warnings, not failures; the gating migration either gates or
# removes them, deleting these pins.
UNGATED_ENV_BASELINE: set[tuple[str, str]] = {
    ("GlycemicGPT", "copilot"),
    ("website", "github-pages"),
}

# ---------------------------------------------------------------------
# MI-1 -- gated-secret reachability (see the module docstring). Enforced
# per repo, monorepo first; add a repo here only after its workflows have
# been brought into compliance (the release-gate porting checklist). A
# repo that holds gated secrets but is not yet enforced surfaces as a
# MI1-PENDING warning whenever its workflows contain a
# dispatch/forbidden-reachable gated job, so the un-ported exposure
# stays visible instead of assumed (same rule as every other pin in
# this file: exemptions warn, they never go silent).
# ---------------------------------------------------------------------
# website ported 2026-08-15: changelog.yml (its only gated workflow)
# dropped workflow_dispatch and is push:main-only, and its release-gated
# environment is pinned isolation-reviewerless below.
MI1_ENFORCED_REPOS: frozenset[str] = frozenset({"GlycemicGPT", "website"})

# Clause-1 upper bound: the exact branch set each gated environment's
# custom deployment branch policy may contain. Narrowing is always
# allowed and expected; widening (a new branch, a wildcard) fails the
# audit. The monorepo's live policies were narrowed to {main} (verified
# 2026-08-14), website's release-gated verified {main} live 2026-08-15,
# and these pins ratcheted down with them -- for each release-gated the
# {main} bound is additionally load-bearing leg 1 of its
# ISOLATION_REVIEWERLESS_ENVS entry, so re-widening it trips
# ENV-ISOLATION-PIN as well. A gated environment with a custom policy and
# no pin here is itself a violation: every policy must state its bound.
MI1_POLICY_BRANCH_BOUND: dict[tuple[str, str], set[str]] = {
    ("GlycemicGPT", "release-gated"): {"main"},
    ("GlycemicGPT", "op-github-gated"): {"main"},
    ("website", "release-gated"): {"main"},
}

# Clause-5 pins: environments whose DESIGN posture keeps a required
# reviewer permanently, which makes workflow_dispatch reachability of
# their jobs compliant -- the reviewer, not the branch policy, is the
# gate. An environment on the reviewer-removal track (release-gated ->
# release-auto), or already pinned in ISOLATION_REVIEWERLESS_ENVS
# (mechanically enforced: ENV-ISOLATION-PIN fires on the double pin),
# must NEVER be pinned here: pinning it would let dispatch
# reachability back in the moment its reviewer comes off. Every entry
# must keep >= 1 reviewer pinned in GATED_ENV_PROTECTION_BASELINE
# (check_mi1_reachability enforces the consistency statically; live
# reviewer drift is caught by check_env_protection_drift).
MI1_DISPATCH_SAFE_ENVS: dict[tuple[str, str], str] = {
    ("GlycemicGPT", "op-github-gated"): (
        "dispatch-only canary (secrets-plumbing-check.yml) proving the "
        "gate works; its required reviewer is the load-bearing control"
    ),
}

# Clause-3 events, hard fail with no escape hatch. pull_request_target
# runs with the PR's base-branch github.ref; workflow_run,
# repository_dispatch and schedule run with the default branch's -- all
# four pass a main-scoped deployment branch policy while an untrusted
# actor controls when (and for p_r_t, around what) they fire.
# workflow_call is forbidden for a different reason: the callee inherits
# the CALLER's github.ref, so the effective (event, ref) pair cannot be
# resolved statically from the callee -- fail closed.
MI1_FORBIDDEN_TRIGGERS: frozenset[str] = frozenset(
    {
        "pull_request_target",
        "workflow_run",
        "repository_dispatch",
        "workflow_call",
        "schedule",
    }
)

# Clause-4 trusted checkout refs (also the clause-2 trusted push-branch
# names): the default branch (only the lead can push it) or an immutable
# full commit SHA. \Z, not $: $ would accept a trailing newline (a YAML
# block-scalar `ref: |` value), which resolves as an invalid ref at best
# and must not read as trusted. Hardcodes `main` for now -- when a repo
# whose trunk is not `main` (android-unofficial's gated workflows live
# on develop) joins MI1_ENFORCED_REPOS, derive this from the repo's
# default branch instead of widening the pattern.
MI1_TRUSTED_REF_RE = re.compile(r"^(main|[0-9a-f]{40})\Z")


class OperationalError(Exception):
    """The audit could not gather ground truth. Fail closed (exit 2)."""


def _parse_workflow(text: str) -> tuple[dict[Any, Any], dict[str, Any]] | None:
    """Parse workflow YAML into (trigger map, jobs mapping).

    The trigger map is {trigger name: config-or-None} so callers can
    inspect per-trigger configuration (MI-1 reads push branch filters);
    set(trigger_map) is the trigger-name set. Every documented `on:`
    shape is recognized: `on: pull_request`, `on: [push, pull_request]`,
    `on: {pull_request: ...}`, block mappings, and quoted keys (YAML 1.1
    parses an unquoted `on` key as boolean True). Returns None when the
    text does not parse as YAML; each caller decides its own fail-closed
    behavior.
    """
    try:
        import yaml
    except ImportError as exc:  # fail closed, never skip silently
        raise OperationalError(
            "PyYAML is required for trigger parsing (pip install pyyaml)"
        ) from exc
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError:
        return None
    if not isinstance(doc, dict):
        return {}, {}
    triggers = doc.get(True, doc.get("on"))
    if triggers is None:
        trigger_map: dict[Any, Any] = {}
    elif isinstance(triggers, str):
        trigger_map = {triggers: None}
    elif isinstance(triggers, list):
        trigger_map = dict.fromkeys(triggers)
    elif isinstance(triggers, dict):
        trigger_map = dict(triggers)
    else:
        trigger_map = {}
    jobs = doc.get("jobs")
    return trigger_map, (jobs if isinstance(jobs, dict) else {})


def workflow_has_pr_trigger(text: str) -> bool:
    """True when the workflow's `on:` includes a pull_request trigger.

    A workflow that does not parse is treated as HAVING the trigger:
    this function is only consulted for workflows that reference a
    guarded secret, and an unparseable one must fail the audit, not
    slip past it.
    """
    parsed = _parse_workflow(text)
    if parsed is None:
        return True
    trigger_map, _ = parsed
    return bool(set(trigger_map) & PR_TRIGGERS)


def _job_environment(job: Any) -> str | None:
    """The environment name a job declares.

    None when the job declares no environment; the sentinel "?" when the
    declaration exists but the name cannot be statically resolved (an
    expression, or a malformed mapping) -- callers treat "?" as gated
    and fail closed.
    """
    if not isinstance(job, dict):
        return None
    env = job.get("environment")
    if env is None:
        return None
    if isinstance(env, dict):
        env = env.get("name")
    if not isinstance(env, str) or "${{" in env:
        return "?"
    return env


def _checkout_refs(job: dict[str, Any]) -> list[str | None]:
    """The `ref:` of every actions/checkout step in a job.

    None entries mean the step checks out the event's default ref (for
    workflow_dispatch: the dispatched ref). A non-string ref (an
    expression resolved at runtime) is normalized to its text so the
    trusted-ref pattern rejects it.
    """
    refs: list[str | None] = []
    steps = job.get("steps")
    if not isinstance(steps, list):
        return refs
    for step in steps:
        if not isinstance(step, dict):
            continue
        uses = step.get("uses")
        # lower(): GitHub resolves action owner/repo case-insensitively,
        # so `Actions/Checkout@sha` runs the real action and must not
        # evade the ref check.
        if not isinstance(uses, str) or not uses.lower().startswith(
            "actions/checkout@"
        ):
            continue
        with_block = step.get("with")
        ref = with_block.get("ref") if isinstance(with_block, dict) else None
        refs.append(ref if ref is None or isinstance(ref, str) else str(ref))
    return refs


# ---------------------------------------------------------------------
# Checks. Each takes the org-state model and returns (violations,
# warnings) as lists of strings. The model shape:
#
# {
#   "org_secrets": [name, ...],
#   "app_installations":                     # org app installs, or None
#     [{"app_slug": str, "repository_selection": "all"|"selected",
#       "permissions": {name: level},        # from the org listing
#       "repos": [name, ...] | None}] | None,  # None = unreadable
#   "repos": [
#     {
#       "name": str,
#       "secrets": [name, ...],              # plain repo-level secrets
#       "write_actors": [login, ...],        # non-admin push/maintain
#       "admin_actors": [login, ...],        # admin collaborators
#       "private": bool,                     # repo visibility
#       "default_branch": str,               # ISOLATION_REVIEWERLESS leg 2
#       #   requires it to be "main" (the workflow scan follows it)
#       "main_branch_rules":                 # ISOLATION_REVIEWERLESS leg 2;
#         {"rules": [{"type": str, "ruleset_id": int, "parameters": {}|None}],
#          #   active rules on main
#          "rulesets": {ruleset_id: {"enforcement": str,
#                                    "bypass_actors": [serialized, ...]}}}
#         | None,                            # None / missing entry =
#         #   unreadable -- the isolation check fails closed on it
#       "workflows": {path: {branch: text}}, # default + EXTRA_BRANCHES
#       "environments": [
#         {"name": str, "required_reviewers": int, "secrets": [name, ...],
#          "branch_policy_branches": [name, ...] | None,  # custom policy
#          "branch_policy_mode": "custom" | "protected" | None,  # None = no
#          #   policy at all; key absent in text-only models (MI-1 clause 1
#          #   is skipped when the key is absent, never when it is None)
#          "prevent_self_review": bool | None,  # None = no reviewer rule
#          "can_admins_bypass": bool,
#          "reviewers": ["User:login" | "Team:slug", ...]}
#       ],
#     }
#   ],
# }
# ---------------------------------------------------------------------


def check_sa_invariant(state: dict) -> tuple[list[str], list[str]]:
    violations, warnings = [], []
    for name in state["org_secrets"]:
        if SA_SECRET_RE.match(name):
            violations.append(
                f"SA-ORG: org secret {name} is a service-account token "
                f"visible to every repo; SA tokens must be per-repo and "
                f"environment-gated"
            )
    for repo in state["repos"]:
        for name in repo["secrets"]:
            if not SA_SECRET_RE.match(name):
                continue
            reason = SA_ALLOWLIST.get((repo["name"], name.upper()))
            if reason is None:
                violations.append(
                    f"SA-PLAIN: {repo['name']}/{name} is a plain repo "
                    f"secret; gate it behind a required-reviewer "
                    f"environment or pin it here with a removal condition"
                )
            elif reason == "latent-safe":
                if repo["write_actors"]:
                    violations.append(
                        f"SA-TRIPWIRE: {repo['name']}/{name} was pinned "
                        f"latent-safe but the repo now has write actors "
                        f"({', '.join(sorted(repo['write_actors']))}); "
                        f"gate the token before granting write"
                    )
            elif reason == "pending-migration":
                warnings.append(
                    f"SA-PENDING: {repo['name']}/{name} is a known plain "
                    f"copy awaiting the gated-environment migration"
                )
    return violations, warnings


def check_bypass_invariant(state: dict) -> tuple[list[str], list[str]]:
    violations, warnings = [], []
    for repo in state["repos"]:
        for path, by_branch in repo["workflows"].items():
            pinned = (repo["name"], path) in BYPASS_ALLOWLIST
            for branch, text in by_branch.items():
                where = f"{repo['name']}/{path}@{branch}"
                has_bypass_ref = bool(BYPASS_REF_RE.search(text))
                has_sa_ref = bool(SA_REF_RE.search(text))
                has_opaque = bool(OPAQUE_SECRET_RE.search(text))
                if not (has_bypass_ref or has_sa_ref or has_opaque):
                    continue
                if not workflow_has_pr_trigger(text):
                    continue
                if has_opaque:
                    violations.append(
                        f"SECRETS-DUMP: {where} reads the whole secret "
                        f"context (toJSON(secrets) or a dynamic "
                        f"secrets[...] index) in a pull_request/"
                        f"pull_request_target workflow; this exfiltrates "
                        f"the org-wide MERGE/RELEASE keys without naming "
                        f"them -- reference only the specific non-bypass "
                        f"secret you need"
                    )
                if has_bypass_ref:
                    if pinned:
                        warnings.append(
                            f"BYPASS-PENDING: {where} mints a bypass "
                            f"credential from a pull_request context; "
                            f"pinned until the workflow_run redesign lands"
                        )
                    else:
                        violations.append(
                            f"BYPASS-PR: {where} references a "
                            f"ruleset-bypass credential and carries a "
                            f"pull_request/pull_request_target trigger; "
                            f"use workflow_run (see website "
                            f"renovate-automerge.yml)"
                        )
                if has_sa_ref:
                    violations.append(
                        f"SA-REF-PR: {where} references a service-account "
                        f"token in a workflow with a pull_request/"
                        f"pull_request_target trigger; a poisoned PR "
                        f"could read the vault credential"
                    )
    return violations, warnings


def check_env_secrets_drift(state: dict) -> tuple[list[str], list[str]]:
    violations: list[str] = []
    repos_by_name = {r["name"]: r for r in state["repos"]}
    for repo_name, envs in EXPECTED_GATED_ENVIRONMENTS.items():
        repo = repos_by_name.get(repo_name)
        if repo is None:
            violations.append(f"ENV-DRIFT: expected gated repo {repo_name} not found")
            continue
        actual_envs = {e["name"]: e for e in repo["environments"]}
        for env_name, expected_secrets in envs.items():
            env = actual_envs.get(env_name)
            if env is None:
                violations.append(
                    f"ENV-DRIFT: {repo_name} is missing gated environment {env_name}"
                )
                continue
            actual = _upper(env["secrets"])
            if actual != expected_secrets:
                missing = expected_secrets - actual
                extra = actual - expected_secrets
                detail = []
                if missing:
                    detail.append(f"missing: {', '.join(sorted(missing))}")
                if extra:
                    detail.append(f"unexpected: {', '.join(sorted(extra))}")
                violations.append(
                    f"ENV-DRIFT: {repo_name}/{env_name} secret list "
                    f"deviates ({'; '.join(detail)})"
                )
            readded = expected_secrets & _upper(repo["secrets"])
            if readded:
                violations.append(
                    f"ENV-READD: {repo_name} holds plain copies of gated "
                    f"secrets: {', '.join(sorted(readded))}"
                )
    # Org-level re-add: an org secret is delivered ungated to every repo's
    # non-environment jobs, so ANY gated secret reappearing at org level
    # voids its gate org-wide (the RELEASE key lived there pre-migration;
    # an SA token re-added at org level trips SA-ORG as well). Checked
    # once against the union of all expected names, not per repo.
    gated_names = {
        name
        for envs in EXPECTED_GATED_ENVIRONMENTS.values()
        for expected in envs.values()
        for name in expected
    }
    for name in sorted(gated_names & _upper(state["org_secrets"])):
        violations.append(
            f"ENV-READD-ORG: {name} belongs only inside a gated "
            f"environment but exists as an org-wide secret, readable by "
            f"every repo's non-environment jobs"
        )
    return violations, []


def check_web_merge_confinement(state: dict) -> tuple[list[str], list[str]]:
    """Enforce every leg of the web-merge design (see the constants block).

    Placement and the fork-based tripwire run unconditionally. The
    installation-scope legs run once WEB_MERGE material exists anywhere:
    before the cutover creates the app there is nothing to confine, so a
    missing installation or an unreadable listing is only a finding when
    a key is actually present -- that keeps today's audit green while
    making the post-cutover audit fail closed instead of unverified.
    """
    violations, warnings = [], []
    org_hits = WEB_MERGE_SECRETS & _upper(state["org_secrets"])
    if org_hits:
        violations.append(
            f"WEB-MERGE-ORG: {', '.join(sorted(org_hits))} exists as an "
            f"org-wide secret; the web-merge bypass key belongs ONLY as a "
            f"plain {WEB_MERGE_HOME_REPO} repo secret -- an org copy is "
            f"readable by every repo's non-environment jobs, the exact "
            f"exposure the MERGE closure removed"
        )
    key_present = bool(org_hits)
    for repo in state["repos"]:
        plain_hits = WEB_MERGE_SECRETS & _upper(repo["secrets"])
        env_hits = {
            (env["name"], name)
            for env in repo["environments"]
            for name in WEB_MERGE_SECRETS & _upper(env["secrets"])
        }
        if not plain_hits and not env_hits:
            continue
        key_present = True
        if repo["name"] != WEB_MERGE_HOME_REPO:
            held = sorted(plain_hits | {name for _, name in env_hits})
            violations.append(
                f"WEB-MERGE-PLACEMENT: {repo['name']} holds "
                f"{', '.join(held)}; the web-merge bypass key belongs ONLY "
                f"on {WEB_MERGE_HOME_REPO} -- an off-website copy lands the "
                f"key where write actors exist or will be restored"
            )
        elif env_hits:
            names = sorted({f"{e}/{n}" for e, n in env_hits})
            violations.append(
                f"WEB-MERGE-PLACEMENT: {repo['name']} holds the web-merge "
                f"key inside environment secrets ({', '.join(names)}); the "
                f"design home is a plain repo secret consumed by a "
                f"workflow_run job (an environment copy signals an "
                f"unreviewed redesign)"
            )
        if plain_hits and repo["write_actors"]:
            violations.append(
                f"WEB-MERGE-TRIPWIRE: {repo['name']} holds the plain "
                f"web-merge bypass key but now has non-admin write actors "
                f"({', '.join(sorted(repo['write_actors']))}); the key is "
                f"safe only while the repo is fork-based -- a write actor "
                f"can exfiltrate it via a same-repo pull_request workflow. "
                f"Gate or re-home the key before granting write"
            )
    if not key_present:
        return violations, warnings
    installations = state.get("app_installations")
    if installations is None:
        violations.append(
            "WEB-MERGE-UNVERIFIED: WEB_MERGE material exists but the org "
            "app-installation listing is unreadable; grant the audit "
            "token org Administration (read) -- the confinement legs "
            "(selection, permissions) cannot be verified, and an "
            "unverified bypass app must not be reported clean"
        )
        return violations, warnings
    matches = [i for i in installations if i.get("app_slug") == WEB_MERGE_APP_SLUG]
    if not matches:
        violations.append(
            f"WEB-MERGE-UNVERIFIED: WEB_MERGE secrets exist but no "
            f"{WEB_MERGE_APP_SLUG} installation is visible in the org "
            f"listing; either the key is stale (remove it) or the "
            f"listing is incomplete -- both must be resolved, not "
            f"skipped"
        )
    for inst in matches:
        if inst.get("repository_selection") != "selected":
            violations.append(
                f"WEB-MERGE-SCOPE: the {WEB_MERGE_APP_SLUG} installation "
                f"has repository_selection="
                f"{inst.get('repository_selection')!r}; it must stay "
                f"'selected' ([{WEB_MERGE_HOME_REPO}] only) -- its ruleset "
                f"bypass grants are org-wide, so the installation scope is "
                f"the only thing bounding a stolen key to website"
            )
        perms = {
            k: v
            for k, v in (inst.get("permissions") or {}).items()
            if (k, v) != WEB_MERGE_IMPLICIT_PERMISSION
        }
        if perms != WEB_MERGE_EXPECTED_PERMISSIONS:
            violations.append(
                f"WEB-MERGE-PERMS: the {WEB_MERGE_APP_SLUG} installation "
                f"permissions are {json.dumps(perms, sort_keys=True)}; "
                f"expected exactly "
                f"{json.dumps(WEB_MERGE_EXPECTED_PERMISSIONS, sort_keys=True)} "
                f"(+ implicit metadata:read) -- permission widening turns a "
                f"merge-only app into something worse"
            )
        repos = inst.get("repos")
        if repos is None:
            warnings.append(
                f"WEB-MERGE-REPOS-UNVERIFIED: the {WEB_MERGE_APP_SLUG} "
                f"repo list is not readable with this token (needs a user "
                f"token for /user/installations); selection, permissions "
                f"and key placement were verified -- confirm the repo "
                f"list is [{WEB_MERGE_HOME_REPO}] during the periodic "
                f"admin review"
            )
        # The scheduled audit's app token cannot read another app's repo
        # list, so in live runs this leg reaches only the warning above;
        # the violation fires when the audit runs with a user token (and
        # in the self-test).
        elif sorted(repos) != [WEB_MERGE_HOME_REPO]:
            violations.append(
                f"WEB-MERGE-SCOPE: the {WEB_MERGE_APP_SLUG} installation "
                f"covers {sorted(repos)}; it must cover exactly "
                f"[{WEB_MERGE_HOME_REPO}] -- every extra repo extends the "
                f"app's org-wide ruleset bypass beyond website"
            )
    return violations, warnings


def check_env_protection_drift(state: dict) -> tuple[list[str], list[str]]:
    violations: list[str] = []
    # Ratchet: a gated environment without a pinned posture is itself
    # drift -- every new EXPECTED_GATED_ENVIRONMENTS entry must declare
    # its intended reviewer-rule posture in the same PR.
    for repo_name, envs in EXPECTED_GATED_ENVIRONMENTS.items():
        for env_name in envs:
            if (repo_name, env_name) not in GATED_ENV_PROTECTION_BASELINE:
                violations.append(
                    f"ENV-PROTECTION: {repo_name}/{env_name} is a gated "
                    f"environment with no GATED_ENV_PROTECTION_BASELINE "
                    f"entry; pin its intended prevent_self_review/"
                    f"can_admins_bypass/reviewer posture"
                )
    repos_by_name = {r["name"]: r for r in state["repos"]}
    for (repo_name, env_name), expected in GATED_ENV_PROTECTION_BASELINE.items():
        repo = repos_by_name.get(repo_name)
        if repo is None:
            continue  # a missing gated repo already fails ENV-DRIFT
        env = next((e for e in repo["environments"] if e["name"] == env_name), None)
        if env is None:
            continue  # a missing gated environment already fails ENV-DRIFT
        deviations = []
        actual_psr = env.get("prevent_self_review")
        if actual_psr != expected["prevent_self_review"]:
            deviations.append(
                f"prevent_self_review={actual_psr} "
                f"(pinned {expected['prevent_self_review']})"
            )
        actual_cab = env.get("can_admins_bypass")
        if actual_cab != expected["can_admins_bypass"]:
            deviations.append(
                f"can_admins_bypass={actual_cab} "
                f"(pinned {expected['can_admins_bypass']})"
            )
        actual_reviewers = set(env.get("reviewers") or [])
        if actual_reviewers != expected["reviewers"]:
            deviations.append(
                f"reviewers={sorted(actual_reviewers) or '[]'} "
                f"(pinned {sorted(expected['reviewers']) or '[]'})"
            )
        if deviations:
            violations.append(
                f"ENV-PROTECTION: {repo_name}/{env_name} reviewer-rule "
                f"posture drifted: {'; '.join(deviations)} -- restore the "
                f"pinned posture or change the pin in a reviewed PR"
            )
    return violations, []


def check_isolation_pin_consistency(state: dict) -> tuple[list[str], list[str]]:
    """Static legs of ISOLATION_REVIEWERLESS_ENVS: an isolation pin is
    only sound while the other pins it leans on hold their shape. Needs
    no live state, so it runs in every mode -- including --repo-local,
    where it gives PR-time coverage the same way _mi1_escape_pin_
    consistency does -- and each contradiction goes red before any live
    drift is observable."""
    violations: list[str] = []
    for key in sorted(ISOLATION_REVIEWERLESS_ENVS):
        repo_name, env_name = key
        where = f"{repo_name}/{env_name}"
        pin = ISOLATION_REVIEWERLESS_ENVS[key]
        missing_keys = ISOLATION_PIN_REQUIRED_KEYS - set(pin)
        if missing_keys:
            violations.append(
                f"ENV-ISOLATION-PIN: the {where} isolation pin is missing "
                f"required key(s) {', '.join(sorted(missing_keys))}; a "
                f"malformed pin cannot verify its legs -- complete it or "
                f"remove it"
            )
        # Parameters are only ever compared on rule types the entry also
        # requires; a parameter block keyed on any other type (a typo, or
        # a rule-identity rename that left the block behind) would retire
        # its checkpoint silently while looking pinned.
        stray_params = set(pin.get("required_rule_parameters") or {}) - set(
            pin.get("required_rules") or {}
        )
        if stray_params:
            violations.append(
                f"ENV-ISOLATION-PIN: the {where} isolation pin pins "
                f"parameters for rule type(s) "
                f"{', '.join(sorted(stray_params))} that are not in "
                f"required_rules; those parameters are never compared "
                f"live -- fix the rule type or drop the block"
            )
        # Content, not just presence: the pull_request parameter block
        # carries the content checkpoint that replaced the deploy-time
        # reviewer, so an emptied or weakened block must read as a
        # hollowed pin, not as a pinned checkpoint -- the same standard
        # every other leg's pin is held to (an exact bound, never a
        # bare key).
        pr_params = (pin.get("required_rule_parameters") or {}).get(
            "pull_request"
        ) or {}
        if pr_params.get("require_code_owner_review") is not True or not pr_params.get(
            "required_approving_review_count"
        ):
            violations.append(
                f"ENV-ISOLATION-PIN: the {where} isolation pin does not "
                f"pin require_code_owner_review=True with a non-zero "
                f"required_approving_review_count on its pull_request "
                f"rule; the content checkpoint that replaced the "
                f"reviewer would be unverified -- restore the parameter "
                f"pin or restore the reviewer"
            )
        # Guarded on a non-empty map because the self-test deliberately
        # swaps EXPECTED_GATED_ENVIRONMENTS out to isolate fixtures; live
        # and repo-local always run against the populated production map.
        if EXPECTED_GATED_ENVIRONMENTS and env_name not in (
            EXPECTED_GATED_ENVIRONMENTS.get(repo_name) or {}
        ):
            violations.append(
                f"ENV-ISOLATION-PIN: {where} is pinned isolation-"
                f"reviewerless but absent from EXPECTED_GATED_ENVIRONMENTS; "
                f"dropping that entry would silently retire the secret-list "
                f"drift check and MI-1's policy-shape clause for the "
                f"environment -- restore the entry or remove this pin"
            )
        if repo_name not in MI1_ENFORCED_REPOS:
            violations.append(
                f"ENV-ISOLATION-PIN: {where} is pinned isolation-"
                f"reviewerless but {repo_name} is not in "
                f"MI1_ENFORCED_REPOS; leg 3 (MI-1) is unenforceable, so "
                f"the reviewer must stay until the repo is ported"
            )
        if key in MI1_DISPATCH_SAFE_ENVS:
            violations.append(
                f"ENV-ISOLATION-PIN: {where} is pinned BOTH isolation-"
                f"reviewerless and dispatch-safe; the clause-5 escape "
                f"hatch is load-bearing on the reviewer this class "
                f"removes -- close the dispatch reachability or restore "
                f"the reviewer"
            )
        if MI1_POLICY_BRANCH_BOUND.get(key) != {"main"}:
            violations.append(
                f"ENV-ISOLATION-PIN: {where} is pinned isolation-"
                f"reviewerless but its MI1_POLICY_BRANCH_BOUND is "
                f"{sorted(MI1_POLICY_BRANCH_BOUND.get(key) or [])}; leg 1 "
                f"requires the bound to pin exactly ['main'] so the "
                f"deployment branch policy cannot re-widen silently"
            )
        posture = GATED_ENV_PROTECTION_BASELINE.get(key)
        if posture is None:
            violations.append(
                f"ENV-ISOLATION-PIN: {where} is pinned isolation-"
                f"reviewerless but has no GATED_ENV_PROTECTION_BASELINE "
                f"entry; pin its reviewer-free posture so a reviewer "
                f"reappearing (or any other posture change) is drift"
            )
        elif posture["reviewers"]:
            violations.append(
                f"ENV-ISOLATION-PIN: {where} is pinned isolation-"
                f"reviewerless but GATED_ENV_PROTECTION_BASELINE pins a "
                f"reviewer for it; the two pins contradict -- an "
                f"environment keeps its reviewer pin or its isolation "
                f"pin, never both"
            )
        if key in REVIEWERLESS_ENV_BASELINE:
            violations.append(
                f"ENV-ISOLATION-PIN: {where} is pinned in BOTH "
                f"reviewerless classes; the plan-limitation baseline and "
                f"the isolation class assert different justifications -- "
                f"keep exactly one"
            )
    return violations, []


def _isolation_reviewerless_findings(
    repo: dict, env: dict, pin: dict[str, Any]
) -> tuple[list[str], list[str]]:
    """Live verification of one ISOLATION_REVIEWERLESS_ENVS entry (see
    the constant's three-leg contract). Returns the leg violations, plus
    the standing ENV-ISOLATION warning when every leg verifies."""
    violations: list[str] = []
    where = f"{repo['name']}/{env['name']}"
    if not ISOLATION_PIN_REQUIRED_KEYS <= set(pin):
        # check_isolation_pin_consistency reports WHICH key is missing
        # (ENV-ISOLATION-PIN); refuse to verify legs from a malformed
        # pin rather than KeyError-crashing the whole audit into exit 2.
        return [
            f"ENV-ISOLATION-UNVERIFIED: {where} has a malformed "
            f"isolation pin, so its legs cannot be verified; fix the "
            f"pin or restore the reviewer"
        ], []
    # Leg 1: custom deployment branch policy, exactly {main}. The
    # literal is intentionally the same value the static clause pins for
    # MI1_POLICY_BRANCH_BOUND (check_isolation_pin_consistency keeps the
    # two agreeing).
    mode = env.get("branch_policy_mode")
    branches = env.get("branch_policy_branches")
    if mode != "custom" or branches != ["main"]:
        violations.append(
            f"ENV-ISOLATION-POLICY: {where} is reviewerless on the "
            f"strength of a main-only CUSTOM deployment branch policy, "
            f"but the live policy is mode={mode or 'absent'} branches="
            f"{branches if branches is not None else 'absent'}; restore "
            f"the main-only custom policy or restore the reviewer"
        )
    # Leg 2: main unpushable by any non-lead actor. The class is
    # main-anchored: a default-branch flip would redirect leg 3's
    # workflow scan (collect_live_state reads the default branch), so it
    # is a leg break, not a neutral rename.
    if repo.get("default_branch") != "main":
        violations.append(
            f"ENV-ISOLATION-BRANCH: {where} is pinned on a main-anchored "
            f"isolation argument but the repo's default branch is "
            f"{repo.get('default_branch')!r}; the workflow scan follows "
            f"the default branch, so a flip un-audits main -- restore "
            f"main as the default branch or restore the reviewer"
        )
    admins = sorted(repo.get("admin_actors", []))
    if admins != [pin["lead"]]:
        violations.append(
            f"ENV-ISOLATION-ADMINS: {where} is reviewerless on a "
            f"single-lead topology ({pin['lead']} alone bypasses "
            f"the main rulesets as OrganizationAdmin), but the "
            f"admin set is now {admins or '[]'}; shrink it back or "
            f"restore the reviewer"
        )
    rule_state = repo.get("main_branch_rules")
    if rule_state is None:
        violations.append(
            f"ENV-ISOLATION-UNVERIFIED: {where} is reviewerless but "
            f"main's branch rules are unreadable, so leg 2 (main "
            f"unpushable by non-lead actors) cannot be verified; grant "
            f"the audit token repo/org Administration (read) for the "
            f"ruleset endpoints -- an unverified reviewerless "
            f"environment must not be reported clean"
        )
    else:
        rules = rule_state.get("rules", [])
        rulesets = rule_state.get("rulesets", {})
        for rule_type, rid in sorted(pin["required_rules"].items()):
            # Identity, not just presence: the required rule must come
            # from ITS pinned ruleset. A same-typed rule from another
            # ruleset only ever tightens and does not count -- the
            # pinned ruleset is the one whose bypass list is bounded.
            if not any(
                r.get("type") == rule_type and r.get("ruleset_id") == rid for r in rules
            ):
                violations.append(
                    f"ENV-ISOLATION-RULES: {where} is reviewerless on the "
                    f"strength of main being unpushable, but main has "
                    f"lost the {rule_type} rule supplied by ruleset "
                    f"{rid}; a non-lead actor may now be able to move "
                    f"main -- restore the ruleset or restore the reviewer"
                )
                continue
            # Load-bearing rule parameters, pinned per rule type. The
            # pull_request rule's code-owner review is the content
            # checkpoint that replaced the deploy-time reviewer (see
            # the class's STATED RESIDUAL RISK), so weakening it --
            # e.g. require_code_owner_review flipped off, or the
            # approval count zeroed -- is a leg break. Compared on
            # every rule matching the pinned (type, ruleset) so a
            # duplicate weakened rule cannot hide behind a compliant
            # one. Parameters NOT pinned stay unconstrained: extra
            # tightening is always allowed.
            for r in rules:
                if r.get("type") != rule_type or r.get("ruleset_id") != rid:
                    continue
                actual_params = r.get("parameters") or {}
                for param, want in sorted(
                    (pin["required_rule_parameters"].get(rule_type) or {}).items()
                ):
                    if actual_params.get(param) != want:
                        violations.append(
                            f"ENV-ISOLATION-RULES: {where} depends on "
                            f"ruleset {rid}'s {rule_type} rule keeping "
                            f"{param}={want!r}, but the live rule has "
                            f"{param}={actual_params.get(param)!r}; this "
                            f"parameter carries the content checkpoint "
                            f"that replaced the reviewer -- restore it "
                            f"or restore the reviewer"
                        )
            # update_allows_fetch_and_merge would let the ref move via
            # upstream fetch-and-merge without a bypass. It keeps this
            # dedicated truthiness check rather than a
            # required_rule_parameters pin: the live update rule
            # carries no parameters object at all, and the unsafe state
            # is the flag being truthy, not a value drifting from a
            # pinned one.
            if rule_type == "update" and any(
                r.get("type") == rule_type
                and r.get("ruleset_id") == rid
                and (r.get("parameters") or {}).get("update_allows_fetch_and_merge")
                for r in rules
            ):
                violations.append(
                    f"ENV-ISOLATION-RULES: {where} depends on ruleset "
                    f"{rid}'s update rule restricting who moves main, "
                    f"but update_allows_fetch_and_merge is enabled, "
                    f"which lets the ref move without a bypass actor -- "
                    f"disable it or restore the reviewer"
                )
            ruleset = rulesets.get(rid)
            if ruleset is None:
                violations.append(
                    f"ENV-ISOLATION-UNVERIFIED: {where} depends on "
                    f"ruleset {rid} guarding main but its bypass-actor "
                    f"list is unreadable; an unverifiable bypass set "
                    f"must not be reported clean"
                )
                continue
            if ruleset.get("enforcement") != "active":
                violations.append(
                    f"ENV-ISOLATION-RULES: {where} depends on ruleset "
                    f"{rid} guarding main but its enforcement is "
                    f"{ruleset.get('enforcement')!r}; a non-active "
                    f"ruleset blocks nothing -- re-activate it or "
                    f"restore the reviewer"
                )
            extra = set(ruleset.get("bypass_actors") or []) - pin[
                "bypass_actor_bound"
            ].get(rid, frozenset())
            if extra:
                violations.append(
                    f"ENV-ISOLATION-BYPASS: ruleset {rid} guarding "
                    f"{repo['name']} main gained bypass actor(s) "
                    f"{', '.join(sorted(extra))} beyond its pinned "
                    f"bound; a new bypass actor is a new way to push "
                    f"main, which voids the reviewerless argument on "
                    f"{env['name']} -- remove the actor or restore the "
                    f"reviewer"
                )
    # Leg 3: MI-1 for every job declaring this environment. A pinned
    # isolation repo with NO collected workflows means the workflow
    # inventory was not gathered (a live run collects the real release
    # workflows; only an unreadable/absent listing yields none), so leg
    # 3 cannot be verified -- fail closed, matching legs 1 and 2 rather
    # than reporting a hollow clean over an empty scan.
    if not repo.get("workflows"):
        violations.append(
            f"ENV-ISOLATION-UNVERIFIED: {where} is reviewerless but no "
            f"workflow inventory was collected for {repo['name']}, so "
            f"leg 3 (MI-1 for the environment's jobs) cannot be verified"
        )
        return violations, []
    # The full MI-1 check reports the same findings under their MI1-*
    # codes in the same run; this leg re-derives them scoped to the
    # environment so the isolation class fails on its own evidence. The
    # nested finding is embedded without its code prefix so log tooling
    # does not double-count MI1-* lines.
    mi1_violations, _ = _mi1_workflow_reachability(repo, only_env=env["name"])
    if mi1_violations:
        first = mi1_violations[0].split(": ", 1)[-1]
        violations.append(
            f"ENV-ISOLATION-MI1: {where} is reviewerless on the "
            f"strength of MI-1, but {len(mi1_violations)} reachability "
            f"finding(s) touch its jobs (first: {first}); "
            f"restore compliance or restore the reviewer"
        )
    if violations:
        return violations, []
    return [], [
        f"ENV-ISOLATION: {where} holds gated secrets without a required "
        f"reviewer (verified-isolation posture, release-gate pattern); "
        f"legs verified: main-only custom branch policy, main unpushable "
        f"by non-lead actors (pinned rules active, per-ruleset bypass "
        f"bounds intact, single lead admin, default branch main), MI-1 "
        f"clean for its jobs"
    ]


def check_reviewer_drift(state: dict) -> tuple[list[str], list[str]]:
    violations, warnings = [], []
    for repo in state["repos"]:
        for env in repo["environments"]:
            if env["required_reviewers"] >= 1:
                continue
            key = (repo["name"], env["name"])
            if key in REVIEWERLESS_ENV_BASELINE:
                # Every leg of the reviewerless contract is verified
                # independently; the warning below only appears when all
                # hold: no write actors, single admin, still private,
                # main-only custom branch policy.
                compensated = True
                if not repo.get("private", True):
                    compensated = False
                    violations.append(
                        f"ENV-REVIEWERLESS-PUBLIC: {repo['name']} is now "
                        f"public, so the plan limitation that justified "
                        f"the reviewerless pin on {env['name']} no longer "
                        f"applies -- add the required reviewer and remove "
                        f"the pin"
                    )
                admins = repo.get("admin_actors", [])
                if len(admins) > 1:
                    compensated = False
                    violations.append(
                        f"ENV-REVIEWERLESS-ADMINS: {repo['name']} now has "
                        f"multiple admins ({', '.join(sorted(admins))}); "
                        f"the reviewerless pin on {env['name']} assumed a "
                        f"single-lead topology -- gate the environment or "
                        f"shrink the admin set"
                    )
                if repo["write_actors"]:
                    compensated = False
                    violations.append(
                        f"ENV-REVIEWERLESS-TRIPWIRE: {repo['name']}/"
                        f"{env['name']} was pinned reviewerless (private-"
                        f"repo plan limitation) but the repo now has write "
                        f"actors ({', '.join(sorted(repo['write_actors']))}); "
                        f"the branch-policy-only compensation no longer "
                        f"holds -- gate the environment before granting "
                        f"write"
                    )
                if env.get("branch_policy_branches") != ["main"]:
                    compensated = False
                    actual = env.get("branch_policy_branches")
                    violations.append(
                        f"ENV-REVIEWERLESS-POLICY: {repo['name']}/"
                        f"{env['name']} is pinned reviewerless on the "
                        f"strength of a main-only custom deployment branch "
                        f"policy, but the live policy is "
                        f"{actual if actual is not None else 'absent'}; "
                        f"restore the main-only policy"
                    )
                if compensated:
                    warnings.append(
                        f"ENV-REVIEWERLESS: {repo['name']}/{env['name']} "
                        f"holds gated secrets without a required reviewer "
                        f"(private-repo plan limitation); compensations "
                        f"verified: main-only custom branch policy and "
                        f"zero write actors"
                    )
            elif key in ISOLATION_REVIEWERLESS_ENVS:
                v, w = _isolation_reviewerless_findings(
                    repo, env, ISOLATION_REVIEWERLESS_ENVS[key]
                )
                violations.extend(v)
                warnings.extend(w)
            elif key in UNGATED_ENV_BASELINE:
                warnings.append(
                    f"ENV-BASELINE: {repo['name']}/{env['name']} predates "
                    f"gating and has no required reviewers; resolve with "
                    f"the gated-environment migration"
                )
            else:
                violations.append(
                    f"ENV-UNGATED: {repo['name']}/{env['name']} has no "
                    f"required_reviewers rule; every environment must "
                    f"require >= 1 reviewer"
                )
    return violations, warnings


def _push_branch_filter(trigger_map: dict[Any, Any]) -> list[str] | None:
    """The push trigger's provable branch whitelist, or None when it has
    no provable one.

    None covers every non-whitelist shape, each of which reaches refs a
    branch policy cannot be trusted to reject: a bare `push` (all
    branches), `branches-ignore` (a blacklist), and tag filters (tag
    refs). Callers fail closed on None.
    """
    cfg = trigger_map.get("push")
    if not isinstance(cfg, dict):
        return None
    if any(k in cfg for k in ("branches-ignore", "tags", "tags-ignore")):
        return None
    branches = cfg.get("branches")
    if not isinstance(branches, list) or not branches:
        return None
    return [b if isinstance(b, str) else str(b) for b in branches]


def _mi1_gated_env_names(repo_name: str) -> set[str]:
    """The environments MI-1 treats as gated on a repo: everything the
    expectation map pins there, plus any dispatch-safe pinned env."""
    names = set(EXPECTED_GATED_ENVIRONMENTS.get(repo_name, {}))
    names.update(e for r, e in MI1_DISPATCH_SAFE_ENVS if r == repo_name)
    return names


def _mi1_escape_pin_consistency() -> list[str]:
    """Clause-5 consistency, checkable in every mode: a dispatch-safe pin
    is only sound while the baseline pins >= 1 reviewer for that
    environment -- the reviewer it depends on must itself be
    drift-tracked. An entry whose reviewer pin is emptied (the first
    step of removing the reviewer) goes red here before the removal can
    land."""
    violations: list[str] = []
    for repo_name, env_name in sorted(MI1_DISPATCH_SAFE_ENVS):
        pinned = GATED_ENV_PROTECTION_BASELINE.get((repo_name, env_name))
        if not (pinned and pinned["reviewers"]):
            violations.append(
                f"MI1-ESCAPE-PIN: {repo_name}/{env_name} is pinned "
                f"dispatch-safe but GATED_ENV_PROTECTION_BASELINE pins no "
                f"required reviewer for it; the escape hatch IS the "
                f"reviewer, so pin the reviewer or remove the dispatch "
                f"reachability before removing this environment's gate"
            )
    return violations


def _mi1_pending_warnings(repo: dict, gated_env_names: set[str]) -> list[str]:
    """Visibility for the un-ported tail: a repo holding gated secrets
    whose workflows contain a dispatch/forbidden-reachable gated job
    carries exactly the exposure MI-1 exists to close. Warn (once per
    repo) rather than stay silent; the porting checklist converts the
    warning into enforcement."""
    for path, by_branch in sorted(repo["workflows"].items()):
        for _branch, text in sorted(by_branch.items()):
            parsed = _parse_workflow(text)
            if parsed is None:
                continue
            trigger_map, jobs = parsed
            if not (
                "workflow_dispatch" in trigger_map
                or set(trigger_map) & MI1_FORBIDDEN_TRIGGERS
            ):
                continue
            if any(_job_environment(j) in gated_env_names for j in jobs.values()):
                return [
                    f"MI1-PENDING: {repo['name']} holds gated secrets "
                    f"and {path} has a dispatch/forbidden-reachable "
                    f"gated job, but the repo is not yet in "
                    f"MI1_ENFORCED_REPOS; port it per the release-gate "
                    f"checklist"
                ]
    return []


def _mi1_policy_shape(repo: dict, gated_env_names: set[str]) -> list[str]:
    """Clause 1: every gated environment's deployment branch policy is
    custom, never protected_branches (any protected ref -- a PR merge
    ref qualifies -- satisfies "protected") and never absent (no policy
    lets every ref deploy); a custom policy's branch list must stay
    within its pinned bound so widening cannot pass silently. Only
    evaluated when the model carries policy data (--live; fixtures opt
    in) -- a missing environment already fails ENV-DRIFT."""
    violations: list[str] = []
    envs_by_name = {e["name"]: e for e in repo["environments"]}
    for env_name in sorted(gated_env_names):
        env = envs_by_name.get(env_name)
        if env is None or "branch_policy_mode" not in env:
            continue
        if env["branch_policy_mode"] != "custom":
            violations.append(
                f"MI1-POLICY: {repo['name']}/{env_name} deployment "
                f"branch policy is "
                f"{env['branch_policy_mode'] or 'absent'}; a gated "
                f"environment must carry a CUSTOM branch policy -- "
                f"'protected_branches' is satisfied by any protected "
                f"ref (a PR merge ref qualifies), and no policy at "
                f"all lets every ref deploy"
            )
            continue
        branches = env.get("branch_policy_branches")
        if branches is None:
            continue
        bound = MI1_POLICY_BRANCH_BOUND.get((repo["name"], env_name))
        if bound is None:
            violations.append(
                f"MI1-POLICY: {repo['name']}/{env_name} has a custom "
                f"branch policy ({sorted(branches)}) with no "
                f"MI1_POLICY_BRANCH_BOUND pin; every gated policy "
                f"must state its allowed branch set"
            )
        elif not set(branches) <= bound:
            violations.append(
                f"MI1-POLICY: {repo['name']}/{env_name} branch policy "
                f"({sorted(branches)}) exceeds its pinned bound "
                f"({sorted(bound)}); narrowing is fine, widening "
                f"must be a reviewed edit of the pin"
            )
    return violations


def _mi1_job_reachability(
    repo: dict,
    envs_by_name: dict[str, dict],
    job_where: str,
    env_name: str,
    job: dict[str, Any],
    *,
    dispatch: bool,
    forbidden: set[str],
    has_push: bool,
    push_branches: list[str] | None,
) -> tuple[list[str], list[str]]:
    """Clauses 2-5 for one gated job. See check_mi1_reachability."""
    violations: list[str] = []
    warnings: list[str] = []
    if forbidden:
        violations.append(
            f"MI1-TRIGGER: {job_where} is reachable from "
            f"{', '.join(sorted(forbidden))}; pull_request_target, "
            f"workflow_run, repository_dispatch and schedule run with a "
            f"base/default-branch github.ref that PASSES a main-scoped "
            f"deployment branch policy, and workflow_call inherits the "
            f"CALLER's ref, which cannot be resolved statically -- "
            f"gated jobs may only be reachable from push"
        )
    # Clause 2, push half: the push trigger must name a provable
    # whitelist of trusted branches. A gated job on push:develop would
    # hand every merged PR a gated run built from the just-merged
    # workflow copy.
    if has_push and (
        push_branches is None
        or not all(MI1_TRUSTED_REF_RE.match(b) for b in push_branches)
    ):
        shown = (
            "no provable branch whitelist"
            if push_branches is None
            else f"branches {push_branches}"
        )
        violations.append(
            f"MI1-PUSH: {job_where} is reachable from push with {shown}; "
            f"a gated job's push trigger must whitelist only "
            f"lead-controlled branches (main)"
        )
    if not dispatch:
        return violations, warnings
    key = (repo["name"], env_name)
    if env_name == "?" or key not in MI1_DISPATCH_SAFE_ENVS:
        violations.append(
            f"MI1-DISPATCH: {job_where} is reachable from "
            f"workflow_dispatch; a dispatch on ref=main yields "
            f"github.ref=refs/heads/main and PASSES a main-scoped branch "
            f"policy (the policy binds the ref, not the actor) -- remove "
            f"workflow_dispatch, or, for a dispatch-only canary, pin the "
            f"environment in MI1_DISPATCH_SAFE_ENVS with a permanent "
            f"required reviewer"
        )
        return violations, warnings
    # The sanctioned hole is never invisible (the SA_ALLOWLIST rule):
    # every run reports which jobs the escape hatch is carrying and why.
    warnings.append(
        f"MI1-DISPATCH-PINNED: {job_where} is dispatch-reachable under "
        f"the clause-5 escape hatch ({MI1_DISPATCH_SAFE_ENVS[key]}); the "
        f"environment's required reviewer is the load-bearing control"
    )
    env = envs_by_name.get(env_name)
    if env is not None and env.get("required_reviewers", 0) < 1:
        violations.append(
            f"MI1-ESCAPE-LIVE: {job_where} relies on the dispatch-safe "
            f"escape hatch but the live environment has no required "
            f"reviewer; the reviewer is the load-bearing control for "
            f"dispatch reachability -- restore it or remove "
            f"workflow_dispatch"
        )
    # Clause 4, defense in depth only: a dispatched run executes the
    # DISPATCHED ref's copy of this workflow YAML -- inline run steps
    # included -- and no checkout pin changes that; the clause-5
    # reviewer is the primary control. What the pin does buy: the
    # checked-out tree (composite actions, scripts) comes from a
    # lead-controlled ref instead of the dispatched one.
    for ref in _checkout_refs(job):
        if ref is None or not MI1_TRUSTED_REF_RE.match(ref):
            shown = "the dispatched ref (no ref: pin)" if ref is None else repr(ref)
            violations.append(
                f"MI1-CHECKOUT: {job_where} checks out {shown} in a "
                f"dispatch-reachable gated job; pin `ref: main` (or a "
                f"full commit SHA) so the checked-out tree running with "
                f"the gated secret in scope is lead-controlled"
            )
    return violations, warnings


def _mi1_workflow_reachability(
    repo: dict, only_env: str | None = None
) -> tuple[list[str], list[str]]:
    """Clauses 2-5 over every workflow copy of an enforced repo.

    only_env restricts the scan to jobs declaring that environment (leg 3
    of the isolation-reviewerless contract); the "?" sentinel -- an
    unresolvable environment expression -- is always retained, because a
    job whose environment cannot be resolved statically might be gating
    on the restricted one. MI1-UNPARSEABLE is likewise never filtered: an
    unparseable workflow cannot prove it does NOT declare the
    environment.
    """
    violations: list[str] = []
    warnings: list[str] = []
    envs_by_name = {e["name"]: e for e in repo["environments"]}
    for path, by_branch in sorted(repo["workflows"].items()):
        for branch, text in sorted(by_branch.items()):
            where = f"{repo['name']}/{path}@{branch}"
            parsed = _parse_workflow(text)
            if parsed is None:
                # Same fail-closed stance as the bypass invariant: an
                # unparseable workflow that mentions an environment must
                # fail the audit, not slip past the parse.
                if re.search(r"^\s*environment\s*:", text, re.MULTILINE):
                    violations.append(
                        f"MI1-UNPARSEABLE: {where} does not parse as "
                        f"YAML but declares an environment; fix the "
                        f"YAML so reachability can be verified"
                    )
                continue
            trigger_map, jobs = parsed
            triggers = set(trigger_map)
            dispatch = "workflow_dispatch" in triggers
            forbidden = triggers & MI1_FORBIDDEN_TRIGGERS
            has_push = "push" in triggers
            if not dispatch and not forbidden and not has_push:
                continue
            push_branches = _push_branch_filter(trigger_map)
            for job_id, job in jobs.items():
                env_name = _job_environment(job)
                if env_name is None:
                    continue
                # casefold: GitHub resolves environment names
                # case-insensitively, so `Release-Gated` IS the pinned
                # environment and must not slip the scoped scan.
                if only_env is not None and env_name.casefold() not in (
                    only_env.casefold(),
                    "?",
                ):
                    continue
                env_shown = (
                    "an unresolvable expression" if env_name == "?" else env_name
                )
                v, w = _mi1_job_reachability(
                    repo,
                    envs_by_name,
                    f"{where} job '{job_id}' (environment {env_shown})",
                    env_name,
                    job,
                    dispatch=dispatch,
                    forbidden=forbidden,
                    has_push=has_push,
                    push_branches=push_branches,
                )
                violations.extend(v)
                warnings.extend(w)
    return violations, warnings


def check_mi1_reachability(state: dict) -> tuple[list[str], list[str]]:
    """MI-1: gated-secret reachability (module docstring, five clauses).

    Composed from one helper per concern: static escape-hatch pin
    consistency, the un-ported-repo warning, the policy-shape clause,
    and per-workflow reachability. Runs in both modes: in --repo-local
    the model carries no environment inventory, so the escape hatch
    resolves against the pinned baselines (GATED_ENV_PROTECTION_BASELINE
    via MI1_DISPATCH_SAFE_ENVS) and the policy-shape clause is skipped;
    --live additionally verifies the live reviewer count, the policy
    shape, and the policy branch bound.
    """
    violations = _mi1_escape_pin_consistency()
    warnings: list[str] = []
    for repo in state["repos"]:
        gated_env_names = _mi1_gated_env_names(repo["name"])
        if repo["name"] not in MI1_ENFORCED_REPOS:
            warnings.extend(_mi1_pending_warnings(repo, gated_env_names))
            continue
        violations.extend(_mi1_policy_shape(repo, gated_env_names))
        v, w = _mi1_workflow_reachability(repo)
        violations.extend(v)
        warnings.extend(w)
    return violations, warnings


CHECKS = (
    check_sa_invariant,
    check_bypass_invariant,
    check_env_secrets_drift,
    check_web_merge_confinement,
    check_env_protection_drift,
    check_reviewer_drift,
    check_isolation_pin_consistency,
    check_mi1_reachability,
)

# Checks that operate purely on workflow TEXT, so they are meaningful in
# --repo-local mode (a local workflow-dir scan with no secret/environment
# inventory). The secret/environment-placement checks require the authoritative
# API model and run only in --live: on the empty local model they would either
# no-op (nothing to see) or, once EXPECTED_GATED_ENVIRONMENTS is populated,
# false-positive on the missing (unqueryable) environments.
# check_mi1_reachability qualifies: its trigger/checkout clauses need only
# workflow text plus the static pins, and its environment-shaped clauses
# skip themselves when the model carries no environment data.
# check_isolation_pin_consistency qualifies trivially: it reads only the
# static pins, giving PR-time coverage of the isolation class's
# consistency clauses (the live legs still run only in --live).
WORKFLOW_TEXT_CHECKS = (
    check_bypass_invariant,
    check_isolation_pin_consistency,
    check_mi1_reachability,
)


def run_checks(state: dict, checks: tuple = CHECKS) -> tuple[list[str], list[str]]:
    violations: list[str] = []
    warnings: list[str] = []
    for check in checks:
        v, w = check(state)
        violations.extend(v)
        warnings.extend(w)
    return violations, warnings


# ---------------------------------------------------------------------
# Live collection via the gh CLI.
# ---------------------------------------------------------------------


def gh_api(
    path: str,
    *,
    paginate: bool = False,
    allow_404: bool = False,
    allow_403: bool = False,
) -> Any:
    cmd = ["gh", "api", path]
    if paginate:
        cmd.append("--paginate")
    try:
        # Bounded so a stalled CLI or hung request fails closed (exit 2)
        # rather than hanging the audit forever.
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired as exc:
        raise OperationalError(f"gh api {path} timed out after 120s") from exc
    if proc.returncode != 0:
        stderr = proc.stderr.strip()
        if "HTTP 404" in stderr:
            if allow_404:
                return None
            raise OperationalError(f"gh api {path} unexpectedly returned 404")
        # Match the raw CLI stderr, not the constructed message below (which
        # itself mentions "HTTP 403"), so this stays a real-403 test.
        if allow_403 and "HTTP 403" in stderr:
            return None
        raise OperationalError(
            f"gh api {path} failed: {stderr or 'unknown error'}. If this "
            f"is HTTP 403, the token lacks a required permission (repo: "
            f"Actions/Secrets/Administration/Contents/Metadata read -- note "
            f"listing environments needs ACTIONS read, not Environments; org: "
            f"Secrets read, Administration read for the app-installation "
            f"listing and the org-ruleset reads, plus Plan read only for "
            f"the PAT fallback)."
        )
    if not paginate:
        return json.loads(proc.stdout)
    # --paginate emits one JSON document per page, back to back; decode
    # them all rather than depending on gh's newer --slurp flag.
    pages: list[Any] = []
    decoder = json.JSONDecoder()
    idx, text = 0, proc.stdout.strip()
    while idx < len(text):
        page, end = decoder.raw_decode(text, idx)
        pages.append(page)
        idx = end
        while idx < len(text) and text[idx] in " \n\r\t":
            idx += 1
    return pages


def gh_api_list(path: str) -> list:
    """Fetch a paginated array endpoint, merged across pages."""
    sep = "&" if "?" in path else "?"
    merged: list = []
    for page in gh_api(f"{path}{sep}per_page=100", paginate=True):
        merged.extend(page)
    return merged


def gh_api_items(path: str, key: str, *, allow_404: bool = False) -> list:
    """Fetch a paginated `{total_count, <key>: [...]}` collection endpoint.

    Verifies the merged item count against total_count: a mismatch means
    the listing was truncated, and a truncated security audit must fail
    rather than report a hollow "clean".
    """
    sep = "&" if "?" in path else "?"
    pages = gh_api(f"{path}{sep}per_page=100", paginate=True, allow_404=allow_404)
    if pages is None:
        return []
    items: list = []
    for page in pages:
        items.extend(page.get(key, []))
    total = pages[0].get("total_count") if pages else 0
    if total is not None and total != len(items):
        raise OperationalError(
            f"gh api {path} returned {len(items)} of {total} items; "
            f"refusing to audit a truncated listing"
        )
    return items


def _installation_repository_selection() -> str | None:
    """The audit App installation's repository_selection ('all' or
    'selected'), or None when the token is not a GitHub App installation
    token. A personal access token has no installation and gets a 403 from
    /installation/repositories; that is the signal to fall back to the
    org repo-count guard."""
    page = gh_api("/installation/repositories?per_page=1", allow_403=True)
    if page is None:
        return None
    return page.get("repository_selection")


def _collect_app_installations() -> list[dict] | None:
    """Org app-installation inventory for the WEB_MERGE confinement check.

    Needs org Administration (read). Unreadable (403) collapses to None,
    which check_web_merge_confinement converts into a violation once
    WEB_MERGE material exists -- fail closed when it matters, green while
    there is nothing to confine. The web-merge repo list additionally
    needs a user token; with an app token it stays None and the check
    emits the documented warning instead.
    """
    pages = gh_api(
        f"/orgs/{ORG}/installations?per_page=100", paginate=True, allow_403=True
    )
    if pages is None:
        return None
    raw: list[dict] = []
    for page in pages:
        raw.extend(page.get("installations", []))
    total = pages[0].get("total_count") if pages else 0
    if total is not None and total != len(raw):
        raise OperationalError(
            f"/orgs/{ORG}/installations returned {len(raw)} of {total} "
            f"installations; refusing to audit a truncated listing"
        )
    installations = []
    for inst in raw:
        repos = None
        if inst.get("app_slug") == WEB_MERGE_APP_SLUG:
            repo_pages = gh_api(
                f"/user/installations/{inst['id']}/repositories?per_page=100",
                paginate=True,
                allow_403=True,
                allow_404=True,
            )
            if repo_pages is not None:
                repos = [
                    r["name"]
                    for page in repo_pages
                    for r in page.get("repositories", [])
                ]
                # Same truncation guard as every other listing: a dropped
                # page here would under-report the installation's scope
                # as confined.
                repo_total = repo_pages[0].get("total_count") if repo_pages else 0
                if repo_total is not None and repo_total != len(repos):
                    raise OperationalError(
                        f"/user/installations/{inst['id']}/repositories "
                        f"returned {len(repos)} of {repo_total} repos; "
                        f"refusing to audit a truncated listing"
                    )
        installations.append(
            {
                "app_slug": inst.get("app_slug"),
                "repository_selection": inst.get("repository_selection"),
                "permissions": inst.get("permissions") or {},
                "repos": repos,
            }
        )
    return installations


def _coerce_ruleset_id(value: Any) -> int | None:
    """A ruleset id as an int, or None if it is missing or non-integral.
    The GitHub API returns ints today; coercing keeps a stray string
    from aliasing a pinned int or reaching an API path unvalidated."""
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _serialize_bypass_actor(actor: dict) -> str:
    """Normalize a ruleset bypass-actor record to a pinnable string,
    e.g. OrganizationAdmin:always or Integration[3227426]:always. The
    actor_id is kept when present so two integrations can never alias
    each other, and the bypass_mode is kept because an always-mode
    bypass and a pull_request-only bypass are materially different
    grants."""
    actor_type = actor.get("actor_type") or "?"
    mode = actor.get("bypass_mode") or "?"
    actor_id = actor.get("actor_id")
    ident = "" if actor_id is None else f"[{actor_id}]"
    return f"{actor_type}{ident}:{mode}"


def _collect_main_branch_rules(repo_name: str) -> dict | None:
    """Leg-2 ground truth for an ISOLATION_REVIEWERLESS_ENVS repo: main's
    active rules (with their parameters) plus, per ruleset supplying
    them, the enforcement state and serialized bypass-actor list. Always
    reads `main` -- the isolation class is main-anchored regardless of
    what the default branch is set to. Only collected for pinned repos
    (one extra request per distinct ruleset). Unreadable state collapses
    to None or a missing ruleset entry, which
    _isolation_reviewerless_findings converts into
    ENV-ISOLATION-UNVERIFIED -- fail closed, never a hollow clean."""
    pages = gh_api(
        f"/repos/{ORG}/{repo_name}/rules/branches/main?per_page=100",
        paginate=True,
        allow_403=True,
    )
    if pages is None:
        return None
    raw: list[dict] = []
    for page in pages:
        raw.extend(page)
    rulesets: dict[int, dict] = {}
    for rule in raw:
        # Coerce so a (theoretical) non-int id from the API can neither
        # alias a pinned int nor smuggle a path segment into the ruleset
        # URL below.
        rid = _coerce_ruleset_id(rule.get("ruleset_id"))
        if rid is None or rid in rulesets:
            continue
        if rule.get("ruleset_source_type") == "Organization":
            ruleset = gh_api(
                f"/orgs/{ORG}/rulesets/{rid}", allow_403=True, allow_404=True
            )
        else:
            ruleset = gh_api(
                f"/repos/{ORG}/{repo_name}/rulesets/{rid}",
                allow_403=True,
                allow_404=True,
            )
        if ruleset is None:
            # Leave the entry absent; the check fails closed on any
            # required-rule ruleset whose record is missing.
            continue
        rulesets[rid] = {
            "enforcement": ruleset.get("enforcement"),
            "bypass_actors": sorted(
                _serialize_bypass_actor(a) for a in ruleset.get("bypass_actors") or []
            ),
        }
    return {
        "rules": [
            {
                "type": r.get("type"),
                # Coerced to match the rulesets-dict keys and the pinned
                # ints; a non-coercible id becomes None and fails the
                # identity match (ENV-ISOLATION-RULES), never a spurious
                # pass.
                "ruleset_id": _coerce_ruleset_id(r.get("ruleset_id")),
                "parameters": r.get("parameters"),
            }
            for r in raw
        ],
        "rulesets": rulesets,
    }


def collect_live_state() -> dict:
    org_secret_names = [
        s["name"] for s in gh_api_items(f"/orgs/{ORG}/actions/secrets", "secrets")
    ]
    app_installations = _collect_app_installations()
    repo_names = [r["name"] for r in gh_api_list(f"/orgs/{ORG}/repos")]
    # Guard against a hollow "clean" over repos the audit token cannot see.
    # An "all"-selected GitHub App installation is guaranteed access to every
    # current and future org repo, so the enumeration above is complete. Read
    # that selection from the installation's own endpoint -- an installation
    # token can always reach it with no elevated org permission, the
    # least-privilege coverage signal (granting the audit app org-admin read
    # just for a repo count would be the over-privilege this audit exists to
    # find).
    selection = _installation_repository_selection()
    if selection == "selected":
        raise OperationalError(
            "the audit app installation is scoped to selected repositories, "
            "not all -- refusing to report clean over unaudited repos"
        )
    if selection is None:
        # Not an installation token (e.g. a PAT used for local validation):
        # fall back to comparing the enumerated count against the org's own
        # totals. total_private_repos needs Organization-plan read; require it
        # rather than let expected_repos collapse to the public count.
        org_meta = gh_api(f"/orgs/{ORG}")
        if "total_private_repos" not in org_meta:
            raise OperationalError(
                "org metadata is missing total_private_repos; either run the "
                "audit as the 'all'-scoped GitHub App (preferred) or use a "
                "token with Organization-plan (read) so the installation-scope "
                "check cannot silently degrade to the public-repo count"
            )
        expected_repos = (
            org_meta.get("public_repos", 0) + org_meta["total_private_repos"]
        )
        if expected_repos and len(repo_names) < expected_repos:
            raise OperationalError(
                f"enumerated {len(repo_names)} repos but org reports "
                f"{expected_repos}; the audit token's installation is scoped "
                f"to a subset -- refusing to report clean over unaudited repos"
            )
    repos = []
    for name in sorted(repo_names):
        # A 404 here means the repo was renamed or deleted between the org
        # listing and this fetch. A renamed repo is still active, so
        # silently skipping it would report "clean" while a live repo went
        # unaudited. Fail closed (exit 2); the next run sees consistent
        # state.
        repo_meta = gh_api(f"/repos/{ORG}/{name}")

        secrets = [
            s["name"]
            for s in gh_api_items(f"/repos/{ORG}/{name}/actions/secrets", "secrets")
        ]

        collaborators = gh_api_list(
            f"/repos/{ORG}/{name}/collaborators?affiliation=all"
        )
        write_actors = [
            c["login"]
            for c in collaborators
            if c.get("permissions", {}).get("push")
            and not c.get("permissions", {}).get("admin")
        ]
        # Admins are tracked separately (they are excluded from
        # write_actors so the latent-safe/tripwire semantics stay scoped
        # to non-admin write grants); the reviewerless-environment check
        # uses this to notice the single-lead topology growing.
        admin_actors = [
            c["login"] for c in collaborators if c.get("permissions", {}).get("admin")
        ]

        # Leg-2 state for isolation-reviewerless pins; every other repo
        # carries None (the check only reads it for pinned keys).
        main_branch_rules = None
        if any(r == name for r, _ in ISOLATION_REVIEWERLESS_ENVS):
            main_branch_rules = _collect_main_branch_rules(name)

        # Scan every branch copy separately: pull_request_target runs the
        # base-ref copy, so a develop-only edit to a workflow that also
        # exists on main must not be shadowed by main's clean copy.
        workflows: dict[str, dict[str, str]] = {}
        branches = dict.fromkeys((repo_meta["default_branch"], *EXTRA_BRANCHES))
        for branch in branches:
            ref = urllib.parse.quote(branch, safe="")
            listing = gh_api(
                f"/repos/{ORG}/{name}/contents/.github/workflows?ref={ref}",
                allow_404=True,
            )
            if listing is None:
                continue
            for entry in listing:
                if not entry["name"].endswith((".yml", ".yaml")):
                    continue
                blob = gh_api(f"/repos/{ORG}/{name}/git/blobs/{entry['sha']}")
                text = base64.b64decode(blob["content"]).decode(
                    "utf-8", errors="replace"
                )
                workflows.setdefault(entry["path"], {})[branch] = text

        environments = []
        for env in gh_api_items(
            f"/repos/{ORG}/{name}/environments", "environments", allow_404=True
        ):
            # One pass over the reviewer rules yields both the count (for
            # check_reviewer_drift) and the posture (prevent_self_review +
            # reviewer identities, for check_env_protection_drift).
            # prevent_self_review stays None when there is no
            # required_reviewers rule at all (the reviewerless-baseline
            # shape) -- distinct from an explicit False. GitHub allows one
            # reviewer rule per environment; a reviewer entry without a
            # login/slug still counts toward reviewer_count but drops out
            # of the posture set, where it fails the pin comparison rather
            # than passing it. Identities keep their User/Team type: a
            # Team slugged like a pinned User login must not satisfy the
            # pin (it would broaden approval to the whole team), so a
            # type swap fails the comparison too. A missing type becomes
            # "?" -- unequal to every pinned entry, failing noisy rather
            # than matching.
            reviewer_count = 0
            prevent_self_review = None
            reviewers: list[str] = []
            for rule in env.get("protection_rules", []):
                if rule.get("type") != "required_reviewers":
                    continue
                reviewer_count += len(rule.get("reviewers", []))
                prevent_self_review = bool(rule.get("prevent_self_review"))
                for r in rule.get("reviewers", []):
                    reviewer = r.get("reviewer") or {}
                    login = reviewer.get("login") or reviewer.get("slug")
                    if login:
                        reviewers.append(f"{r.get('type') or '?'}:{login}")
            env_path = urllib.parse.quote(env["name"], safe="")
            env_secrets = gh_api_items(
                f"/repos/{ORG}/{name}/environments/{env_path}/secrets",
                "secrets",
                allow_404=True,
            )
            # Custom deployment-branch-policy names, or None when the
            # environment has no custom policy configured. Consumed by the
            # REVIEWERLESS_ENV_BASELINE verification (a reviewerless pin is
            # only sound while its main-only policy is live). The mode
            # (custom / protected / None) feeds MI-1 clause 1: a gated
            # environment must never rely on protected_branches (a PR
            # merge ref satisfies "protected") or run policy-free.
            deployment_branch_policy = env.get("deployment_branch_policy") or {}
            if deployment_branch_policy.get("custom_branch_policies"):
                branch_policy_mode = "custom"
            elif deployment_branch_policy.get("protected_branches"):
                branch_policy_mode = "protected"
            else:
                branch_policy_mode = None
            branch_policy_branches = None
            if branch_policy_mode == "custom":
                policies = gh_api_items(
                    f"/repos/{ORG}/{name}/environments/{env_path}"
                    f"/deployment-branch-policies",
                    "branch_policies",
                    allow_404=True,
                )
                # Only BRANCH-type entries count: a deployment policy can
                # also be a tag policy, and a tag named "main" would model
                # identically to the branch and satisfy leg 1 spuriously.
                # p.get("type", "branch") tolerates an API that omits the
                # field (older shape) while rejecting an explicit "tag".
                branch_policy_branches = sorted(
                    p["name"] for p in policies if p.get("type", "branch") == "branch"
                )
            environments.append(
                {
                    "name": env["name"],
                    "required_reviewers": reviewer_count,
                    "secrets": [s["name"] for s in env_secrets],
                    "branch_policy_branches": branch_policy_branches,
                    "branch_policy_mode": branch_policy_mode,
                    "prevent_self_review": prevent_self_review,
                    "can_admins_bypass": bool(env.get("can_admins_bypass")),
                    "reviewers": reviewers,
                }
            )

        repos.append(
            {
                "name": name,
                "secrets": secrets,
                "write_actors": write_actors,
                "admin_actors": admin_actors,
                "private": bool(repo_meta.get("private")),
                "default_branch": repo_meta["default_branch"],
                "main_branch_rules": main_branch_rules,
                "workflows": workflows,
                "environments": environments,
            }
        )
    return {
        "org_secrets": org_secret_names,
        "app_installations": app_installations,
        "repos": repos,
    }


def collect_local_state(workflow_dir: str, repo_name: str) -> dict:
    """Model a single repo from a local workflow directory.

    Used by workflow-lint on every PR so the bypass/SA reference
    invariants have one implementation instead of a hand-synced grep
    copy. Only WORKFLOW_TEXT_CHECKS run against this model (see main());
    the secret/environment-placement checks need the authoritative API
    inventory and run only in the scheduled --live audit.
    """
    root = pathlib.Path(workflow_dir)
    if not root.is_dir():
        raise OperationalError(f"{workflow_dir} is not a directory")
    workflows: dict[str, dict[str, str]] = {}
    for f in sorted(root.iterdir()):
        if f.suffix not in (".yml", ".yaml") or not f.is_file():
            continue
        workflows[f".github/workflows/{f.name}"] = {
            "local": f.read_text(encoding="utf-8", errors="replace")
        }
    return {
        "org_secrets": [],
        "app_installations": None,
        "repos": [
            {
                "name": repo_name,
                "secrets": [],
                "write_actors": [],
                "workflows": workflows,
                "environments": [],
            }
        ],
    }


# ---------------------------------------------------------------------
# Red-team self-test. Every violation class must be caught -- including
# the evasive trigger/accessor syntax variants -- and every allowlisted
# shape must produce its warning and nothing more. This runs in CI before
# the live audit; if a refactor breaks a check, the audit goes red before
# it can go blind.
# ---------------------------------------------------------------------


def _repo(name: str, **overrides: Any) -> dict:
    base: dict = {
        "name": name,
        "secrets": [],
        "write_actors": [],
        "workflows": {},
        "environments": [],
    }
    base.update(overrides)
    # Fixture convenience: allow {path: text} and wrap to {path: {branch:}}.
    base["workflows"] = {
        path: (text if isinstance(text, dict) else {"main": text})
        for path, text in base["workflows"].items()
    }
    return base


def self_test() -> int:
    failures: list[str] = []
    fixture_count = 0

    # The single-repo fixtures below predate any gated-environment
    # expectation; run them against an empty map so each stays isolated to
    # the bypass/SA/reviewer check it exercises. The populated
    # EXPECTED_GATED_ENVIRONMENTS is validated by dedicated fixtures at the
    # end, which set it explicitly and leave it restored.
    global EXPECTED_GATED_ENVIRONMENTS, MI1_ENFORCED_REPOS
    _production_map = EXPECTED_GATED_ENVIRONMENTS
    EXPECTED_GATED_ENVIRONMENTS = {}

    def _warn_key(w: str) -> str:
        """Warning identity for fixture assertions. ENV-ISOLATION keeps
        its repo/env subject -- "ENV-ISOLATION(website/release-gated)"
        -- because two entries are pinned and the standing warning is
        itself an assertion under test: with bare codes, the clean
        sibling's warning would mask a warning a BROKEN entry should
        never emit, and the proof that the reassurance is conditional
        on the legs would be silently lost. Every other code stays
        bare: no other warning class has two pinned emitters whose
        confusion matters (ENV-REVIEWERLESS has exactly one pinned
        entry, the discord bot)."""
        code, _, rest = w.partition(": ")
        if code == "ENV-ISOLATION":
            return f"{code}({rest.split(' ', 1)[0]})"
        return code

    def expect(
        label: str,
        state: dict,
        codes: set[str],
        warn_codes: set[str] | None = None,
    ) -> None:
        nonlocal fixture_count
        fixture_count += 1
        violations, warnings = run_checks(state)
        got = {v.split(":", 1)[0] for v in violations}
        gotw = {_warn_key(w) for w in warnings}
        # Exact match both ways: a check that fires spuriously is as
        # broken as one that never fires.
        if got != codes:
            failures.append(
                f"{label}: expected codes {codes or '{}'}, got {got or '{}'}"
            )
        if gotw != (warn_codes or set()):
            failures.append(
                f"{label}: expected warnings {warn_codes or '{}'}, got {gotw or '{}'}"
            )

    ACCESSORS = {
        "dot": "${{ secrets.MERGE_APP_ID }}",
        "bracket": "${{ secrets['MERGE_APP_ID'] }}",
        # GitHub resolves this to MERGE_APP_ID (case-insensitive lookup).
        "lowercase": "${{ secrets.merge_app_id }}",
        "spaced-dot": "${{ secrets . MERGE_APP_ID }}",
    }

    def bypass_wf(trigger_block: str, accessor: str = "dot") -> str:
        return (
            f"{trigger_block}\njobs:\n  j:\n    steps:\n"
            f"      - uses: actions/create-github-app-token@sha\n"
            f"        with:\n          app-id: {ACCESSORS[accessor]}\n"
        )

    def opaque_wf(trigger_block: str, expr: str) -> str:
        return f"{trigger_block}\njobs:\n  j:\n    steps:\n      - run: echo '{expr}'\n"

    sa_ref_wf = (
        "on:\n  pull_request:\njobs:\n  j:\n    steps:\n"
        "      - run: op read op://x\n        env:\n"
        "          OP_SERVICE_ACCOUNT_TOKEN: "
        "${{ secrets.EVIL_ACTIONS_SERVICE_ACCOUNT }}\n"
    )

    # 1. SA token as an unpinned plain repo secret -> SA-PLAIN.
    expect(
        "sa-plain",
        {
            "org_secrets": [],
            "repos": [_repo("evil-repo", secrets=["EVIL_ACTIONS_SERVICE_ACCOUNT"])],
        },
        {"SA-PLAIN"},
    )
    # 2. Latent-safe pin trips when the repo gains a write actor.
    expect(
        "sa-tripwire",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "android-unofficial",
                    secrets=["ANDROID_ACTIONS_SERVICE_ACCOUNT"],
                    write_actors=["mallory"],
                )
            ],
        },
        {"SA-TRIPWIRE"},
    )
    # 3. Pending-migration pin warns, and only warns. No real secret is
    # pending today (BACKEND_ACTIONS_SERVICE_ACCOUNT is now gated), so use a
    # synthetic pin to keep the SA-PENDING branch covered.
    SA_ALLOWLIST[("synthetic-repo", "PENDING_ACTIONS_SERVICE_ACCOUNT")] = (
        "pending-migration"
    )
    try:
        expect(
            "sa-pending-warns",
            {
                "org_secrets": [],
                "repos": [
                    _repo(
                        "synthetic-repo",
                        secrets=["PENDING_ACTIONS_SERVICE_ACCOUNT"],
                    )
                ],
            },
            set(),
            warn_codes={"SA-PENDING"},
        )
    finally:
        del SA_ALLOWLIST[("synthetic-repo", "PENDING_ACTIONS_SERVICE_ACCOUNT")]
    # 4. SA token as an org-wide secret -> SA-ORG.
    expect(
        "sa-org",
        {"org_secrets": ["ROGUE_ACTIONS_SERVICE_ACCOUNT"], "repos": []},
        {"SA-ORG"},
    )
    # 5-11. Bypass credential reachable from every documented trigger
    # shape and every accessor form -> BYPASS-PR each time. The lowercase
    # and spaced-dot accessors are the case-insensitive-lookup evasions
    # the security review found; they resolve the real token.
    for label, wf in (
        ("bypass-block-mapping", bypass_wf("on:\n  pull_request:")),
        ("bypass-flow-sequence", bypass_wf("on: [push, pull_request]")),
        ("bypass-bare-string", bypass_wf("on: pull_request_target")),
        ("bypass-quoted-key", bypass_wf('on:\n  "pull_request":')),
        ("bypass-bracket-accessor", bypass_wf("on: [pull_request]", "bracket")),
        ("bypass-lowercase-accessor", bypass_wf("on: [pull_request]", "lowercase")),
        ("bypass-spaced-dot-accessor", bypass_wf("on: [pull_request]", "spaced-dot")),
    ):
        expect(
            label,
            {
                "org_secrets": [],
                "repos": [
                    _repo("evil-repo", workflows={".github/workflows/x.yml": wf})
                ],
            },
            {"BYPASS-PR"},
        )
    # 11a. WEB_MERGE (the website-only auto-merge app, impl-5) bypasses the
    # org Protect-main ruleset, so a WEB_MERGE mint in a pull_request context
    # is BYPASS-PR -- the same class as MERGE/RELEASE. Its key is a website
    # repo secret; the website workflow that uses it is workflow_run, never
    # pull_request, and this fixture is what enforces that.
    web_merge_pr_wf = (
        "on:\n  pull_request:\njobs:\n  merge:\n    steps:\n"
        "      - uses: actions/create-github-app-token@sha\n"
        "        with:\n"
        "          app-id: ${{ secrets.WEB_MERGE_APP_ID }}\n"
        "          private-key: ${{ secrets.WEB_MERGE_APP_PRIVATE_KEY }}\n"
    )
    expect(
        "bypass-web-merge-pr",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "evil-repo", workflows={".github/workflows/x.yml": web_merge_pr_wf}
                )
            ],
        },
        {"BYPASS-PR"},
    )
    # 11b. The same WEB_MERGE mint on workflow_run (the sanctioned trusted
    # trigger the live website workflow uses) is clean -- proving the
    # invariant flags the trigger, not the mere presence of the key. RENOVATE
    # is intentionally NOT a bypass ref (it was never granted a bypass), so a
    # RENOVATE mint on pull_request stays clean here too.
    expect(
        "bypass-web-merge-workflow-run-clean",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "safe-repo",
                    workflows={
                        ".github/workflows/x.yml": web_merge_pr_wf.replace(
                            "on:\n  pull_request:", "on:\n  workflow_run:"
                        )
                    },
                )
            ],
        },
        set(),
    )
    expect(
        "renovate-mint-not-bypass",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "safe-repo",
                    workflows={
                        ".github/workflows/x.yml": web_merge_pr_wf.replace(
                            "WEB_MERGE", "RENOVATE"
                        )
                    },
                )
            ],
        },
        set(),
    )

    # 11c+. WEB_MERGE confinement: every leg of the web-merge design is
    # enforced, not asserted. The clean shape is the design itself (key as
    # plain website repo secrets, website fork-based, installation
    # selected:[website] with exactly contents+pull_requests write); each
    # RED fixture breaks one leg.
    def _web_merge_installation(**overrides: Any) -> dict:
        inst: dict = {
            "app_slug": WEB_MERGE_APP_SLUG,
            "repository_selection": "selected",
            "permissions": {
                "contents": "write",
                "metadata": "read",
                "pull_requests": "write",
            },
            "repos": ["website"],
        }
        inst.update(overrides)
        return inst

    WEB_MERGE_PAIR = ["WEB_MERGE_APP_ID", "WEB_MERGE_APP_PRIVATE_KEY"]
    expect(
        "web-merge-confined-clean",
        {
            "org_secrets": [],
            "app_installations": [_web_merge_installation()],
            "repos": [_repo("website", secrets=WEB_MERGE_PAIR)],
        },
        set(),
    )
    # The fork-based tripwire (review blocker B2): the plain bypass key
    # plus a non-admin write actor is a standing exfil path -- must fail
    # the moment website stops being fork-based.
    expect(
        "web-merge-write-actor-tripwire",
        {
            "org_secrets": [],
            "app_installations": [_web_merge_installation()],
            "repos": [
                _repo("website", secrets=WEB_MERGE_PAIR, write_actors=["mallory"])
            ],
        },
        {"WEB-MERGE-TRIPWIRE"},
    )
    expect(
        "web-merge-org-readd",
        {
            "org_secrets": ["WEB_MERGE_APP_PRIVATE_KEY"],
            "app_installations": [_web_merge_installation()],
            "repos": [_repo("website", secrets=WEB_MERGE_PAIR)],
        },
        {"WEB-MERGE-ORG"},
    )
    # GitHub resolves secret names case-insensitively, so a lowercase-named
    # copy is the real key; the existence checks must catch it (the
    # reference regexes already do -- this proves the _upper normalization
    # keeps the two sides symmetric).
    expect(
        "web-merge-lowercase-org-readd",
        {
            "org_secrets": ["web_merge_app_private_key"],
            "app_installations": [_web_merge_installation()],
            "repos": [_repo("website", secrets=WEB_MERGE_PAIR)],
        },
        {"WEB-MERGE-ORG"},
    )
    expect(
        "sa-lowercase-org",
        {"org_secrets": ["rogue_actions_service_account"], "repos": []},
        {"SA-ORG"},
    )
    expect(
        "web-merge-offsite-readd",
        {
            "org_secrets": [],
            "app_installations": [_web_merge_installation()],
            "repos": [
                _repo("website", secrets=WEB_MERGE_PAIR),
                _repo("GlycemicGPT", secrets=["WEB_MERGE_APP_PRIVATE_KEY"]),
            ],
        },
        {"WEB-MERGE-PLACEMENT"},
    )
    expect(
        "web-merge-env-copy",
        {
            "org_secrets": [],
            "app_installations": [_web_merge_installation()],
            "repos": [
                _repo(
                    "website",
                    environments=[
                        {
                            "name": "prod",
                            "required_reviewers": 1,
                            "secrets": ["WEB_MERGE_APP_PRIVATE_KEY"],
                        }
                    ],
                )
            ],
        },
        {"WEB-MERGE-PLACEMENT"},
    )
    expect(
        "web-merge-scope-widened",
        {
            "org_secrets": [],
            "app_installations": [_web_merge_installation(repository_selection="all")],
            "repos": [_repo("website", secrets=WEB_MERGE_PAIR)],
        },
        {"WEB-MERGE-SCOPE"},
    )
    expect(
        "web-merge-extra-repo",
        {
            "org_secrets": [],
            "app_installations": [
                _web_merge_installation(repos=["GlycemicGPT", "website"])
            ],
            "repos": [_repo("website", secrets=WEB_MERGE_PAIR)],
        },
        {"WEB-MERGE-SCOPE"},
    )
    expect(
        "web-merge-perms-widened",
        {
            "org_secrets": [],
            "app_installations": [
                _web_merge_installation(
                    permissions={
                        "contents": "write",
                        "metadata": "read",
                        "pull_requests": "write",
                        "workflows": "write",
                    }
                )
            ],
            "repos": [_repo("website", secrets=WEB_MERGE_PAIR)],
        },
        {"WEB-MERGE-PERMS"},
    )
    # Fail closed, not blind: key material with an unreadable installation
    # listing (or no visible installation) must never report clean.
    expect(
        "web-merge-unverifiable",
        {
            "org_secrets": [],
            "app_installations": None,
            "repos": [_repo("website", secrets=WEB_MERGE_PAIR)],
        },
        {"WEB-MERGE-UNVERIFIED"},
    )
    expect(
        "web-merge-app-missing",
        {
            "org_secrets": [],
            "app_installations": [],
            "repos": [_repo("website", secrets=WEB_MERGE_PAIR)],
        },
        {"WEB-MERGE-UNVERIFIED"},
    )
    # An app-token audit cannot enumerate another app's repo list; that
    # degrades to a warning (selection/perms/placement still verified),
    # never a silent clean.
    expect(
        "web-merge-repos-unverified-warns",
        {
            "org_secrets": [],
            "app_installations": [_web_merge_installation(repos=None)],
            "repos": [_repo("website", secrets=WEB_MERGE_PAIR)],
        },
        set(),
        warn_codes={"WEB-MERGE-REPOS-UNVERIFIED"},
    )
    # Pre-cutover shape: no WEB_MERGE material anywhere means the
    # installation legs stay quiet even when the listing is unreadable.
    expect(
        "web-merge-absent-clean",
        {
            "org_secrets": [],
            "app_installations": None,
            "repos": [_repo("website")],
        },
        set(),
    )
    # 12-13. Whole-context dumps that never name a secret -> SECRETS-DUMP.
    for label, expr in (
        ("dump-tojson", "${{ toJSON(secrets) }}"),
        ("dump-dynamic-index", "${{ secrets[matrix.key] }}"),
    ):
        expect(
            label,
            {
                "org_secrets": [],
                "repos": [
                    _repo(
                        "evil-repo",
                        workflows={
                            ".github/workflows/x.yml": opaque_wf(
                                "on:\n  pull_request:", expr
                            )
                        },
                    )
                ],
            },
            {"SECRETS-DUMP"},
        )
    # 14. A dump in a push-only workflow is fine (no PR trust boundary).
    expect(
        "dump-push-clean",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "safe-repo",
                    workflows={
                        ".github/workflows/x.yml": opaque_wf(
                            "on: push", "${{ toJSON(secrets) }}"
                        )
                    },
                )
            ],
        },
        set(),
    )
    # 10. Unparseable YAML that references a bypass credential fails
    # closed rather than slipping past the trigger parse.
    expect(
        "bypass-unparseable",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "evil-repo",
                    workflows={
                        ".github/workflows/x.yml": (
                            "on: [pull_request\n  ${{ secrets.MERGE_APP_ID }}"
                        )
                    },
                )
            ],
        },
        {"BYPASS-PR"},
    )
    # 11. A develop-only edit is caught even when main's copy is clean.
    expect(
        "bypass-develop-only",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "evil-repo",
                    workflows={
                        ".github/workflows/x.yml": {
                            "main": bypass_wf("on: push"),
                            "develop": bypass_wf("on: [pull_request]"),
                        }
                    },
                )
            ],
        },
        {"BYPASS-PR"},
    )
    # 12. Allowlisted bypass workflow warns, and only warns. The monorepo
    # auto-merge-renovate.yml pin was removed in impl-5 (its MERGE mint is
    # gone), so this exercises the android-unofficial pin that remains.
    expect(
        "bypass-pinned-warns",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "android-unofficial",
                    workflows={
                        ".github/workflows/auto-merge-renovate.yml": bypass_wf(
                            "on:\n  pull_request:"
                        )
                    },
                )
            ],
        },
        set(),
        warn_codes={"BYPASS-PENDING"},
    )
    # 12b. The pin downgrades only this file's BYPASS-PR mint -- a
    # SECRETS-DUMP smuggled into the same pinned file still fails hard
    # (the pin is not a whole-file skip).
    expect(
        "bypass-pinned-still-catches-dump",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "android-unofficial",
                    workflows={
                        ".github/workflows/auto-merge-renovate.yml": (
                            bypass_wf("on:\n  pull_request:")
                            + "      - run: echo '${{ toJSON(secrets) }}'\n"
                        )
                    },
                )
            ],
        },
        {"SECRETS-DUMP"},
        warn_codes={"BYPASS-PENDING"},
    )
    # 13. Bypass credential in a push-only workflow is fine.
    expect(
        "bypass-push-clean",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "any", workflows={".github/workflows/x.yml": bypass_wf("on: push")}
                )
            ],
        },
        set(),
    )
    # 14. SA token referenced from a pull_request workflow -> SA-REF-PR.
    expect(
        "sa-ref-pr",
        {
            "org_secrets": [],
            "repos": [
                _repo("evil-repo", workflows={".github/workflows/x.yml": sa_ref_wf})
            ],
        },
        {"SA-REF-PR"},
    )
    # 15. New environment without required reviewers -> ENV-UNGATED.
    expect(
        "env-ungated",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "evil-repo",
                    environments=[
                        {"name": "prod", "required_reviewers": 0, "secrets": []}
                    ],
                )
            ],
        },
        {"ENV-UNGATED"},
    )
    # 16. Baseline-pinned environment warns, and only warns.
    expect(
        "env-baseline-warns",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "GlycemicGPT",
                    environments=[
                        {"name": "copilot", "required_reviewers": 0, "secrets": []}
                    ],
                )
            ],
        },
        set(),
        warn_codes={"ENV-BASELINE"},
    )
    # 17-19. Gated environment drift, exercised against a temporary
    # expectation map (missing env, wrong secret set, plain re-add).
    # (EXPECTED_GATED_ENVIRONMENTS is already declared global at the top.)
    saved = EXPECTED_GATED_ENVIRONMENTS
    EXPECTED_GATED_ENVIRONMENTS = {"GlycemicGPT": {"secrets-merge": {"MERGE_SA_TOKEN"}}}
    # A None-valued synthetic posture pin: these fixtures predate the
    # posture fields, and the ratchet would otherwise (correctly) flag the
    # synthetic environment as unpinned.
    GATED_ENV_PROTECTION_BASELINE[("GlycemicGPT", "secrets-merge")] = {
        "prevent_self_review": None,
        "can_admins_bypass": None,
        "reviewers": set(),
    }
    # The synthetic non-empty map would (correctly) trip the isolation
    # pin's EXPECTED_GATED_ENVIRONMENTS membership clause; park the
    # isolation pins so these fixtures stay scoped to env-secrets drift.
    _saved_iso_pins = dict(ISOLATION_REVIEWERLESS_ENVS)
    ISOLATION_REVIEWERLESS_ENVS.clear()
    try:
        expect(
            "env-drift-missing",
            {"org_secrets": [], "repos": [_repo("GlycemicGPT")]},
            {"ENV-DRIFT"},
        )
        expect(
            "env-drift-set",
            {
                "org_secrets": [],
                "repos": [
                    _repo(
                        "GlycemicGPT",
                        environments=[
                            {
                                "name": "secrets-merge",
                                "required_reviewers": 1,
                                "secrets": ["WRONG_TOKEN"],
                            }
                        ],
                    )
                ],
            },
            {"ENV-DRIFT"},
        )
        expect(
            "env-readd",
            {
                "org_secrets": [],
                "repos": [
                    _repo(
                        "GlycemicGPT",
                        secrets=["MERGE_SA_TOKEN"],
                        environments=[
                            {
                                "name": "secrets-merge",
                                "required_reviewers": 1,
                                "secrets": ["MERGE_SA_TOKEN"],
                            }
                        ],
                    )
                ],
            },
            {"ENV-READD"},
        )
    finally:
        del GATED_ENV_PROTECTION_BASELINE[("GlycemicGPT", "secrets-merge")]
        ISOLATION_REVIEWERLESS_ENVS.update(_saved_iso_pins)
        EXPECTED_GATED_ENVIRONMENTS = saved

    # 20. Fully clean state passes with no violations and no warnings.
    expect("clean", {"org_secrets": [], "repos": []}, set())

    # 21-23. The LIVE EXPECTED_GATED_ENVIRONMENTS entries (every gated env
    # this migration establishes), validated against a real migrated state
    # and BOTH failure modes: the token removed from the gated env entirely
    # (ENV-DRIFT must fire) and re-added as a plain repo secret (the SA
    # plain-copy invariant + ENV-READD must fire). These fail if the
    # production map is emptied, so the env-drift check cannot silently
    # regress to a no-op. Restores the production map.
    EXPECTED_GATED_ENVIRONMENTS = _production_map

    RELEASE_KEY_SECRETS = ["RELEASE_APP_ID", "RELEASE_APP_PRIVATE_KEY"]
    MERGE_KEY_SECRETS = ["MERGE_APP_ID", "MERGE_APP_PRIVATE_KEY"]

    # Subject-qualified ENV-ISOLATION warning identities (see _warn_key):
    # every fixture that expects the standing warning states WHICH pinned
    # entry is still verified, so a clean sibling can never mask a
    # warning the entry under test should not emit.
    ISO_WARN_GLY = "ENV-ISOLATION(GlycemicGPT/release-gated)"
    ISO_WARN_WEB = "ENV-ISOLATION(website/release-gated)"

    # The live pull_request rule parameters of org "Protect main"
    # (14524652), one object shared by every repo's main. Both rule-state
    # builders below reference this single literal so the two fixtures
    # cannot drift apart in how they model the same live object; each
    # use takes a copy because mutation fixtures edit rules in place.
    ORG_PROTECT_MAIN_PR_PARAMS = {
        "require_code_owner_review": True,
        "required_approving_review_count": 1,
    }

    # A gated release job whose workflow also carries workflow_dispatch:
    # the exact reachability MI-1 clause 2 exists to close. Used by the
    # MI-1 fixtures below and by the isolation-reviewerless leg-3
    # fixtures, together with its compliant push-only twin and the two
    # leg-3 evasion shapes (a dynamic environment expression, which
    # resolves to the "?" sentinel, and a case-varied environment name,
    # which GitHub resolves to the same environment).
    release_dispatch_wf = (
        "on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n"
        "jobs:\n  release:\n    environment: release-gated\n    steps: []\n"
    )
    release_push_only_wf = release_dispatch_wf.replace("  workflow_dispatch:\n", "")
    dynamic_env_dispatch_wf = (
        "on:\n  workflow_dispatch:\n"
        "jobs:\n  j:\n    environment: ${{ inputs.target }}\n    steps: []\n"
    )
    cased_env_dispatch_wf = release_dispatch_wf.replace(
        "environment: release-gated", "environment: Release-Gated"
    )
    canary_dispatch_wf = (
        "on:\n  workflow_dispatch:\n"
        "jobs:\n  canary:\n    environment: op-github-gated\n"
        "    steps:\n      - uses: actions/checkout@sha\n"
        "        with:\n          ref: main\n"
    )

    def _main_rules(
        *,
        drop_rule: str | None = None,
        resupply_rule: str | None = None,
        extra_bypass: str | None = None,
        evaluate_rid: int | None = None,
        update_fetch_merge: bool = False,
        pr_review_weakened: bool = False,
    ) -> dict:
        """The monorepo main branch's live rule state (verified
        2026-08-14), the leg-2 ground truth of the isolation-reviewerless
        pin. The deletion/non_fast_forward rules and ruleset 16216189 are
        live noise the required-rule matching must ignore. Mutations, one
        per red-team fixture: drop_rule removes one required rule;
        resupply_rule keeps the rule type but swaps in a substitute
        ruleset id; extra_bypass adds a bypass actor to "Protect main"
        beyond its pinned bound; evaluate_rid downgrades a ruleset's
        enforcement; update_fetch_merge enables the fetch-and-merge
        loophole on the update rule; pr_review_weakened flips
        require_code_owner_review off on the pinned pull_request rule
        (the content checkpoint the parameter pin exists to hold)."""
        rules = [
            {"type": "deletion", "ruleset_id": 16216189, "parameters": None},
            {"type": "deletion", "ruleset_id": 14524652, "parameters": None},
            {"type": "non_fast_forward", "ruleset_id": 14524652, "parameters": None},
            {
                "type": "pull_request",
                "ruleset_id": 14524652,
                "parameters": {
                    **ORG_PROTECT_MAIN_PR_PARAMS,
                    **(
                        {"require_code_owner_review": False}
                        if pr_review_weakened
                        else {}
                    ),
                },
            },
            {
                "type": "update",
                "ruleset_id": 18965811,
                "parameters": (
                    {"update_allows_fetch_and_merge": True}
                    if update_fetch_merge
                    else None
                ),
            },
        ]
        if drop_rule:
            rules = [r for r in rules if r["type"] != drop_rule]
        if resupply_rule:
            for r in rules:
                if r["type"] == resupply_rule:
                    r["ruleset_id"] = 99999999
        protect_main = [
            "Integration[3227426]:always",
            "Integration[4342011]:always",
            "OrganizationAdmin:always",
        ]
        if extra_bypass:
            protect_main = sorted([*protect_main, extra_bypass])
        rulesets = {
            16216189: {"enforcement": "active", "bypass_actors": []},
            14524652: {"enforcement": "active", "bypass_actors": protect_main},
            18965811: {
                "enforcement": "active",
                "bypass_actors": [
                    "Integration[3227286]:always",
                    "Integration[3227426]:always",
                    "Integration[4342011]:always",
                    "OrganizationAdmin:always",
                ],
            },
        }
        if evaluate_rid:
            rulesets[evaluate_rid]["enforcement"] = "evaluate"
        return {"rules": rules, "rulesets": rulesets}

    def _website_main_rules(
        *,
        drop_pinned_pr: bool = False,
        cross_ruleset_bypass: bool = False,
        evaluate_rid: int | None = None,
        pr_review_weakened: bool = False,
    ) -> dict:
        """The website main branch's live rule state (verified
        2026-08-15), leg-2 ground truth of the website
        isolation-reviewerless pin. Alongside the same two pinned org
        rulesets as the monorepo, website main carries repo-level
        ruleset 14700912 -- whose pull_request rule requires ZERO
        approvals and no code-owner review -- as live noise. Its laxer
        same-typed rule must not disturb the pin: the identity match
        rejects it by ruleset id, and the pinned pull_request
        parameters are asserted on 14524652's rule, never on this one.
        Mutations: drop_pinned_pr removes 14524652's pull_request rule
        while LEAVING 14700912's, proving the zero-approval repo rule
        cannot stand in for the pinned one; cross_ruleset_bypass adds
        the release app (legitimately bounded on 18965811 ONLY) to
        14524652's list -- the exact "moving an actor from one ruleset
        to another" widening that a per-ruleset bound catches and a
        union of bounds would wave through; evaluate_rid downgrades a
        ruleset's enforcement; pr_review_weakened flips
        require_code_owner_review off on the pinned pull_request rule."""
        rules = [
            {"type": "deletion", "ruleset_id": 16216189, "parameters": None},
            {"type": "deletion", "ruleset_id": 14524652, "parameters": None},
            {"type": "non_fast_forward", "ruleset_id": 14524652, "parameters": None},
            {
                "type": "pull_request",
                "ruleset_id": 14524652,
                "parameters": {
                    **ORG_PROTECT_MAIN_PR_PARAMS,
                    **(
                        {"require_code_owner_review": False}
                        if pr_review_weakened
                        else {}
                    ),
                },
            },
            {"type": "update", "ruleset_id": 18965811, "parameters": None},
            {
                "type": "pull_request",
                "ruleset_id": 14700912,
                "parameters": {
                    "required_approving_review_count": 0,
                    "require_code_owner_review": False,
                },
            },
            {"type": "non_fast_forward", "ruleset_id": 14700912, "parameters": None},
            {
                "type": "required_status_checks",
                "ruleset_id": 14700912,
                "parameters": None,
            },
        ]
        if drop_pinned_pr:
            rules = [
                r
                for r in rules
                if not (r["type"] == "pull_request" and r["ruleset_id"] == 14524652)
            ]
        protect_main = [
            "Integration[3227426]:always",
            "Integration[4342011]:always",
            "OrganizationAdmin:always",
        ]
        if cross_ruleset_bypass:
            protect_main = sorted([*protect_main, "Integration[3227286]:always"])
        rulesets = {
            16216189: {"enforcement": "active", "bypass_actors": []},
            14524652: {"enforcement": "active", "bypass_actors": protect_main},
            18965811: {
                "enforcement": "active",
                "bypass_actors": [
                    "Integration[3227286]:always",
                    "Integration[3227426]:always",
                    "Integration[4342011]:always",
                    "OrganizationAdmin:always",
                ],
            },
            14700912: {
                "enforcement": "active",
                "bypass_actors": [
                    "Integration[3227426]:always",
                    "OrganizationAdmin:always",
                ],
            },
        }
        if evaluate_rid:
            rulesets[evaluate_rid]["enforcement"] = "evaluate"
        return {"rules": rules, "rulesets": rulesets}

    def _migrated_repos(
        *,
        plain_backend: bool = False,
        drop_backend_from_env: bool = False,
        drop_merge_from_env: bool = False,
        drop_android_merge: bool = False,
        plain_merge: bool = False,
        discord_write_actor: bool = False,
        discord_policy_drift: bool = False,
        discord_public: bool = False,
        discord_second_admin: bool = False,
        psr_flip: bool = False,
        cab_flip: bool = False,
        reviewer_swap: bool = False,
        reviewer_type_swap: bool = False,
        iso_policy_widened: bool = False,
        iso_rule_dropped: bool = False,
        iso_rule_resupplied: bool = False,
        iso_bypass_widened: bool = False,
        iso_enforcement_evaluate: bool = False,
        iso_update_fetch_merge: bool = False,
        iso_pr_review_weakened: bool = False,
        iso_second_admin: bool = False,
        iso_default_branch_flipped: bool = False,
        iso_reviewer_readded: bool = False,
        iso_mi1_dispatch: bool = False,
        iso_mi1_dynamic_env: bool = False,
        iso_mi1_cased_env: bool = False,
        iso_push_only_wf: bool = False,
        iso_canary_wf: bool = False,
        iso_no_workflows: bool = False,
        iso_rules_unreadable: bool = False,
        web_policy_widened: bool = False,
        web_rule_dropped: bool = False,
        web_bypass_widened: bool = False,
        web_enforcement_evaluate: bool = False,
        web_pr_review_weakened: bool = False,
        web_second_admin: bool = False,
        web_default_branch_flipped: bool = False,
        web_mi1_dispatch: bool = False,
        web_no_workflows: bool = False,
        web_rules_unreadable: bool = False,
        web_reviewer_readded: bool = False,
    ) -> list[dict]:
        """Every gated repo in its post-migration shape, mutated per the
        failure mode under test. Mirrors EXPECTED_GATED_ENVIRONMENTS so a new
        production entry that is not modelled here surfaces as a drift.
        psr_flip/cab_flip/reviewer_swap/reviewer_type_swap mutate the
        op-github-gated reviewer-rule posture (the reviewer-bearing env
        holding the BACKEND SA crown jewel); reviewer_type_swap keeps the
        pinned NAME but flips User -> Team (a team slugged like the lead
        must not satisfy the pin). The iso_* flags each falsify one leg of
        the monorepo release-gated isolation-reviewerless contract; the
        web_* flags do the same for the website entry, independently, so
        a website leg break is proven to go red on its own while the
        monorepo's legs stay verified (and vice versa)."""
        gly_op_secrets = (
            [] if drop_backend_from_env else ["BACKEND_ACTIONS_SERVICE_ACCOUNT"]
        )
        # MERGE gates on the 4 consuming repos (monorepo, website, discord,
        # android) in release-gated. drop_merge_from_env models the env
        # losing it; plain_merge models a plain repo re-add on the monorepo;
        # drop_android_merge isolates android (the repo a default-branch grep
        # misses) so its drift coverage is proven on its own.
        merge_env = [] if drop_merge_from_env else MERGE_KEY_SECRETS
        android_merge_env = (
            [] if (drop_merge_from_env or drop_android_merge) else MERGE_KEY_SECRETS
        )
        gly_release_secrets = RELEASE_KEY_SECRETS + merge_env
        gly_plain = (["BACKEND_ACTIONS_SERVICE_ACCOUNT"] if plain_backend else []) + (
            MERGE_KEY_SECRETS if plain_merge else []
        )
        # Live posture on every reviewer-bearing gated env (verified
        # 2026-07-18, typed 2026-07-19): reviewer User:jlengelbrecht,
        # can_admins_bypass=false; prevent_self_review=true on
        # op-github-gated, false (by design, pinned) on
        # android-unofficial's release-gated env. The monorepo's and
        # website's release-gated are reviewerless by design
        # (ISOLATION_REVIEWERLESS_ENVS).
        lead_gate = {
            "can_admins_bypass": False,
            "reviewers": ["User:jlengelbrecht"],
        }
        # Default the monorepo to its real compliant shape -- a
        # push:main-only gated release workflow -- so every isolation
        # fixture exercises a NON-vacuous leg 3 (an empty inventory now
        # fails closed as ENV-ISOLATION-UNVERIFIED). Individual fixtures
        # override release.yml to inject a reachability defect, or set
        # iso_no_workflows to model the unreadable-inventory case.
        gly_workflows: dict[str, str] = {}
        if not iso_no_workflows:
            gly_workflows[".github/workflows/release.yml"] = release_push_only_wf
        if iso_mi1_dispatch:
            gly_workflows[".github/workflows/release.yml"] = release_dispatch_wf
        if iso_push_only_wf:
            gly_workflows[".github/workflows/release.yml"] = release_push_only_wf
        if iso_mi1_dynamic_env:
            gly_workflows[".github/workflows/dynamic.yml"] = dynamic_env_dispatch_wf
        if iso_mi1_cased_env:
            gly_workflows[".github/workflows/cased.yml"] = cased_env_dispatch_wf
        if iso_canary_wf:
            gly_workflows[".github/workflows/secrets-plumbing-check.yml"] = (
                canary_dispatch_wf
            )
        # Website's real gated surface is changelog.yml alone; the ported
        # shape is push:main-only (web_mi1_dispatch restores the
        # pre-port workflow_dispatch, the exact reachability the website
        # PR removed).
        web_workflows: dict[str, str] = {}
        if not web_no_workflows:
            web_workflows[".github/workflows/changelog.yml"] = (
                release_dispatch_wf if web_mi1_dispatch else release_push_only_wf
            )
        return [
            # Modeled with the production write-actor set and public
            # visibility: the class must tolerate a PUBLIC repo with
            # non-admin write actors (neither property is a leg), and
            # the monorepo is the entry that exercises both -- website
            # below is public with a zero-write-actor roster, so the two
            # entries cover both shapes the class spans.
            _repo(
                "GlycemicGPT",
                secrets=gly_plain,
                write_actors=["DanielDanielsson", "seitzbg"],
                private=False,
                admin_actors=(
                    ["jlengelbrecht", "mallory"]
                    if iso_second_admin
                    else ["jlengelbrecht"]
                ),
                default_branch=("develop" if iso_default_branch_flipped else "main"),
                main_branch_rules=(
                    None
                    if iso_rules_unreadable
                    else _main_rules(
                        drop_rule=("pull_request" if iso_rule_dropped else None),
                        resupply_rule=("pull_request" if iso_rule_resupplied else None),
                        extra_bypass=(
                            "Team[9999]:always" if iso_bypass_widened else None
                        ),
                        evaluate_rid=(14524652 if iso_enforcement_evaluate else None),
                        update_fetch_merge=iso_update_fetch_merge,
                        pr_review_weakened=iso_pr_review_weakened,
                    )
                ),
                workflows=gly_workflows,
                environments=[
                    {
                        "name": "op-github-gated",
                        "required_reviewers": 1,
                        "secrets": gly_op_secrets,
                        "branch_policy_mode": "custom",
                        "branch_policy_branches": ["main"],
                        "prevent_self_review": not psr_flip,
                        "can_admins_bypass": cab_flip,
                        "reviewers": (
                            ["User:mallory"]
                            if reviewer_swap
                            else (
                                ["Team:jlengelbrecht"]
                                if reviewer_type_swap
                                else ["User:jlengelbrecht"]
                            )
                        ),
                    },
                    {
                        "name": "release-gated",
                        "required_reviewers": 1 if iso_reviewer_readded else 0,
                        "secrets": gly_release_secrets,
                        "branch_policy_mode": "custom",
                        "branch_policy_branches": (
                            ["develop", "main"] if iso_policy_widened else ["main"]
                        ),
                        # Reviewerless: no reviewer rule at all, so
                        # prevent_self_review is None (the discord shape).
                        "prevent_self_review": (
                            False if iso_reviewer_readded else None
                        ),
                        "can_admins_bypass": False,
                        "reviewers": (
                            ["User:jlengelbrecht"] if iso_reviewer_readded else []
                        ),
                    },
                ],
            ),
            _repo(
                "ios-unofficial",
                environments=[
                    {
                        "name": "op-github-gated",
                        "required_reviewers": 1,
                        "secrets": ["IOS_ACTIONS_SERVICE_ACCOUNT"],
                        "prevent_self_review": True,
                        **lead_gate,
                    }
                ],
            ),
            # Reviewerless by verified isolation like the monorepo entry
            # (trunk-on-main, zero non-admin write actors live, though
            # the class does not depend on the latter). Modeled public
            # with the full leg-1/2/3 shape so every website fixture
            # exercises a non-vacuous contract.
            _repo(
                "website",
                private=False,
                admin_actors=(
                    ["jlengelbrecht", "mallory"]
                    if web_second_admin
                    else ["jlengelbrecht"]
                ),
                default_branch=("trunk" if web_default_branch_flipped else "main"),
                main_branch_rules=(
                    None
                    if web_rules_unreadable
                    else _website_main_rules(
                        drop_pinned_pr=web_rule_dropped,
                        cross_ruleset_bypass=web_bypass_widened,
                        evaluate_rid=(18965811 if web_enforcement_evaluate else None),
                        pr_review_weakened=web_pr_review_weakened,
                    )
                ),
                workflows=web_workflows,
                environments=[
                    {
                        "name": "release-gated",
                        "required_reviewers": 1 if web_reviewer_readded else 0,
                        "secrets": RELEASE_KEY_SECRETS + merge_env,
                        "branch_policy_mode": "custom",
                        "branch_policy_branches": (
                            ["main", "preview"] if web_policy_widened else ["main"]
                        ),
                        "prevent_self_review": (
                            False if web_reviewer_readded else None
                        ),
                        "can_admins_bypass": False,
                        "reviewers": (
                            ["User:jlengelbrecht"] if web_reviewer_readded else []
                        ),
                    }
                ],
            ),
            _repo(
                "android-unofficial",
                environments=[
                    {
                        "name": "release-gated",
                        "required_reviewers": 1,
                        "secrets": RELEASE_KEY_SECRETS + android_merge_env,
                        "prevent_self_review": False,
                        **lead_gate,
                    }
                ],
            ),
            # Private repo: no required-reviewer rule available on the org
            # plan; pinned in REVIEWERLESS_ENV_BASELINE, so the clean state
            # carries a permanent ENV-REVIEWERLESS warning while both
            # verified compensations (main-only policy, no write actors)
            # hold.
            _repo(
                "glycemicgpt-discord-bot",
                write_actors=(["mallory"] if discord_write_actor else []),
                admin_actors=(
                    ["jlengelbrecht", "mallory"]
                    if discord_second_admin
                    else ["jlengelbrecht"]
                ),
                private=not discord_public,
                environments=[
                    {
                        "name": "release-gated",
                        "required_reviewers": 0,
                        "secrets": RELEASE_KEY_SECRETS + merge_env,
                        "branch_policy_branches": (
                            None if discord_policy_drift else ["main"]
                        ),
                        # No reviewer rule at all (reviewerless pin), so
                        # prevent_self_review is None, not False.
                        "prevent_self_review": None,
                        "can_admins_bypass": False,
                        "reviewers": [],
                    }
                ],
            ),
        ]

    expect(
        "gated-tokens-migrated-clean",
        {"org_secrets": [], "repos": _migrated_repos()},
        set(),
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
    )
    expect(
        "gated-token-removed-from-env",
        {"org_secrets": [], "repos": _migrated_repos(drop_backend_from_env=True)},
        {"ENV-DRIFT"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
    )
    expect(
        "gated-token-plain-readd",
        {"org_secrets": [], "repos": _migrated_repos(plain_backend=True)},
        {"SA-PLAIN", "ENV-READD"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
    )
    # 24-25. The release-gated failure modes this migration must never let
    # regress silently: the RELEASE key re-added at org level (its
    # pre-migration home), and the reviewerless discord pin tripping the
    # moment that repo gains a write actor.
    expect(
        "release-key-org-readd",
        {
            "org_secrets": ["RELEASE_APP_ID", "RELEASE_APP_PRIVATE_KEY"],
            "repos": _migrated_repos(),
        },
        {"ENV-READD-ORG"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
    )
    # 28-30. The MERGE closure (GLY-56.24 impl-5) must never regress
    # silently either: MERGE dropped from the gated env, MERGE re-added as
    # a plain repo secret, or MERGE re-added at org level (its
    # pre-migration home -- the single most dangerous re-add, org-wide
    # merge-anything readable by every repo's non-environment jobs).
    expect(
        "merge-key-removed-from-env",
        {"org_secrets": [], "repos": _migrated_repos(drop_merge_from_env=True)},
        {"ENV-DRIFT"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
    )
    # Explicit android coverage: android is the repo a default-branch grep
    # misses (its workflows live on develop, its main is empty), so prove its
    # MERGE gating is drift-tracked on its own.
    expect(
        "merge-key-removed-from-env-android",
        {"org_secrets": [], "repos": _migrated_repos(drop_android_merge=True)},
        {"ENV-DRIFT"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
    )
    expect(
        "merge-key-plain-readd",
        {"org_secrets": [], "repos": _migrated_repos(plain_merge=True)},
        {"ENV-READD"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
    )
    expect(
        "merge-key-org-readd",
        {
            "org_secrets": ["MERGE_APP_ID", "MERGE_APP_PRIVATE_KEY"],
            "repos": _migrated_repos(),
        },
        {"ENV-READD-ORG"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
    )
    # Case-insensitive lookup means a lowercase-named org re-add is the
    # real MERGE key; the drift check must not be evaded by casing.
    expect(
        "merge-key-lowercase-org-readd",
        {
            "org_secrets": ["merge_app_id", "merge_app_private_key"],
            "repos": _migrated_repos(),
        },
        {"ENV-READD-ORG"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
    )
    expect(
        "reviewerless-env-write-actor-tripwire",
        {"org_secrets": [], "repos": _migrated_repos(discord_write_actor=True)},
        {"ENV-REVIEWERLESS-TRIPWIRE"},
        warn_codes={ISO_WARN_GLY, ISO_WARN_WEB},
    )
    expect(
        "reviewerless-env-policy-drift",
        {"org_secrets": [], "repos": _migrated_repos(discord_policy_drift=True)},
        {"ENV-REVIEWERLESS-POLICY"},
        warn_codes={ISO_WARN_GLY, ISO_WARN_WEB},
    )
    expect(
        "reviewerless-env-goes-public",
        {"org_secrets": [], "repos": _migrated_repos(discord_public=True)},
        {"ENV-REVIEWERLESS-PUBLIC"},
        warn_codes={ISO_WARN_GLY, ISO_WARN_WEB},
    )
    expect(
        "reviewerless-env-second-admin",
        {"org_secrets": [], "repos": _migrated_repos(discord_second_admin=True)},
        {"ENV-REVIEWERLESS-ADMINS"},
        warn_codes={ISO_WARN_GLY, ISO_WARN_WEB},
    )

    # The isolation-reviewerless contract (monorepo release-gated, the
    # release-gate pattern's reviewer removal), every leg falsified one
    # at a time. The clean shape is covered by every *-clean fixture
    # above (the standing ENV-ISOLATION warning); each fixture here
    # proves the class FAILS -- red-team proof, not happy-path proof.
    # The website entry stays clean throughout this block, so the
    # ENV-ISOLATION code in each warn set is website's standing warning
    # -- which is itself part of the proof: a monorepo leg break must
    # not disturb the sibling entry's verification (the website block
    # below proves the converse).
    # Leg 1: deployment branch policy re-widened past {main}. MI-1
    # clause 1 sees the same widening against the pinned bound, so both
    # controls fire.
    expect(
        "isolation-env-policy-widened",
        {"org_secrets": [], "repos": _migrated_repos(iso_policy_widened=True)},
        {"ENV-ISOLATION-POLICY", "MI1-POLICY"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    # Leg 2, the ways a non-lead gains push to main, one per fixture: a
    # required rule dropped from main; the same rule type resupplied by a
    # substitute ruleset (identity, not just presence, is pinned); a
    # bypass actor added beyond "Protect main"'s own pinned bound (a
    # Team -- individuals get ruleset bypass via team or role, never a
    # User actor type); a pinned ruleset downgraded to evaluate
    # enforcement; the update rule's fetch-and-merge loophole enabled; a
    # second admin joining the OrganizationAdmin blanket bypass; and the
    # default branch flipped off main (which would silently redirect the
    # leg-3 workflow scan).
    expect(
        "isolation-env-main-rule-dropped",
        {"org_secrets": [], "repos": _migrated_repos(iso_rule_dropped=True)},
        {"ENV-ISOLATION-RULES"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    expect(
        "isolation-env-rule-resupplied",
        {"org_secrets": [], "repos": _migrated_repos(iso_rule_resupplied=True)},
        {"ENV-ISOLATION-RULES"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    expect(
        "isolation-env-bypass-widened",
        {"org_secrets": [], "repos": _migrated_repos(iso_bypass_widened=True)},
        {"ENV-ISOLATION-BYPASS"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    expect(
        "isolation-env-ruleset-evaluate",
        {"org_secrets": [], "repos": _migrated_repos(iso_enforcement_evaluate=True)},
        {"ENV-ISOLATION-RULES"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    expect(
        "isolation-env-update-fetch-merge",
        {"org_secrets": [], "repos": _migrated_repos(iso_update_fetch_merge=True)},
        {"ENV-ISOLATION-RULES"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    # The content checkpoint weakened on the monorepo: code-owner review
    # flipped off on the pinned pull_request rule (see the website
    # block's twin for the rationale -- the rule survives every other
    # leg check, so only the required_rule_parameters comparison can
    # catch it).
    expect(
        "isolation-env-pr-review-weakened",
        {"org_secrets": [], "repos": _migrated_repos(iso_pr_review_weakened=True)},
        {"ENV-ISOLATION-RULES"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    expect(
        "isolation-env-second-admin",
        {"org_secrets": [], "repos": _migrated_repos(iso_second_admin=True)},
        {"ENV-ISOLATION-ADMINS"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    expect(
        "isolation-env-default-branch-flipped",
        {
            "org_secrets": [],
            "repos": _migrated_repos(iso_default_branch_flipped=True),
        },
        {"ENV-ISOLATION-BRANCH"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    # Leg 3: an MI-1 violation touching the environment's jobs (dispatch
    # reachability re-introduced). The full MI-1 scan reports it too --
    # two controls notice. The dynamic-environment shape exercises the
    # "?" sentinel the scoped scan deliberately retains, and the cased
    # shape proves a case-varied environment name (which GitHub resolves
    # to the same environment) cannot slip the scope filter.
    expect(
        "isolation-env-mi1-dispatch",
        {"org_secrets": [], "repos": _migrated_repos(iso_mi1_dispatch=True)},
        {"ENV-ISOLATION-MI1", "MI1-DISPATCH"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    expect(
        "isolation-env-mi1-dynamic-env",
        {"org_secrets": [], "repos": _migrated_repos(iso_mi1_dynamic_env=True)},
        {"ENV-ISOLATION-MI1", "MI1-DISPATCH"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    expect(
        "isolation-env-mi1-cased-env",
        {"org_secrets": [], "repos": _migrated_repos(iso_mi1_cased_env=True)},
        {"ENV-ISOLATION-MI1", "MI1-DISPATCH"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    # And leg 3's non-vacuous clean shape: the real release workflow
    # (push:main only, gated job) scans clean, so the ENV-ISOLATION
    # warning's "MI-1 clean for its jobs" is earned, not an empty scan.
    expect(
        "isolation-env-compliant-workflow-clean",
        {"org_secrets": [], "repos": _migrated_repos(iso_push_only_wf=True)},
        set(),
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
    )
    # Unreadable rule state fails closed, never green -- and it must not
    # suppress the independent admin leg (they read different endpoints).
    expect(
        "isolation-env-rules-unreadable",
        {"org_secrets": [], "repos": _migrated_repos(iso_rules_unreadable=True)},
        {"ENV-ISOLATION-UNVERIFIED"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    # Leg 3 has no silent-clean either: an isolation repo with no
    # collected workflow inventory fails closed like legs 1 and 2.
    expect(
        "isolation-env-no-workflow-inventory",
        {"org_secrets": [], "repos": _migrated_repos(iso_no_workflows=True)},
        {"ENV-ISOLATION-UNVERIFIED"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    expect(
        "isolation-env-rules-unreadable-second-admin",
        {
            "org_secrets": [],
            "repos": _migrated_repos(iso_rules_unreadable=True, iso_second_admin=True),
        },
        {"ENV-ISOLATION-UNVERIFIED", "ENV-ISOLATION-ADMINS"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    # A malformed pin met by a LIVE reviewerless environment refuses
    # verification (ENV-ISOLATION-UNVERIFIED) alongside the static
    # ENV-ISOLATION-PIN, instead of KeyError-crashing the audit.
    _iso_live_key = ("GlycemicGPT", "release-gated")
    _saved_live_entry = ISOLATION_REVIEWERLESS_ENVS[_iso_live_key]
    ISOLATION_REVIEWERLESS_ENVS[_iso_live_key] = {"lead": "jlengelbrecht"}
    try:
        expect(
            "isolation-env-malformed-pin-live",
            {"org_secrets": [], "repos": _migrated_repos()},
            {"ENV-ISOLATION-PIN", "ENV-ISOLATION-UNVERIFIED"},
            warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
        )
    finally:
        ISOLATION_REVIEWERLESS_ENVS[_iso_live_key] = _saved_live_entry
    # A reviewer REAPPEARING on the isolation-pinned env is posture
    # drift: someone changed release controls outside a reviewed PR.
    # (This fixture exercises check_env_protection_drift, not the
    # isolation legs -- with a reviewer present, check_reviewer_drift
    # skips the env entirely, so the monorepo's own ENV-ISOLATION
    # warning is absent; the ENV-ISOLATION code in the warn set is the
    # still-verified website entry's.)
    expect(
        "isolation-env-reviewer-readded",
        {"org_secrets": [], "repos": _migrated_repos(iso_reviewer_readded=True)},
        {"ENV-PROTECTION"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_WEB},
    )
    # And the converse spurious-fire proof: the dispatch-only canary
    # (clause-5 escape hatch, op-github-gated) must NOT trip leg 3 --
    # the isolation scan is scoped to jobs declaring the isolation env,
    # and the canary's sanctioned dispatch reachability belongs to the
    # reviewer-bearing sibling alone.
    expect(
        "isolation-env-ignores-dispatch-safe-sibling",
        {"org_secrets": [], "repos": _migrated_repos(iso_canary_wf=True)},
        set(),
        warn_codes={
            "ENV-REVIEWERLESS",
            ISO_WARN_GLY,
            ISO_WARN_WEB,
            "MI1-DISPATCH-PINNED",
        },
    )

    # The WEBSITE isolation-reviewerless contract, every leg falsified
    # individually while the monorepo entry stays verified (its standing
    # ENV-ISOLATION warning is the code that persists in each warn set):
    # a website leg break goes red on its own evidence, naming website.
    # This matters beyond website itself -- the monorepo pin's leg 2
    # relies on website's copy of the org-wide keys being guarded by
    # THIS contract (see the reliance note on the monorepo entry), so
    # these fixtures are also the proof that reliance cannot rot
    # silently.
    # Leg 1: website's deployment branch policy re-widened past {main}.
    expect(
        "isolation-env-website-policy-widened",
        {"org_secrets": [], "repos": _migrated_repos(web_policy_widened=True)},
        {"ENV-ISOLATION-POLICY", "MI1-POLICY"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY},
    )
    # Leg 2: the pinned pull_request rule (org 14524652) dropped from
    # website main while repo ruleset 14700912's ZERO-APPROVAL
    # pull_request rule remains -- the laxer same-typed rule must not
    # satisfy the pinned identity, so aggregation genuinely covers the
    # zero-approval setting rather than being fooled by it.
    expect(
        "isolation-env-website-pinned-rule-dropped",
        {"org_secrets": [], "repos": _migrated_repos(web_rule_dropped=True)},
        {"ENV-ISOLATION-RULES"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY},
    )
    # Leg 2: the release app -- legitimately bounded on 18965811 ONLY --
    # appears on 14524652's bypass list. A per-ruleset bound catches
    # this cross-ruleset move; a union of the entry's bounds would wave
    # it through, so this fixture is what keeps the "never a union"
    # property non-vacuous (the monorepo block's Team[9999] widening is
    # foreign to every bound and cannot tell the two apart).
    expect(
        "isolation-env-website-bypass-widened",
        {"org_secrets": [], "repos": _migrated_repos(web_bypass_widened=True)},
        {"ENV-ISOLATION-BYPASS"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY},
    )
    # Leg 2: a pinned ruleset downgraded to evaluate enforcement (the
    # update ruleset this time; the monorepo block downgrades 14524652).
    expect(
        "isolation-env-website-ruleset-evaluate",
        {
            "org_secrets": [],
            "repos": _migrated_repos(web_enforcement_evaluate=True),
        },
        {"ENV-ISOLATION-RULES"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY},
    )
    # Leg 2: the content checkpoint weakened -- code-owner review
    # flipped off on the pinned pull_request rule. The rule is still
    # present, active, and supplied by its pinned ruleset; only the
    # pinned parameter drifts, so this is what proves
    # required_rule_parameters is compared, not decoration.
    expect(
        "isolation-env-website-pr-review-weakened",
        {
            "org_secrets": [],
            "repos": _migrated_repos(web_pr_review_weakened=True),
        },
        {"ENV-ISOLATION-RULES"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY},
    )
    # Leg 2: a second admin on the website repo (OrganizationAdmin is a
    # blanket bypass on both pinned rulesets).
    expect(
        "isolation-env-website-second-admin",
        {"org_secrets": [], "repos": _migrated_repos(web_second_admin=True)},
        {"ENV-ISOLATION-ADMINS"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY},
    )
    # Leg 2: website's default branch flipped off main.
    expect(
        "isolation-env-website-default-branch-flipped",
        {
            "org_secrets": [],
            "repos": _migrated_repos(web_default_branch_flipped=True),
        },
        {"ENV-ISOLATION-BRANCH"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY},
    )
    # Leg 3: changelog.yml regains workflow_dispatch -- the exact
    # pre-port reachability the website PR removed.
    expect(
        "isolation-env-website-mi1-dispatch",
        {"org_secrets": [], "repos": _migrated_repos(web_mi1_dispatch=True)},
        {"ENV-ISOLATION-MI1", "MI1-DISPATCH"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY},
    )
    # Fail-closed twins of the monorepo block's unverifiable states.
    expect(
        "isolation-env-website-rules-unreadable",
        {"org_secrets": [], "repos": _migrated_repos(web_rules_unreadable=True)},
        {"ENV-ISOLATION-UNVERIFIED"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY},
    )
    expect(
        "isolation-env-website-no-workflow-inventory",
        {"org_secrets": [], "repos": _migrated_repos(web_no_workflows=True)},
        {"ENV-ISOLATION-UNVERIFIED"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY},
    )
    # The website cutover window's live shape (reviewer still on, pin
    # already reviewer-free) is exactly one expected posture finding --
    # the CUTOVER RECORD's contract.
    expect(
        "isolation-env-website-reviewer-readded",
        {"org_secrets": [], "repos": _migrated_repos(web_reviewer_readded=True)},
        {"ENV-PROTECTION"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY},
    )
    # Dependency-rot proof: if website's release-gated holds the
    # org-wide keys reviewerless but is NOT pinned in
    # ISOLATION_REVIEWERLESS_ENVS, the audit goes RED (ENV-UNGATED via
    # check_reviewer_drift's else branch), never silently green -- the
    # monorepo's transitive reliance on website's leg 2 cannot decay
    # into an unpinned, unverified reviewerless environment.
    _web_iso_key = ("website", "release-gated")
    _saved_web_entry = ISOLATION_REVIEWERLESS_ENVS.pop(_web_iso_key)
    try:
        expect(
            "isolation-env-website-unpinned-red",
            {"org_secrets": [], "repos": _migrated_repos()},
            {"ENV-UNGATED"},
            warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY},
        )
    finally:
        ISOLATION_REVIEWERLESS_ENVS[_web_iso_key] = _saved_web_entry

    # 31-34. Reviewer-rule posture drift on the reviewer-bearing
    # op-github-gated env (the BACKEND SA crown jewel; the monorepo
    # release-gated is reviewerless by design and its posture drift is
    # covered by isolation-env-reviewer-readded above):
    # prevent_self_review flipped -- the point is that changing it must
    # be a reviewed edit, not silent -- can_admins_bypass flipped, the
    # reviewer swapped to a write actor, and a gated env added without
    # declaring its posture.
    expect(
        "gated-env-prevent-self-review-flip",
        {"org_secrets": [], "repos": _migrated_repos(psr_flip=True)},
        {"ENV-PROTECTION"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
    )
    expect(
        "gated-env-admin-bypass-flip",
        {"org_secrets": [], "repos": _migrated_repos(cab_flip=True)},
        {"ENV-PROTECTION"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
    )
    expect(
        "gated-env-reviewer-swap",
        {"org_secrets": [], "repos": _migrated_repos(reviewer_swap=True)},
        {"ENV-PROTECTION"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
    )
    # Same NAME as the pinned reviewer but as a Team: an org admin swapping
    # the required User for a team they control (approval broadens to every
    # team member) must fail the typed pin, not slide under it.
    expect(
        "gated-env-reviewer-type-swap",
        {"org_secrets": [], "repos": _migrated_repos(reviewer_type_swap=True)},
        {"ENV-PROTECTION"},
        warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
    )
    EXPECTED_GATED_ENVIRONMENTS = {
        **_production_map,
        "brand-new-repo": {"brand-new-env": {"SOME_TOKEN"}},
    }
    try:
        # The unpinned gated env trips the posture ratchet; the repo being
        # absent from the model also (correctly) trips ENV-DRIFT.
        expect(
            "gated-env-unpinned-posture",
            {"org_secrets": [], "repos": _migrated_repos()},
            {"ENV-PROTECTION", "ENV-DRIFT"},
            warn_codes={"ENV-REVIEWERLESS", ISO_WARN_GLY, ISO_WARN_WEB},
        )
    finally:
        EXPECTED_GATED_ENVIRONMENTS = _production_map

    # 35-62. MI-1 gated-secret reachability. The workflow-text fixtures run
    # against an empty expectation map like the early single-repo fixtures,
    # so each stays isolated to the reachability clause it exercises (the
    # populated map would demand the full multi-repo environment model).
    EXPECTED_GATED_ENVIRONMENTS = {}

    def canary_wf(checkout: str) -> str:
        return (
            "on:\n  workflow_dispatch:\n"
            "jobs:\n  canary:\n    environment: op-github-gated\n"
            f"    steps:\n{checkout}"
        )

    PINNED_CHECKOUT = (
        "      - uses: actions/checkout@sha\n        with:\n          ref: main\n"
    )
    UNPINNED_CHECKOUT = "      - uses: actions/checkout@sha\n"
    DEV_REF_CHECKOUT = (
        "      - uses: actions/checkout@sha\n        with:\n          ref: develop\n"
    )

    def _mi1_state(wf: str, path: str = ".github/workflows/x.yml") -> dict:
        return {
            "org_secrets": [],
            "repos": [_repo("GlycemicGPT", workflows={path: wf})],
        }

    # Clause 2: dispatch reachability of a job gated on an environment NOT
    # pinned dispatch-safe fails. release-gated is reviewerless now
    # (ISOLATION_REVIEWERLESS_ENVS), so the closed dispatch reachability
    # is the only thing standing between a write actor and its secrets --
    # this fixture is what keeps it closed.
    expect(
        "mi1-dispatch-gated",
        _mi1_state(release_dispatch_wf, ".github/workflows/release.yml"),
        {"MI1-DISPATCH"},
    )
    # The same gated job reachable only from push is the compliant shape.
    expect(
        "mi1-push-only-clean",
        _mi1_state(
            release_dispatch_wf.replace("  workflow_dispatch:\n", ""),
            ".github/workflows/release.yml",
        ),
        set(),
    )
    # Clause 3: every zero-isolation event hard-fails -- no escape hatch.
    for trig in sorted(MI1_FORBIDDEN_TRIGGERS):
        expect(
            f"mi1-trigger-{trig}",
            _mi1_state(
                f"on:\n  {trig}:\njobs:\n  j:\n"
                "    environment: op-github-gated\n    steps: []\n"
            ),
            {"MI1-TRIGGER"},
        )
    # Clause 2, push half: a gated job's push trigger must carry a
    # provable whitelist of trusted branches -- a bare push (all
    # branches) or a develop entry hands every merged PR a gated run.
    expect(
        "mi1-push-unfiltered",
        _mi1_state(
            "on: push\njobs:\n  j:\n    environment: release-gated\n    steps: []\n"
        ),
        {"MI1-PUSH"},
    )
    expect(
        "mi1-push-develop",
        _mi1_state(
            "on:\n  push:\n    branches: [develop, main]\n"
            "jobs:\n  j:\n    environment: release-gated\n    steps: []\n"
        ),
        {"MI1-PUSH"},
    )
    # A workflow carrying both a forbidden trigger and dispatch reports
    # both clauses -- neither masks the other.
    expect(
        "mi1-dispatch-plus-forbidden",
        _mi1_state(
            "on:\n  workflow_dispatch:\n  workflow_run:\n"
            "jobs:\n  j:\n    environment: release-gated\n    steps: []\n"
        ),
        {"MI1-TRIGGER", "MI1-DISPATCH"},
    )
    # The environment mapping form (name: + url:) resolves like the
    # string form.
    expect(
        "mi1-dispatch-env-mapping-form",
        _mi1_state(
            "on:\n  workflow_dispatch:\njobs:\n  j:\n"
            "    environment:\n      name: release-gated\n"
            "      url: https://example.invalid\n    steps: []\n"
        ),
        {"MI1-DISPATCH"},
    )
    # Clauses 4+5: the dispatch-only canary on a dispatch-safe pinned
    # environment with a trusted-ref checkout is compliant -- but never
    # silent: the escape hatch reports every job it carries as a
    # MI1-DISPATCH-PINNED warning. An unpinned or untrusted checkout
    # runs dispatched-ref code with the gated secret in scope and fails.
    CANARY_PATH = ".github/workflows/secrets-plumbing-check.yml"
    CANARY_WARN = {"MI1-DISPATCH-PINNED"}
    expect(
        "mi1-canary-dispatch-clean",
        _mi1_state(canary_wf(PINNED_CHECKOUT), CANARY_PATH),
        set(),
        warn_codes=CANARY_WARN,
    )
    expect(
        "mi1-canary-unpinned-checkout",
        _mi1_state(canary_wf(UNPINNED_CHECKOUT), CANARY_PATH),
        {"MI1-CHECKOUT"},
        warn_codes=CANARY_WARN,
    )
    expect(
        "mi1-canary-untrusted-checkout",
        _mi1_state(canary_wf(DEV_REF_CHECKOUT), CANARY_PATH),
        {"MI1-CHECKOUT"},
        warn_codes=CANARY_WARN,
    )
    # GitHub resolves action owner/repo case-insensitively, so
    # Actions/Checkout is the real checkout and must not evade clause 4.
    expect(
        "mi1-canary-cased-checkout-evasion",
        _mi1_state(canary_wf("      - uses: Actions/Checkout@sha\n"), CANARY_PATH),
        {"MI1-CHECKOUT"},
        warn_codes=CANARY_WARN,
    )
    # A pinned first checkout does not excuse an unpinned second one.
    expect(
        "mi1-canary-second-checkout-unpinned",
        _mi1_state(canary_wf(PINNED_CHECKOUT + UNPINNED_CHECKOUT), CANARY_PATH),
        {"MI1-CHECKOUT"},
        warn_codes=CANARY_WARN,
    )
    # An ungated job in a dispatch-only workflow (the real canary's
    # no_environment negative control) is not MI-1's concern -- pinning
    # this shape keeps the check from ever firing spuriously on it.
    expect(
        "mi1-ungated-job-in-dispatch-clean",
        _mi1_state(
            "on:\n  workflow_dispatch:\njobs:\n  no_environment:\n"
            "    steps:\n      - uses: actions/checkout@sha\n",
            CANARY_PATH,
        ),
        set(),
    )
    # A dynamic environment name cannot be statically proven safe -> the
    # dispatch clause fails closed.
    expect(
        "mi1-dynamic-env-dispatch",
        _mi1_state(
            "on:\n  workflow_dispatch:\njobs:\n  j:\n"
            "    environment: ${{ inputs.target }}\n    steps: []\n"
        ),
        {"MI1-DISPATCH"},
    )
    # Unparseable YAML that declares an environment fails closed rather
    # than slipping past the trigger parse.
    expect(
        "mi1-unparseable",
        _mi1_state(
            "on: [workflow_dispatch\njobs:\n  j:\n    environment: release-gated\n"
        ),
        {"MI1-UNPARSEABLE"},
    )
    # The ratchet is per-repo: the same dispatch shape on a repo not yet
    # ported does not fail (the porting checklist adds each repo to
    # MI1_ENFORCED_REPOS once its workflows comply). With the empty
    # expectation map the repo holds no gated environments, so not even
    # the MI1-PENDING warning fires -- the warning fixture below covers
    # the secrets-held case.
    expect(
        "mi1-nonenforced-repo-clean",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "android-unofficial",
                    workflows={".github/workflows/release.yml": release_dispatch_wf},
                )
            ],
        },
        set(),
    )

    # Clause 1: gated policy shape and branch bound. Posture fields
    # mirror the live pin so only the policy under test deviates.
    def _op_env(mode: str | None, branches: list[str] | None = None) -> dict:
        return {
            "name": "op-github-gated",
            "required_reviewers": 1,
            "secrets": [],
            "branch_policy_mode": mode,
            "branch_policy_branches": branches,
            "prevent_self_review": True,
            "can_admins_bypass": False,
            "reviewers": ["User:jlengelbrecht"],
        }

    expect(
        "mi1-policy-protected",
        {
            "org_secrets": [],
            "repos": [_repo("GlycemicGPT", environments=[_op_env("protected")])],
        },
        {"MI1-POLICY"},
    )
    expect(
        "mi1-policy-absent",
        {
            "org_secrets": [],
            "repos": [_repo("GlycemicGPT", environments=[_op_env(None)])],
        },
        {"MI1-POLICY"},
    )
    expect(
        "mi1-policy-custom-clean",
        {
            "org_secrets": [],
            "repos": [_repo("GlycemicGPT", environments=[_op_env("custom", ["main"])])],
        },
        set(),
    )
    # Widening the policy past its pinned bound fails -- including a
    # develop re-add, which the bound permitted before the 2026-08-14
    # narrowing to {main} and must never permit again silently.
    expect(
        "mi1-policy-bound-widened",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "GlycemicGPT",
                    environments=[_op_env("custom", ["main", "staging"])],
                )
            ],
        },
        {"MI1-POLICY"},
    )
    expect(
        "mi1-policy-develop-readd-widened",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "GlycemicGPT",
                    environments=[_op_env("custom", ["develop", "main"])],
                )
            ],
        },
        {"MI1-POLICY"},
    )

    # Clause 5, static leg: emptying the baseline reviewer pin for a
    # dispatch-safe environment (the first step of removing its gate) goes
    # red before any live drift is observable.
    _op_key = ("GlycemicGPT", "op-github-gated")
    _saved_posture = GATED_ENV_PROTECTION_BASELINE[_op_key]
    GATED_ENV_PROTECTION_BASELINE[_op_key] = {**_saved_posture, "reviewers": set()}
    try:
        expect(
            "mi1-escape-pin-reviewerless",
            {"org_secrets": [], "repos": []},
            {"MI1-ESCAPE-PIN"},
        )
    finally:
        GATED_ENV_PROTECTION_BASELINE[_op_key] = _saved_posture

    # Isolation-reviewerless static contradictions: each pin the class
    # leans on, mutated one at a time, goes red with no live state at
    # all -- the removal argument cannot be quietly hollowed out by
    # editing a neighbouring pin.
    _iso_key = ("GlycemicGPT", "release-gated")
    _saved_bound = MI1_POLICY_BRANCH_BOUND[_iso_key]
    MI1_POLICY_BRANCH_BOUND[_iso_key] = {"main", "develop"}
    try:
        expect(
            "isolation-pin-bound-rewidened",
            {"org_secrets": [], "repos": []},
            {"ENV-ISOLATION-PIN"},
        )
    finally:
        MI1_POLICY_BRANCH_BOUND[_iso_key] = _saved_bound
    # The website pin participates in the same static consistency net:
    # re-widening ITS branch bound goes red with no live state at all.
    # The other contradiction shapes (dispatch-safe double pin,
    # reviewer-pin contradiction, missing posture entry, unenforced
    # repo, stray parameter block below) stay single-entry:
    # check_isolation_pin_consistency loops over every entry with the
    # same clauses, so one fixture per clause plus this per-entry
    # membership proof covers both pins.
    _web_pin_key = ("website", "release-gated")
    _saved_web_bound = MI1_POLICY_BRANCH_BOUND[_web_pin_key]
    MI1_POLICY_BRANCH_BOUND[_web_pin_key] = {"main", "preview"}
    try:
        expect(
            "isolation-pin-website-bound-rewidened",
            {"org_secrets": [], "repos": []},
            {"ENV-ISOLATION-PIN"},
        )
    finally:
        MI1_POLICY_BRANCH_BOUND[_web_pin_key] = _saved_web_bound
    # A parameter block keyed on a rule type the entry does not require
    # is never compared live -- e.g. a typo'd type, or the pull_request
    # block orphaned by a rule-identity rename. It must read as a
    # malformed pin, not as a pinned checkpoint.
    _iso_pin_entry = ISOLATION_REVIEWERLESS_ENVS[_iso_key]
    ISOLATION_REVIEWERLESS_ENVS[_iso_key] = {
        **_iso_pin_entry,
        "required_rule_parameters": {
            **_iso_pin_entry["required_rule_parameters"],
            "pull_requests": {"require_code_owner_review": True},
        },
    }
    try:
        expect(
            "isolation-pin-stray-rule-params",
            {"org_secrets": [], "repos": []},
            {"ENV-ISOLATION-PIN"},
        )
    finally:
        ISOLATION_REVIEWERLESS_ENVS[_iso_key] = _iso_pin_entry
    # Emptying the parameter block (or dropping its pull_request key)
    # would leave the pin well-formed by key presence while the content
    # checkpoint goes unverified -- the hollowed shape must be red.
    ISOLATION_REVIEWERLESS_ENVS[_iso_key] = {
        **_iso_pin_entry,
        "required_rule_parameters": {},
    }
    try:
        expect(
            "isolation-pin-hollowed-rule-params",
            {"org_secrets": [], "repos": []},
            {"ENV-ISOLATION-PIN"},
        )
    finally:
        ISOLATION_REVIEWERLESS_ENVS[_iso_key] = _iso_pin_entry
    # Pinning the isolation env dispatch-safe would let workflow_dispatch
    # back in with no reviewer behind it; both consistency checks fire
    # (the escape-hatch pin also demands a pinned reviewer).
    MI1_DISPATCH_SAFE_ENVS[_iso_key] = "contradictory escape-hatch pin"
    try:
        expect(
            "isolation-pin-dispatch-safe-contradiction",
            {"org_secrets": [], "repos": []},
            {"ENV-ISOLATION-PIN", "MI1-ESCAPE-PIN"},
        )
    finally:
        del MI1_DISPATCH_SAFE_ENVS[_iso_key]
    _saved_iso_posture = GATED_ENV_PROTECTION_BASELINE[_iso_key]
    GATED_ENV_PROTECTION_BASELINE[_iso_key] = {
        **_saved_iso_posture,
        "reviewers": {"User:jlengelbrecht"},
    }
    try:
        expect(
            "isolation-pin-reviewer-pin-contradiction",
            {"org_secrets": [], "repos": []},
            {"ENV-ISOLATION-PIN"},
        )
    finally:
        GATED_ENV_PROTECTION_BASELINE[_iso_key] = _saved_iso_posture
    # Removing the posture entry entirely (rather than re-pinning a
    # reviewer) is the other way to blind posture drift for the env.
    del GATED_ENV_PROTECTION_BASELINE[_iso_key]
    try:
        expect(
            "isolation-pin-missing-posture",
            {"org_secrets": [], "repos": []},
            {"ENV-ISOLATION-PIN"},
        )
    finally:
        GATED_ENV_PROTECTION_BASELINE[_iso_key] = _saved_iso_posture
    # De-listing the repo from MI-1 enforcement makes leg 3
    # unenforceable; the pin must go red, not quietly lose a leg.
    _saved_enforced = MI1_ENFORCED_REPOS
    MI1_ENFORCED_REPOS = frozenset()
    try:
        expect(
            "isolation-pin-unenforced-repo",
            {"org_secrets": [], "repos": []},
            {"ENV-ISOLATION-PIN"},
        )
    finally:
        MI1_ENFORCED_REPOS = _saved_enforced
    # One environment, one reviewerless class: a double pin means two
    # contradictory justifications.
    REVIEWERLESS_ENV_BASELINE.add(_iso_key)
    try:
        expect(
            "isolation-pin-double-pinned",
            {"org_secrets": [], "repos": []},
            {"ENV-ISOLATION-PIN"},
        )
    finally:
        REVIEWERLESS_ENV_BASELINE.discard(_iso_key)
    # A malformed pin (missing required keys) is a finding, never a
    # KeyError crash that would mask which pin is broken -- statically
    # (ENV-ISOLATION-PIN) and on the live path, where the leg verifier
    # must refuse the malformed pin (ENV-ISOLATION-UNVERIFIED) instead
    # of crashing the audit into exit 2.
    _saved_iso_entry = ISOLATION_REVIEWERLESS_ENVS[_iso_key]
    ISOLATION_REVIEWERLESS_ENVS[_iso_key] = {"lead": "jlengelbrecht"}
    try:
        expect(
            "isolation-pin-missing-keys",
            {"org_secrets": [], "repos": []},
            {"ENV-ISOLATION-PIN"},
        )
    finally:
        ISOLATION_REVIEWERLESS_ENVS[_iso_key] = _saved_iso_entry
    # Dropping the environment from EXPECTED_GATED_ENVIRONMENTS would
    # silently retire its secret-list drift check and MI-1 policy-shape
    # clause; with a non-empty map the membership clause goes red (the
    # absent repo also correctly trips ENV-DRIFT).
    EXPECTED_GATED_ENVIRONMENTS = {
        "GlycemicGPT": {"op-github-gated": {"BACKEND_ACTIONS_SERVICE_ACCOUNT"}}
    }
    try:
        expect(
            "isolation-pin-not-in-expected-map",
            {"org_secrets": [], "repos": []},
            {"ENV-ISOLATION-PIN", "ENV-DRIFT"},
        )
    finally:
        EXPECTED_GATED_ENVIRONMENTS = {}
    # Clause 5, live leg: the canary environment observed without its
    # reviewer trips MI-1 alongside the independent reviewer-drift and
    # posture-drift checks -- three controls notice the same removal.
    expect(
        "mi1-escape-live-reviewerless",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "GlycemicGPT",
                    workflows={CANARY_PATH: canary_wf(PINNED_CHECKOUT)},
                    environments=[
                        {
                            "name": "op-github-gated",
                            "required_reviewers": 0,
                            "secrets": [],
                            "branch_policy_mode": "custom",
                            "prevent_self_review": None,
                            "can_admins_bypass": False,
                            "reviewers": [],
                        }
                    ],
                )
            ],
        },
        {"MI1-ESCAPE-LIVE", "ENV-UNGATED", "ENV-PROTECTION"},
        warn_codes=CANARY_WARN,
    )

    # An un-enforced repo that holds gated secrets AND has a
    # dispatch-reachable gated job warns (never silently exempt): the
    # porting checklist turns the warning into enforcement. Scoped to an
    # android-only expectation map so the fixture models one repo (the
    # isolation pins are parked so the membership clause -- correct on a
    # non-empty map missing the monorepo entry -- stays out of scope).
    EXPECTED_GATED_ENVIRONMENTS = {
        "android-unofficial": {"release-gated": {"MERGE_APP_ID"}}
    }
    _saved_iso_pins = dict(ISOLATION_REVIEWERLESS_ENVS)
    ISOLATION_REVIEWERLESS_ENVS.clear()
    expect(
        "mi1-pending-nonenforced-warns",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "android-unofficial",
                    workflows={".github/workflows/release.yml": release_dispatch_wf},
                    environments=[
                        {
                            "name": "release-gated",
                            "required_reviewers": 1,
                            "secrets": ["MERGE_APP_ID"],
                            "prevent_self_review": False,
                            "can_admins_bypass": False,
                            "reviewers": ["User:jlengelbrecht"],
                        }
                    ],
                )
            ],
        },
        set(),
        warn_codes={"MI1-PENDING"},
    )
    ISOLATION_REVIEWERLESS_ENVS.update(_saved_iso_pins)

    EXPECTED_GATED_ENVIRONMENTS = _production_map

    if failures:
        for f in failures:
            print(f"SELF-TEST FAIL {f}", file=sys.stderr)
        return 1
    print(f"self-test: all {fixture_count} red-team fixtures behaved as expected")
    return 0


def report(violations: list[str], warnings: list[str], scope: str) -> int:
    for w in warnings:
        print(f"::warning::{w}")
    for v in violations:
        print(f"::error::{v}")
    if violations:
        print(f"secrets audit ({scope}): {len(violations)} violation(s)")
        return 1
    print(f"secrets audit ({scope}): clean ({len(warnings)} pinned warning(s))")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--self-test", action="store_true")
    mode.add_argument("--live", action="store_true")
    mode.add_argument(
        "--repo-local",
        metavar="DIR",
        help="workflow directory to check (bypass/SA reference invariants)",
    )
    parser.add_argument(
        "--repo-name",
        help="repo name for allowlist resolution (required with --repo-local)",
    )
    args = parser.parse_args()

    if args.self_test:
        return self_test()

    try:
        if args.repo_local:
            if not args.repo_name:
                parser.error("--repo-local requires --repo-name")
            state = collect_local_state(args.repo_local, args.repo_name)
            scope = f"repo-local {args.repo_name}"
            # Local mode has only workflow text -- no secret/environment
            # inventory -- so run only the workflow-text invariants.
            checks = WORKFLOW_TEXT_CHECKS
        else:
            state = collect_live_state()
            scope = f"org {ORG}"
            checks = CHECKS
        violations, warnings = run_checks(state, checks)
    except OperationalError as exc:
        print(f"::error::secrets audit could not run: {exc}")
        return 2
    except Exception as exc:  # noqa: BLE001 -- fail closed, exit 2 not 1
        print(f"::error::secrets audit crashed: {exc!r}")
        return 2

    return report(violations, warnings, scope)


if __name__ == "__main__":
    sys.exit(main())
