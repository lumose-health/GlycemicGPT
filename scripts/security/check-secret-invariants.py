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

Two drift checks (scaffolding for the gated-environment migration; the
EXPECTED_GATED_ENVIRONMENTS map is populated as each secret moves behind
an approval-gated environment):

  env-secrets drift  Each gated environment must hold exactly its
                     expected secret list, and none of those secrets may
                     reappear as a plain repo secret (plain-copy re-add).

  reviewer drift     Every environment on every org repo must carry a
                     required_reviewers protection rule with >= 1
                     reviewer. Pre-existing ungated environments are
                     pinned in UNGATED_ENV_BASELINE; any environment not
                     in that baseline fails.

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
                     latter for the installation-scope repo-count guard).

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
  - The latent-safe write-actor tripwire reads the collaborators
    endpoint, which does not enumerate GitHub App installations holding
    contents:write -- such an app is a write actor the tripwire misses.

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
SA_SECRET_RE = re.compile(r"^[A-Z0-9_]*_ACTIONS_SERVICE_ACCOUNT$")

# Workflow-text reference to a ruleset-bypass credential, in either
# documented accessor form: `secrets.NAME` or `secrets['NAME']` /
# `secrets["NAME"]`, with optional whitespace around the dot. MERGE and
# RELEASE are the two app identities with org-ruleset bypass; extend this
# pattern in the same PR that grants any new actor bypass.
#
# IGNORECASE is load-bearing, not cosmetic: GitHub secret names and
# expression property dereference are case-insensitive, so
# `secrets.merge_app_id` mints the real MERGE token. A case-sensitive
# pattern would pass a fully functional exfil workflow as clean.
BYPASS_REF_RE = re.compile(
    r"secrets\s*(?:\.\s*|\[\s*['\"])(MERGE|RELEASE)_APP_(ID|PRIVATE_KEY)\b",
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
# pull_request/pull_request_target context today. Both are replaced by
# the workflow_run + direct-REST merge redesign (the website
# renovate-automerge.yml template); remove each entry in that PR.
# SCOPE: a pin ONLY downgrades this file's BYPASS-PR finding (the known,
# tracked bypass-credential mint) to a warning. It is NOT a whole-file
# skip -- a SECRETS-DUMP (toJSON(secrets)/dynamic index) or an SA-REF-PR
# in the same file still fails, so pinning cannot be used to smuggle a
# different exfil into a known-offender file. Keep the pins short-lived
# anyway: the tracked bypass mint itself stays live until removed.
BYPASS_ALLOWLIST: set[tuple[str, str]] = {
    ("GlycemicGPT", ".github/workflows/auto-merge-renovate.yml"),
    ("android-unofficial", ".github/workflows/auto-merge-renovate.yml"),
}

# repo -> environment -> exact set of secret names the environment must
# hold. Populated as secrets move behind gated environments. Each entry
# asserts the environment holds exactly its expected secret list and that
# none of those secrets reappears as a plain repo copy.
EXPECTED_GATED_ENVIRONMENTS: dict[str, dict[str, set[str]]] = {
    "GlycemicGPT": {"op-github-gated": {"BACKEND_ACTIONS_SERVICE_ACCOUNT"}},
    "glycemicgpt-ios-unofficial": {
        "op-github-gated": {"IOS_ACTIONS_SERVICE_ACCOUNT"}
    },
}

# Environments that predate the gating work and hold zero secrets. They
# surface as warnings, not failures; the gating migration either gates or
# removes them, deleting these pins.
UNGATED_ENV_BASELINE: set[tuple[str, str]] = {
    ("GlycemicGPT", "copilot"),
    ("website", "github-pages"),
}


class OperationalError(Exception):
    """The audit could not gather ground truth. Fail closed (exit 2)."""


def workflow_has_pr_trigger(text: str) -> bool:
    """True when the workflow's `on:` includes a pull_request trigger.

    Parses the YAML rather than grepping, so every documented trigger
    shape is recognized: `on: pull_request`, `on: [push, pull_request]`,
    `on: {pull_request: ...}`, block mappings, and quoted keys. A
    workflow that does not parse is treated as HAVING the trigger: this
    function is only consulted for workflows that reference a guarded
    secret, and an unparseable one must fail the audit, not slip past it.
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
        return True
    if not isinstance(doc, dict):
        return False
    # YAML 1.1 parses an unquoted `on` key as boolean True.
    triggers = doc.get(True, doc.get("on"))
    if triggers is None:
        return False
    if isinstance(triggers, str):
        names: set[Any] = {triggers}
    elif isinstance(triggers, list):
        names = set(triggers)
    elif isinstance(triggers, dict):
        names = set(triggers.keys())
    else:
        return False
    return bool(names & PR_TRIGGERS)


# ---------------------------------------------------------------------
# Checks. Each takes the org-state model and returns (violations,
# warnings) as lists of strings. The model shape:
#
# {
#   "org_secrets": [name, ...],
#   "repos": [
#     {
#       "name": str,
#       "secrets": [name, ...],              # plain repo-level secrets
#       "write_actors": [login, ...],        # non-admin push/maintain
#       "workflows": {path: {branch: text}}, # default + EXTRA_BRANCHES
#       "environments": [
#         {"name": str, "required_reviewers": int, "secrets": [name, ...]}
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
            reason = SA_ALLOWLIST.get((repo["name"], name))
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
            actual = set(env["secrets"])
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
            readded = expected_secrets & set(repo["secrets"])
            if readded:
                violations.append(
                    f"ENV-READD: {repo_name} holds plain copies of gated "
                    f"secrets: {', '.join(sorted(readded))}"
                )
    return violations, []


def check_reviewer_drift(state: dict) -> tuple[list[str], list[str]]:
    violations, warnings = [], []
    for repo in state["repos"]:
        for env in repo["environments"]:
            if env["required_reviewers"] >= 1:
                continue
            key = (repo["name"], env["name"])
            if key in UNGATED_ENV_BASELINE:
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


CHECKS = (
    check_sa_invariant,
    check_bypass_invariant,
    check_env_secrets_drift,
    check_reviewer_drift,
)

# Checks that operate purely on workflow TEXT, so they are meaningful in
# --repo-local mode (a local workflow-dir scan with no secret/environment
# inventory). The secret/environment-placement checks require the authoritative
# API model and run only in --live: on the empty local model they would either
# no-op (nothing to see) or, once EXPECTED_GATED_ENVIRONMENTS is populated,
# false-positive on the missing (unqueryable) environments.
WORKFLOW_TEXT_CHECKS = (check_bypass_invariant,)


def run_checks(
    state: dict, checks: tuple = CHECKS
) -> tuple[list[str], list[str]]:
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
            f"Secrets read, plus Plan read only for the PAT fallback)."
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


def collect_live_state() -> dict:
    org_secret_names = [
        s["name"] for s in gh_api_items(f"/orgs/{ORG}/actions/secrets", "secrets")
    ]
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

        write_actors = [
            c["login"]
            for c in gh_api_list(f"/repos/{ORG}/{name}/collaborators?affiliation=all")
            if c.get("permissions", {}).get("push")
            and not c.get("permissions", {}).get("admin")
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
            reviewer_count = sum(
                len(r.get("reviewers", []))
                for r in env.get("protection_rules", [])
                if r.get("type") == "required_reviewers"
            )
            env_path = urllib.parse.quote(env["name"], safe="")
            env_secrets = gh_api_items(
                f"/repos/{ORG}/{name}/environments/{env_path}/secrets",
                "secrets",
                allow_404=True,
            )
            environments.append(
                {
                    "name": env["name"],
                    "required_reviewers": reviewer_count,
                    "secrets": [s["name"] for s in env_secrets],
                }
            )

        repos.append(
            {
                "name": name,
                "secrets": secrets,
                "write_actors": write_actors,
                "workflows": workflows,
                "environments": environments,
            }
        )
    return {"org_secrets": org_secret_names, "repos": repos}


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
    # 12. Allowlisted bypass workflow warns, and only warns.
    expect(
        "bypass-pinned-warns",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "GlycemicGPT",
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
                    "GlycemicGPT",
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

    def _migrated_repos(
        *, plain_backend: bool = False, drop_backend_from_env: bool = False
    ) -> list[dict]:
        """Both gated repos in their post-migration shape, mutated per the
        failure mode under test. Mirrors EXPECTED_GATED_ENVIRONMENTS so a new
        production entry that is not modelled here surfaces as a drift."""
        gly_env_secrets = (
            [] if drop_backend_from_env else ["BACKEND_ACTIONS_SERVICE_ACCOUNT"]
        )
        return [
            _repo(
                "GlycemicGPT",
                secrets=(
                    ["BACKEND_ACTIONS_SERVICE_ACCOUNT"] if plain_backend else []
                ),
                environments=[
                    {
                        "name": "op-github-gated",
                        "required_reviewers": 1,
                        "secrets": gly_env_secrets,
                    }
                ],
            ),
            _repo(
                "glycemicgpt-ios-unofficial",
                environments=[
                    {
                        "name": "op-github-gated",
                        "required_reviewers": 1,
                        "secrets": ["IOS_ACTIONS_SERVICE_ACCOUNT"],
                    }
                ],
            ),
        ]

    expect(
        "gated-tokens-migrated-clean",
        {"org_secrets": [], "repos": _migrated_repos()},
        set(),
    )
    expect(
        "gated-token-removed-from-env",
        {"org_secrets": [], "repos": _migrated_repos(drop_backend_from_env=True)},
        {"ENV-DRIFT"},
    )
    expect(
        "gated-token-plain-readd",
        {"org_secrets": [], "repos": _migrated_repos(plain_backend=True)},
        {"SA-PLAIN", "ENV-READD"},
    )

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
