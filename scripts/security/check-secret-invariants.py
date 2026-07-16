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
                    actor's secret to BYPASS_SECRET_RE) may carry a
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
  --self-test  Run the bundled red-team fixtures and assert every
               violation class is caught (fail-closed proof). No network.
               CI runs this before every live audit.
  --live       Audit the real org via the GitHub API (gh CLI; needs
               GH_TOKEN with: repo Secrets read, Environments read,
               Administration read, Contents read; org Secrets read).

Exit codes: 0 clean, 1 violations, 2 operational error (missing token or
permissions -- the audit fails closed rather than skipping silently).
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import subprocess
import sys

ORG = "lumose-health"

# A secret with this shape is a 1Password service-account token: the
# credential that unlocks a vault. For PPE the attack is a read, so a
# plain copy on a repo with a write actor is a standing exfil path.
SA_SECRET_RE = re.compile(r"^[A-Z0-9_]*_ACTIONS_SERVICE_ACCOUNT$")

# Workflow-text reference to a ruleset-bypass credential. MERGE and
# RELEASE are the two app identities with org-ruleset bypass; extend this
# pattern in the same PR that grants any new actor bypass.
BYPASS_REF_RE = re.compile(r"secrets\.(MERGE|RELEASE)_APP_(ID|PRIVATE_KEY)")

# Workflow-text reference to any SA token (reference form of the SA
# invariant -- existence is checked against the secrets API above).
SA_REF_RE = re.compile(r"secrets\.[A-Z0-9_]*_ACTIONS_SERVICE_ACCOUNT")

# Matches the trigger key at line start (same shape as the grep guard in
# workflow-lint.yml). `pull_request_target` is included deliberately.
PR_TRIGGER_RE = re.compile(r"^\s*pull_request(_target)?\s*:", re.MULTILINE)

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
    # Monorepo 1Password bootstrap token; moves behind an approval-gated
    # environment with the crown-jewel migration. Remove with that PR.
    ("GlycemicGPT", "BACKEND_ACTIONS_SERVICE_ACCOUNT"): "pending-migration",
    # Android signing bootstrap; latent-safe while android-unofficial has
    # no non-admin write actor. Tripwired -- do not convert to
    # "pending-migration" to silence a trip; gate the environment instead.
    ("android-unofficial", "ANDROID_ACTIONS_SERVICE_ACCOUNT"): "latent-safe",
}

# (repo, workflow path) entries that mint a bypass credential from a
# pull_request/pull_request_target context today. Both are replaced by
# the workflow_run + direct-REST merge redesign (the website
# renovate-automerge.yml template); remove each entry in that PR.
BYPASS_ALLOWLIST: set[tuple[str, str]] = {
    ("GlycemicGPT", ".github/workflows/auto-merge-renovate.yml"),
    ("android-unofficial", ".github/workflows/auto-merge-renovate.yml"),
}

# repo -> environment -> exact set of secret names the environment must
# hold. Populated as secrets move behind gated environments; empty while
# no gated environments exist yet.
EXPECTED_GATED_ENVIRONMENTS: dict[str, dict[str, set[str]]] = {}

# Environments that predate the gating work and hold zero secrets. They
# surface as warnings, not failures; the gating migration either gates or
# removes them, deleting these pins.
UNGATED_ENV_BASELINE: set[tuple[str, str]] = {
    ("GlycemicGPT", "copilot"),
    ("website", "github-pages"),
}


