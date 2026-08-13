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
                     private), and fail the moment any leg breaks; any
                     environment in neither baseline fails.

  protection drift   Every gated environment must keep the reviewer-rule
                     posture pinned in GATED_ENV_PROTECTION_BASELINE:
                     prevent_self_review, can_admins_bypass, and the
                     exact typed reviewer set (User vs Team
                     distinguished). prevent_self_review is FALSE by
                     design on the public release-gated environments
                     (single-lead topology: the modeled attacker -- a
                     non-admin write actor -- is not in the reviewer
                     set); pinning it here means that accepted posture
                     cannot drift silently, and changing it requires
                     editing the pin in a reviewed PR.

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
                     check fails closed once WEB_MERGE material exists).

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
# Protect-develop 14524658, plus repo-level grants), RELEASE (website
# "Restrict main merges to lead" 18965811 only -- NOT the org
# main/develop rulesets), and WEB_MERGE (GLY-56.24 impl-5: a website-only
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
# re-verified 2026-07-19). Reviewers are pinned as "Type:name"
# (User login / Team slug): a Team slugged like the pinned User login
# must not satisfy the pin. prevent_self_review is
# FALSE by design on the public release-gated environments (accepted:
# single-lead topology -- the modeled attacker, a restored non-admin
# write actor, is not in the reviewer set; the custom branch policy
# rejects PR-ref deployments) and TRUE on the op-github-gated
# environments; discord's release-gated has no reviewer rule at all (see
# REVIEWERLESS_ENV_BASELINE), so its posture is reviewer-free with
# can_admins_bypass=false. Pinning means none of this can drift
# silently; changing the intent requires editing this map in a reviewed
# PR. Every environment in EXPECTED_GATED_ENVIRONMENTS must have an
# entry here (enforced by check_env_protection_drift).
GATED_ENV_PROTECTION_BASELINE: dict[tuple[str, str], dict[str, Any]] = {
    ("GlycemicGPT", "op-github-gated"): {
        "prevent_self_review": True,
        "can_admins_bypass": False,
        "reviewers": {"User:jlengelbrecht"},
    },
    ("GlycemicGPT", "release-gated"): {
        "prevent_self_review": False,
        "can_admins_bypass": False,
        "reviewers": {"User:jlengelbrecht"},
    },
    ("ios-unofficial", "op-github-gated"): {
        "prevent_self_review": True,
        "can_admins_bypass": False,
        "reviewers": {"User:jlengelbrecht"},
    },
    ("website", "release-gated"): {
        "prevent_self_review": False,
        "can_admins_bypass": False,
        "reviewers": {"User:jlengelbrecht"},
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
MI1_ENFORCED_REPOS: frozenset[str] = frozenset({"GlycemicGPT"})

# Clause-1 upper bound: the exact branch set each gated environment's
# custom deployment branch policy may contain. Narrowing is always
# allowed and expected -- the pending lead action drops develop from
# both policies, leaving {main}; shrink these pins to {"main"} when that
# lands. Widening (a new branch, a wildcard) fails the audit. A gated
# environment with a custom policy and no pin here is itself a
# violation: every policy must state its bound.
MI1_POLICY_BRANCH_BOUND: dict[tuple[str, str], set[str]] = {
    ("GlycemicGPT", "release-gated"): {"main", "develop"},
    ("GlycemicGPT", "op-github-gated"): {"main", "develop"},
}

# Clause-5 pins: environments whose DESIGN posture keeps a required
# reviewer permanently, which makes workflow_dispatch reachability of
# their jobs compliant -- the reviewer, not the branch policy, is the
# gate. An environment on the reviewer-removal track (release-gated ->
# release-auto) must NEVER be pinned here: pinning it would let dispatch
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


def _mi1_workflow_reachability(repo: dict) -> tuple[list[str], list[str]]:
    """Clauses 2-5 over every workflow copy of an enforced repo."""
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
WORKFLOW_TEXT_CHECKS = (check_bypass_invariant, check_mi1_reachability)


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
            f"listing, plus Plan read only for the PAT fallback)."
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
                branch_policy_branches = sorted(p["name"] for p in policies)
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
    global EXPECTED_GATED_ENVIRONMENTS
    _production_map = EXPECTED_GATED_ENVIRONMENTS
    EXPECTED_GATED_ENVIRONMENTS = {}

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
        gotw = {w.split(":", 1)[0] for w in warnings}
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
    ) -> list[dict]:
        """Every gated repo in its post-migration shape, mutated per the
        failure mode under test. Mirrors EXPECTED_GATED_ENVIRONMENTS so a new
        production entry that is not modelled here surfaces as a drift.
        psr_flip/cab_flip/reviewer_swap/reviewer_type_swap mutate the monorepo
        release-gated reviewer-rule posture (the env holding the MERGE crown
        jewel); reviewer_type_swap keeps the pinned NAME but flips User ->
        Team (a team slugged like the lead must not satisfy the pin)."""
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
        # op-github-gated, false (by design, pinned) on release-gated.
        lead_gate = {
            "can_admins_bypass": False,
            "reviewers": ["User:jlengelbrecht"],
        }
        return [
            _repo(
                "GlycemicGPT",
                secrets=gly_plain,
                environments=[
                    {
                        "name": "op-github-gated",
                        "required_reviewers": 1,
                        "secrets": gly_op_secrets,
                        "branch_policy_mode": "custom",
                        "branch_policy_branches": ["develop", "main"],
                        "prevent_self_review": True,
                        **lead_gate,
                    },
                    {
                        "name": "release-gated",
                        "required_reviewers": 1,
                        "secrets": gly_release_secrets,
                        "branch_policy_mode": "custom",
                        "branch_policy_branches": ["develop", "main"],
                        "prevent_self_review": psr_flip,
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
            _repo(
                "website",
                environments=[
                    {
                        "name": "release-gated",
                        "required_reviewers": 1,
                        "secrets": RELEASE_KEY_SECRETS + merge_env,
                        "prevent_self_review": False,
                        **lead_gate,
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
        warn_codes={"ENV-REVIEWERLESS"},
    )
    expect(
        "gated-token-removed-from-env",
        {"org_secrets": [], "repos": _migrated_repos(drop_backend_from_env=True)},
        {"ENV-DRIFT"},
        warn_codes={"ENV-REVIEWERLESS"},
    )
    expect(
        "gated-token-plain-readd",
        {"org_secrets": [], "repos": _migrated_repos(plain_backend=True)},
        {"SA-PLAIN", "ENV-READD"},
        warn_codes={"ENV-REVIEWERLESS"},
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
        warn_codes={"ENV-REVIEWERLESS"},
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
        warn_codes={"ENV-REVIEWERLESS"},
    )
    # Explicit android coverage: android is the repo a default-branch grep
    # misses (its workflows live on develop, its main is empty), so prove its
    # MERGE gating is drift-tracked on its own.
    expect(
        "merge-key-removed-from-env-android",
        {"org_secrets": [], "repos": _migrated_repos(drop_android_merge=True)},
        {"ENV-DRIFT"},
        warn_codes={"ENV-REVIEWERLESS"},
    )
    expect(
        "merge-key-plain-readd",
        {"org_secrets": [], "repos": _migrated_repos(plain_merge=True)},
        {"ENV-READD"},
        warn_codes={"ENV-REVIEWERLESS"},
    )
    expect(
        "merge-key-org-readd",
        {
            "org_secrets": ["MERGE_APP_ID", "MERGE_APP_PRIVATE_KEY"],
            "repos": _migrated_repos(),
        },
        {"ENV-READD-ORG"},
        warn_codes={"ENV-REVIEWERLESS"},
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
        warn_codes={"ENV-REVIEWERLESS"},
    )
    expect(
        "reviewerless-env-write-actor-tripwire",
        {"org_secrets": [], "repos": _migrated_repos(discord_write_actor=True)},
        {"ENV-REVIEWERLESS-TRIPWIRE"},
    )
    expect(
        "reviewerless-env-policy-drift",
        {"org_secrets": [], "repos": _migrated_repos(discord_policy_drift=True)},
        {"ENV-REVIEWERLESS-POLICY"},
    )
    expect(
        "reviewerless-env-goes-public",
        {"org_secrets": [], "repos": _migrated_repos(discord_public=True)},
        {"ENV-REVIEWERLESS-PUBLIC"},
    )
    expect(
        "reviewerless-env-second-admin",
        {"org_secrets": [], "repos": _migrated_repos(discord_second_admin=True)},
        {"ENV-REVIEWERLESS-ADMINS"},
    )

    # 31-34. Reviewer-rule posture drift on the env holding the MERGE
    # crown jewel: prevent_self_review flipped (its pinned value is False
    # by design -- the point is that changing it must be a reviewed edit,
    # not silent), can_admins_bypass flipped, the reviewer swapped to a
    # write actor, and a gated env added without declaring its posture.
    expect(
        "gated-env-prevent-self-review-flip",
        {"org_secrets": [], "repos": _migrated_repos(psr_flip=True)},
        {"ENV-PROTECTION"},
        warn_codes={"ENV-REVIEWERLESS"},
    )
    expect(
        "gated-env-admin-bypass-flip",
        {"org_secrets": [], "repos": _migrated_repos(cab_flip=True)},
        {"ENV-PROTECTION"},
        warn_codes={"ENV-REVIEWERLESS"},
    )
    expect(
        "gated-env-reviewer-swap",
        {"org_secrets": [], "repos": _migrated_repos(reviewer_swap=True)},
        {"ENV-PROTECTION"},
        warn_codes={"ENV-REVIEWERLESS"},
    )
    # Same NAME as the pinned reviewer but as a Team: an org admin swapping
    # the required User for a team they control (approval broadens to every
    # team member) must fail the typed pin, not slide under it.
    expect(
        "gated-env-reviewer-type-swap",
        {"org_secrets": [], "repos": _migrated_repos(reviewer_type_swap=True)},
        {"ENV-PROTECTION"},
        warn_codes={"ENV-REVIEWERLESS"},
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
            warn_codes={"ENV-REVIEWERLESS"},
        )
    finally:
        EXPECTED_GATED_ENVIRONMENTS = _production_map

    # 35-62. MI-1 gated-secret reachability. The workflow-text fixtures run
    # against an empty expectation map like the early single-repo fixtures,
    # so each stays isolated to the reachability clause it exercises (the
    # populated map would demand the full multi-repo environment model).
    EXPECTED_GATED_ENVIRONMENTS = {}

    release_dispatch_wf = (
        "on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n"
        "jobs:\n  release:\n    environment: release-gated\n    steps: []\n"
    )

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
    # pinned dispatch-safe fails. release-gated holds a reviewer today, but
    # its design target is reviewerless (release-auto) -- dispatch must be
    # closed before that reviewer can come off, so the reviewer's presence
    # must not excuse the trigger.
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
            "repos": [
                _repo(
                    "GlycemicGPT",
                    environments=[_op_env("custom", ["develop", "main"])],
                )
            ],
        },
        set(),
    )
    # Widening the policy past its pinned bound fails; narrowing (the
    # pending lead action drops develop) stays green.
    expect(
        "mi1-policy-bound-widened",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "GlycemicGPT",
                    environments=[_op_env("custom", ["develop", "main", "staging"])],
                )
            ],
        },
        {"MI1-POLICY"},
    )
    expect(
        "mi1-policy-bound-narrowed-clean",
        {
            "org_secrets": [],
            "repos": [_repo("GlycemicGPT", environments=[_op_env("custom", ["main"])])],
        },
        set(),
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
    # android-only expectation map so the fixture models one repo.
    EXPECTED_GATED_ENVIRONMENTS = {
        "android-unofficial": {"release-gated": {"MERGE_APP_ID"}}
    }
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