class OperationalError(Exception):
    """The audit could not gather ground truth. Fail closed (exit 2)."""


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
#       "workflows": {path: text, ...},      # default + EXTRA_BRANCHES
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
        for path, text in repo["workflows"].items():
            has_pr_trigger = bool(PR_TRIGGER_RE.search(text))
            if not has_pr_trigger:
                continue
            if BYPASS_REF_RE.search(text):
                if (repo["name"], path) in BYPASS_ALLOWLIST:
                    warnings.append(
                        f"BYPASS-PENDING: {repo['name']}/{path} mints a "
                        f"bypass credential from a pull_request context; "
                        f"pinned until the workflow_run redesign lands"
                    )
                else:
                    violations.append(
                        f"BYPASS-PR: {repo['name']}/{path} references a "
                        f"ruleset-bypass credential and carries a "
                        f"pull_request/pull_request_target trigger; use "
                        f"workflow_run (see website renovate-automerge.yml)"
                    )
            if SA_REF_RE.search(text):
                violations.append(
                    f"SA-REF-PR: {repo['name']}/{path} references a "
                    f"service-account token in a workflow with a "
                    f"pull_request/pull_request_target trigger; a poisoned "
                    f"PR could read the vault credential"
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


def run_checks(state: dict) -> tuple[list[str], list[str]]:
    violations: list[str] = []
    warnings: list[str] = []
    for check in CHECKS:
        v, w = check(state)
        violations.extend(v)
        warnings.extend(w)
    return violations, warnings


# ---------------------------------------------------------------------
# Live collection via the gh CLI.
# ---------------------------------------------------------------------


def gh_api(path: str, *, paginate: bool = False) -> object:
    cmd = ["gh", "api", path]
    if paginate:
        cmd.append("--paginate")
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        stderr = proc.stderr.strip()
        if "HTTP 404" in stderr:
            return None
        raise OperationalError(
            f"gh api {path} failed: {stderr or 'unknown error'}. If this "
            f"is HTTP 403, the token lacks a required permission (repo: "
            f"Secrets/Environments/Administration/Contents read; org: "
            f"Secrets read)."
        )
    if not paginate:
        return json.loads(proc.stdout)
    # --paginate emits one JSON document per page, back to back; decode
    # them all rather than depending on gh's newer --slurp flag.
    merged: list = []
    decoder = json.JSONDecoder()
    idx, text = 0, proc.stdout.strip()
    while idx < len(text):
        page, end = decoder.raw_decode(text, idx)
        merged.extend(page if isinstance(page, list) else [page])
        idx = end
        while idx < len(text) and text[idx] in " \n\r\t":
            idx += 1
    return merged


def collect_live_state() -> dict:
    org_secrets = gh_api(f"/orgs/{ORG}/actions/secrets")
    if org_secrets is None:
        raise OperationalError("org secrets endpoint returned 404")
    repo_names = [
        r["name"] for r in gh_api(f"/orgs/{ORG}/repos?per_page=100", paginate=True)
    ]
    repos = []
    for name in sorted(repo_names):
        secrets_resp = gh_api(f"/repos/{ORG}/{name}/actions/secrets")
        secrets = [s["name"] for s in (secrets_resp or {}).get("secrets", [])]

        collaborators = (
            gh_api(
                f"/repos/{ORG}/{name}/collaborators?affiliation=all&per_page=100",
                paginate=True,
            )
            or []
        )
        write_actors = [
            c["login"]
            for c in collaborators
            if c["permissions"].get("push") and not c["permissions"].get("admin")
        ]

        default_branch = gh_api(f"/repos/{ORG}/{name}")["default_branch"]
        workflows: dict[str, str] = {}
        for branch in dict.fromkeys((default_branch, *EXTRA_BRANCHES)):
            listing = gh_api(
                f"/repos/{ORG}/{name}/contents/.github/workflows?ref={branch}"
            )
            if listing is None:
                continue
            for entry in listing:
                if not entry["name"].endswith((".yml", ".yaml")):
                    continue
                if entry["path"] in workflows:
                    continue
                blob = gh_api(f"/repos/{ORG}/{name}/git/blobs/{entry['sha']}")
                workflows[entry["path"]] = base64.b64decode(blob["content"]).decode(
                    "utf-8", errors="replace"
                )

        envs_resp = gh_api(f"/repos/{ORG}/{name}/environments")
        environments = []
        for env in (envs_resp or {}).get("environments", []):
            reviewer_rules = [
                r
                for r in env.get("protection_rules", [])
                if r.get("type") == "required_reviewers"
            ]
            reviewer_count = sum(len(r.get("reviewers", [])) for r in reviewer_rules)
            env_secrets_resp = gh_api(
                f"/repos/{ORG}/{name}/environments/{env['name']}/secrets"
            )
            environments.append(
                {
                    "name": env["name"],
                    "required_reviewers": reviewer_count,
                    "secrets": [
                        s["name"] for s in (env_secrets_resp or {}).get("secrets", [])
                    ],
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
    return {
        "org_secrets": [s["name"] for s in org_secrets.get("secrets", [])],
        "repos": repos,
    }


# ---------------------------------------------------------------------
# Red-team self-test. Every violation class must be caught, and every
# allowlisted shape must NOT fail. This runs in CI before the live audit;
# if a refactor breaks a check, the audit goes red before it can go blind.
# ---------------------------------------------------------------------


def _repo(name: str, **overrides: object) -> dict:
    base: dict = {
        "name": name,
        "secrets": [],
        "write_actors": [],
        "workflows": {},
        "environments": [],
    }
    base.update(overrides)
    return base


def self_test() -> int:
    failures: list[str] = []

    def expect(label: str, state: dict, codes: set[str], *, clean: bool = False):
        violations, _ = run_checks(state)
        got = {v.split(":", 1)[0] for v in violations}
        if clean and violations:
            failures.append(f"{label}: expected clean, got {violations}")
        elif not clean and not codes <= got:
            failures.append(f"{label}: expected codes {codes}, got {got or 'none'}")

    pr_bypass_wf = (
        "on:\n  pull_request:\njobs:\n  j:\n    steps:\n"
        "      - uses: actions/create-github-app-token@sha\n"
        "        with:\n          app-id: ${{ secrets.MERGE_APP_ID }}\n"
        "          private-key: ${{ secrets.MERGE_APP_PRIVATE_KEY }}\n"
    )
    prt_bypass_wf = pr_bypass_wf.replace("pull_request:", "pull_request_target:")
    sa_ref_wf = (
        "on:\n  pull_request:\njobs:\n  j:\n    steps:\n"
        "      - run: op read op://x\n        env:\n"
        "          OP_SERVICE_ACCOUNT_TOKEN: "
        "${{ secrets.EVIL_ACTIONS_SERVICE_ACCOUNT }}\n"
    )
    push_bypass_wf = pr_bypass_wf.replace("pull_request:", "push:")

    empty = {"org_secrets": [], "repos": []}

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
    # 3. Pending-migration pin warns but does not fail.
    expect(
        "sa-pending-clean",
        {
            "org_secrets": [],
            "repos": [
                _repo("GlycemicGPT", secrets=["BACKEND_ACTIONS_SERVICE_ACCOUNT"])
            ],
        },
        set(),
        clean=True,
    )
    # 4. SA token as an org-wide secret -> SA-ORG.
    expect(
        "sa-org",
        {"org_secrets": ["ROGUE_ACTIONS_SERVICE_ACCOUNT"], "repos": []},
        {"SA-ORG"},
    )
    # 5. Bypass credential in a pull_request workflow -> BYPASS-PR.
    expect(
        "bypass-pr",
        {
            "org_secrets": [],
            "repos": [
                _repo("evil-repo", workflows={".github/workflows/x.yml": pr_bypass_wf})
            ],
        },
        {"BYPASS-PR"},
    )
    # 6. Same via pull_request_target -> BYPASS-PR.
    expect(
        "bypass-prt",
        {
            "org_secrets": [],
            "repos": [
                _repo("evil-repo", workflows={".github/workflows/x.yml": prt_bypass_wf})
            ],
        },
        {"BYPASS-PR"},
    )
    # 7. Allowlisted bypass workflow does not fail (warns only).
    expect(
        "bypass-pinned-clean",
        {
            "org_secrets": [],
            "repos": [
                _repo(
                    "GlycemicGPT",
                    workflows={
                        ".github/workflows/auto-merge-renovate.yml": pr_bypass_wf
                    },
                )
            ],
        },
        set(),
        clean=True,
    )
    # 8. Bypass credential in a push workflow is fine.
    expect(
        "bypass-push-clean",
        {
            "org_secrets": [],
            "repos": [
                _repo("any", workflows={".github/workflows/x.yml": push_bypass_wf})
            ],
        },
        set(),
        clean=True,
    )
    # 9. SA token referenced from a pull_request workflow -> SA-REF-PR.
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
    # 10. New environment without required reviewers -> ENV-UNGATED.
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
    # 11. Baseline-pinned environment warns but does not fail.
    expect(
        "env-baseline-clean",
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
        clean=True,
    )
    # 12. Gated environment drift: exercised against a temporary
    # expectation map (missing env, wrong secret set, plain re-add).
    global EXPECTED_GATED_ENVIRONMENTS
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

    # 13. Fully clean state passes.
    expect("clean", empty, set(), clean=True)

    if failures:
        for f in failures:
            print(f"SELF-TEST FAIL {f}", file=sys.stderr)
        return 1
    print(f"self-test: all {13} red-team fixtures behaved as expected")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--self-test", action="store_true")
    mode.add_argument("--live", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        return self_test()

    try:
        state = collect_live_state()
    except OperationalError as exc:
        print(f"::error::secrets audit could not run: {exc}")
        return 2

    violations, warnings = run_checks(state)
    for w in warnings:
        print(f"::warning::{w}")
    for v in violations:
        print(f"::error::{v}")
    if violations:
        print(f"secrets audit: {len(violations)} violation(s)")
        return 1
    print(
        f"secrets audit: clean ({len(state['repos'])} repos, "
        f"{len(warnings)} pinned warning(s))"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
