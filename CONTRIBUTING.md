# 🤝 Contributing to GlycemicGPT

Thanks for your interest in contributing to GlycemicGPT! Whether you're fixing a typo, squashing a bug, or building a whole new feature -- we appreciate you. 💙

This is the **platform repository's** contributing guide -- the backend API, web dashboard, and AI sidecar. The Android and Wear OS apps live in [android-unofficial](https://github.com/lumose-health/android-unofficial) (see [Mobile Code Lives in android-unofficial](#mobile-code-lives-in-android-unofficial)). This guide covers the setup, testing, and workflow mechanics specific to this repo.

> **Org-wide policy lives in the [master contributing guide](https://github.com/lumose-health/.github/blob/main/CONTRIBUTING.md).** Project roles, the AI-attribution policy, and the org-wide security posture apply to every repository and are documented there once. For those, this guide defers to the master rather than restating them, and focuses on the setup, testing, and workflow mechanics specific to this repo (plus the safety rules that govern the plugin SDK, which lives in [android-unofficial](https://github.com/lumose-health/android-unofficial)).

---

## ⚠️ Safety First -- Please Read

**GlycemicGPT interacts with real diabetes management data. Incorrect data display or bad suggestions can directly impact health decisions.**

Before writing any code, please understand these non-negotiable rules:

- 🏷️ **All** AI-generated outputs must be clearly labeled as **suggestions, not medical advice**
- 💉 Insulin dosing recommendations must **always** include safety disclaimers
- 🧪 Test thoroughly -- a wrong number on a glucose chart is not just a UI bug, it's a safety issue
- 🔒 Safety limits (glucose range, max bolus, max basal) are enforced by the platform via `SafetyLimits` (backend-synced, user-configurable). These limits validate incoming pump and CGM history values; when a reading falls outside the limits, plugins must discard it (do not return, emit, or persist it) and log the rejection with the violated limit -- see the [Plugin Architecture Guide](docs/dev/plugin-architecture.md).
- 🚫 **No device control** -- GlycemicGPT is a monitoring and analysis platform

### Device Data Drivers

GlycemicGPT is a monitoring and analysis platform. The plugin SDK exists for one purpose: **community-built device data drivers that read from new hardware**. Pumps, CGMs, BGMs, and other diabetes devices all have proprietary protocols, and a plugin SDK is the only realistic way to support the long tail of devices the community uses. Plugins read glucose values, insulin-on-board, basal rates, bolus history, and pump status. They do not control devices.

**The project does not provide, distribute, document, or solicit plugins that expose any therapeutic write or control surface -- no bolus dosing, no basal rate changes, no pump-setting modifications.** This applies to every official build (Docker images, APKs, App Store / Play Store releases) and to every contribution merged into this repository. Pull requests that introduce therapeutic write primitives will not be merged. Non-therapeutic device-management operations that already exist in the SDK (CGM calibration, BLE pair/unpair, connect/disconnect) are session and lifecycle operations -- not therapy -- and remain permitted.

**Forks are not endorsed.** Forks of this project that add device control capabilities operate outside the GlycemicGPT project. The maintainers do not review them, recommend them, accept liability for them, or accept contributions to this repository whose intent is to enable them. Users who choose to run such forks become the manufacturer of their own personal medical device, consistent with the legal posture of Loop, AndroidAPS, and other DIY diabetes projects -- see [MEDICAL-DISCLAIMER.md](MEDICAL-DISCLAIMER.md).

**Platform safety enforcement.** The plugin SDK has no insulin delivery primitives -- there is no API on any capability interface for issuing a bolus, modifying basal rates, or otherwise writing therapeutic state to a pump. The AI layer has no architectural path to such a write surface. Device-management commands that *do* exist in the SDK (CGM calibration, BLE pair/unpair, connect/disconnect) are session/lifecycle operations, not therapy. Runtime-loaded plugins are sandboxed via `RestrictedPluginContext`, which is the current architectural restriction. The plugin registry will additionally be hardened to refuse loading any plugin declaring a capability outside the official enum; see [roadmap](https://glycemicgpt.org/docs/about/roadmap) §Phase 1. Safety constraints (glucose range, max bolus, max basal) are platform-defined and backend-synced; plugins use them to drop implausible readings and cannot bypass them.

**Contributing a data driver:**

1. Pick a device that isn't already supported (see the [Plugin Architecture Guide](docs/dev/plugin-architecture.md) for the capability matrix)
2. Open an issue in [android-unofficial](https://github.com/lumose-health/android-unofficial/issues) describing the device, the protocol you intend to use, and the data you'll surface
3. Submit a PR to [android-unofficial](https://github.com/lumose-health/android-unofficial) with a new Gradle module under `plugins/shipped/<device-name>/` (these modules are compiled into official builds), declaring only capabilities from the official read-only enum. For device data drivers the relevant capabilities are typically `GLUCOSE_SOURCE`, `INSULIN_SOURCE`, `PUMP_STATUS`, `BGM_SOURCE`, `CALIBRATION_TARGET`, and/or `BOLUS_CATEGORY_PROVIDER`. The `DATA_SYNC` capability is reserved for future external-sync integrations (Nightscout, Tidepool); its interface is not yet defined and it is not currently implementable
4. Include unit tests, especially for parsing and `SafetyLimits` validation of incoming values
5. Existing plugins serve as reference implementations. Runtime-loaded plugins (under `plugins/example/` in android-unofficial) are a separate, advanced contribution path -- they are not compiled into official builds and run with `RestrictedPluginContext`

**Shipped device data drivers:**

| Driver | Module | Transport | Reads | Status |
|---|---|---|---|---|
| Tandem (t:slim X2 / Mobi) | `:tandem-pump-driver` (`plugins/shipped/tandem/` in android-unofficial) | BLE (central) | Glucose, IoB, basal, bolus history, pump status | Stable — reference implementation |
| Medtronic MiniMed (680G / 770G / 780G) | `:medtronic-pump-driver` (`plugins/shipped/medtronic/` in android-unofficial) | BLE (peripheral, advertise-and-wait) | Sensor glucose, IoB, basal, bolus history, reservoir, battery | **Beta**, read-only |

Both drivers are **read-only** — they read data from the pump and never issue therapeutic writes. The Medtronic driver is gated behind the `MEDTRONIC_DRIVER_ENABLED` build flag (default on); a build with the flag off omits the plugin entirely.

---

## 📑 Table of Contents

- [Project Roles](#-project-roles)
- [Ways to Contribute](#ways-to-contribute)
- [Finding Something to Work On](#finding-something-to-work-on)
- [Development Setup](#development-setup)
- [Branching & Workflow](#branching--workflow)
- [Commit Messages](#commit-messages)
- [Before You Submit](#before-you-submit)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Documentation](#documentation)
- [AI-Assisted Development & Attribution Policy](#ai-assisted-development--attribution-policy)
- [Project Structure](#project-structure)
- [Plugin Development](#plugin-development)
- [Release Channels](#release-channels)
- [License](#license)
- [Questions?](#questions)

---

## 👥 Project Roles

Most people start as contributors -- just open a PR, file an issue, or join a discussion. Consistent, sound contributions can lead to an invitation to a maintainer stewardship role.

One thing to know up front: **every contribution arrives as a pull request from a fork, at every role.** No one other than the project lead holds write (push) access. This is an org-wide security policy -- for a same-repo PR, GitHub would run the PR's workflow files with repository secrets in scope before any human review -- not a statement about trust in any contributor.

The roles, the reasoning behind the fork-based policy, how decisions are made, and how branch protection works are all documented in [GOVERNANCE.md](GOVERNANCE.md) (the canonical copy lives in the org [`.github`](https://github.com/lumose-health/.github/blob/main/GOVERNANCE.md) repo).

---

## 💡 Ways to Contribute

There are many ways to help, not all of them involve writing code:

- 🐛 **Report bugs** -- Use the [Bug Report](https://github.com/lumose-health/GlycemicGPT/issues/new?template=bug_report.yml) template (mobile app bugs go to [android-unofficial](https://github.com/lumose-health/android-unofficial/issues))
- ✨ **Request features** -- Use the [Feature Request](https://github.com/lumose-health/GlycemicGPT/issues/new?template=feature_request.yml) template
- 📝 **Improve documentation** -- Typos, unclear instructions, missing guides
- 🧪 **Write tests** -- More coverage is always welcome
- 🔍 **Review PRs** -- Fresh eyes catch things automated checks can't
- 💬 **Answer questions** -- Help others in [Discussions](https://github.com/lumose-health/GlycemicGPT/discussions)

Before opening an issue, please search [existing issues](https://github.com/lumose-health/GlycemicGPT/issues?q=is%3Aissue) to avoid duplicates. For general questions and support, use [Discussions](https://github.com/lumose-health/GlycemicGPT/discussions/categories/q-a) instead of creating an issue.

---

## 🔍 Finding Something to Work On

Not sure where to start? Browse [open issues](https://github.com/lumose-health/GlycemicGPT/issues) and look for these labels:

- 🏷️ **`good first issue`** -- Small, well-scoped tasks ideal for new contributors
- 🏷️ **`help wanted`** -- We'd love community help on these
- 🏷️ **`bug`** -- Known bugs waiting for a fix

> **Tip:** Not every label will have open issues at all times. If none are tagged yet, browse the full [issue list](https://github.com/lumose-health/GlycemicGPT/issues) or check the [Ideas discussion board](https://github.com/lumose-health/GlycemicGPT/discussions/categories/ideas) for inspiration.

If you'd like to work on something, comment on the issue to let others know. For larger changes, please open an issue or start a [discussion](https://github.com/lumose-health/GlycemicGPT/discussions) first to discuss the approach before investing time in a PR.

---

## 🛠️ Development Setup

> **New to the codebase?** [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/lumose-health/GlycemicGPT)
>
> DeepWiki is an auto-generated, AI-powered wiki of this repository -- a fast way to explore the architecture and ask questions in natural language before you dive in. It is AI-generated and can be incomplete or wrong, so treat it as an orientation aid: the source code, the `docs/` site, and the safety rules above are authoritative.

### Prerequisites

You only need the tools for the component(s) you're working on:

| Component | You Need |
|-----------|----------|
| 🌐 Web UI | Docker + Docker Compose |
| 🐍 Backend API | Docker + Docker Compose (or Python 3.12+ with [UV](https://docs.astral.sh/uv/)) |
| 🤖 AI Sidecar | Docker + Docker Compose (or Node.js 20+) |
| 📝 Docs only | Just a text editor! |

Working on the Android or Wear OS apps? Head to
[android-unofficial](https://github.com/lumose-health/android-unofficial) -- the mobile code and its
build/test tooling live there.

### 🚀 Quick Start (Web/API -- recommended for most contributors)

The fastest way to get a working dev environment:

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/GlycemicGPT.git
cd GlycemicGPT

# 2. Add upstream remote
git remote add upstream https://github.com/lumose-health/GlycemicGPT.git

# 3. Install the git commit-msg hook (strips prohibited attribution lines)
#    If scripts/hooks/commit-msg doesn't exist, skip this step -- CI enforces it too
cp scripts/hooks/commit-msg .git/hooks/commit-msg
chmod +x .git/hooks/commit-msg

# 4. Copy environment file (defaults work for local dev)
cp .env.example .env

# 5. Start all services
docker compose up --build -d

# 6. Verify everything is running
curl localhost:8000/health   # API -- should return {"status": "healthy"}
curl localhost:3456/health   # AI sidecar -- should return {"status": "ok"}
# Web UI is at http://localhost:3000
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| Web UI | 3000 | Next.js 15 frontend |
| API | 8000 | FastAPI backend |
| AI Sidecar | 3456 | AI provider proxy |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache / SSE broker |

### 🐍 Backend Setup (without Docker)

If you prefer running the API directly:

> **Note:** Backend tests require a running PostgreSQL instance. The easiest way is to start just the database container: `docker compose up db -d`. Tests use the connection settings from your `.env` file.

```bash
cd apps/api
uv sync              # Install dependencies
uv run pytest        # Run tests (requires PostgreSQL -- see note above)
uv run ruff check .  # Lint
uv run ruff format --check .  # Format check
```

### 🖥️ Frontend Setup (without Docker)

If you prefer running the frontend directly:

```bash
cd apps/web
npm install    # Install dependencies
npm test       # Run tests
npm run lint   # Lint
npm run dev    # Start dev server (http://localhost:3000)
```

> **Note:** Running `npm run dev` alone only tests frontend rendering. For full integration testing (API calls, auth, SSE), use Docker Compose.

### 🤖 Sidecar Setup (without Docker)

```bash
cd sidecar
npm install    # Install dependencies
npm test       # Run tests
```

> **Need real project credentials?** Most contributors don't -- the local stack runs on bundled defaults. If your work genuinely requires the dev-stack test account or another project-managed credential, email <info@glycemicgpt.org>.

---

## 🌿 Branching & Workflow

We use a **develop/main** branching model:

```
feature branch --> squash merge --> develop --> merge --> main
                                      |                     |
                                  dev builds           stable releases
                                  Docker :dev          Docker :latest
```

### Rules

- **`develop`** is the integration branch. **All contributor PRs target `develop`.**
- **`main`** is the stable release branch. Do **not** target PRs to `main`.
- Feature branches are created from `develop` and squash-merged back.

> **Note on the GitHub branch counter:** GitHub's branch comparison may show `develop` as a number of commits *behind* `main`. This is a cosmetic SHA-graph artifact, not a content drift -- after a release-please version bump or automated changelog update on `main`, the `sync-main-to-develop` workflow cherry-picks those commits back to `develop` as new commits with new SHAs. GitHub compares SHAs, so the original `main`-side commits register as missing on `develop` even though the file content (version number, `CHANGELOG.md`) is identical. See [docs/dev/branching-strategy.md](docs/dev/branching-strategy.md) for the full release cycle.

### Creating a Feature Branch

Contributions come in from forks (see [Project Roles](#-project-roles)), so `origin` below is your fork; add the project repo as `upstream` once:

```bash
git remote add upstream https://github.com/lumose-health/GlycemicGPT.git  # one-time
git fetch upstream
git checkout -b feat/my-feature upstream/develop
# ... make changes ...
git push -u origin feat/my-feature
# Create PR targeting develop
```

### Branch Naming

Use a descriptive prefix:

| Prefix | Usage |
|--------|-------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation |
| `refactor/` | Code restructuring |
| `ci/` | CI/CD changes |

---

## 📝 Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/). This drives our automated CHANGELOG generation via [release-please](https://github.com/googleapis/release-please).

| Prefix | Usage | CHANGELOG |
|--------|-------|-----------|
| `feat:` | New features | Visible |
| `fix:` | Bug fixes | Visible |
| `perf:` | Performance improvements | Visible |
| `docs:` | Documentation only | Visible |
| `refactor:` | Code restructuring | Visible |
| `ci:` | CI/CD changes | Visible |
| `chore:` | Maintenance, deps | Hidden |
| `test:` | Adding/updating tests | Hidden |

Prefixes marked "Hidden" won't appear in the CHANGELOG but are still good practice.

**Examples:**
```
feat: add glucose trend chart to the web dashboard
fix: prevent token refresh race condition on concurrent 401s
docs: add contributing guide and issue templates
refactor: extract BLE packet parser into separate module
chore(deps): update dependency next to v15.5.12
```

---

## ✅ Before You Submit

**Run these checks locally before pushing.** CI will catch failures, but it's faster to catch them yourself.

### Pre-Push Checklist

Run the checks for whichever component(s) you changed:

**Backend (API):** (requires PostgreSQL -- run `docker compose up db -d` if not already running)
```bash
cd apps/api
uv run pytest                  # Unit tests
uv run ruff check .            # Linter
uv run ruff format --check .   # Formatter
```

**Frontend (Web):**
```bash
cd apps/web
npm test       # Unit tests
npm run lint   # Linter
npm run build  # Build check (catches TypeScript errors)
```

**AI Sidecar:**
```bash
cd sidecar
npm test  # Unit tests
```

**Docker Integration (if you changed Docker/compose files or cross-service behavior):**
```bash
docker compose up --build -d
curl localhost:8000/health       # Should return {"status": "healthy"}
curl localhost:3456/health       # Should return {"status": "ok"}
docker compose down
```

### Pre-Review with CodeRabbit CLI (Optional but Recommended)

This project uses [CodeRabbit](https://www.coderabbit.ai) for automated AI code review on every PR. You can catch the same issues locally **before** pushing by using the CodeRabbit CLI with a free account. This saves time -- you'll fix problems before the PR review instead of after.

**One-time setup:**

1. Sign up free at [app.coderabbit.ai](https://app.coderabbit.ai) via your GitHub account (no credit card required -- open-source repos get free reviews)
2. Install the CLI:
   ```bash
   curl -fsSL https://cli.coderabbit.ai/install.sh | sh
   ```
3. Authenticate:
   ```bash
   coderabbit auth login
   ```

**Before pushing, review your changes:**

```bash
# Review uncommitted changes (staged + unstaged)
coderabbit review --plain --type uncommitted

# Review your committed changes against develop
coderabbit review --plain --type committed --base develop
```

The CLI auto-detects the project's `.coderabbit.yaml` configuration, so your local reviews use the same rules (medical safety checks, security scanning, path-specific review focus) as the automated PR reviews. Your CLI instance is independent -- it doesn't connect to our CodeRabbit account -- but it uses the same analysis engine.

> **Rate limits:** Free accounts get 2 CLI reviews per hour. Open-source (public) repos get free reviews forever.

### Final Checks

- [ ] All tests pass for the component(s) you changed
- [ ] Linting passes with no new warnings
- [ ] No hardcoded secrets, API keys, tokens, or credentials in your code
- [ ] New functionality has tests
- [ ] Commit messages follow [Conventional Commits](#commit-messages) format
- [ ] Your branch is up to date with `develop`

---

## 🔀 Pull Request Process

### Creating Your PR

1. Push your feature branch to your fork
2. Open a PR **targeting `develop`** (not `main`)
3. Fill out the PR template completely
4. Link related issues using `Fixes #123` or `Relates to #123`

### What Happens Next

1. **CI runs automatically** -- all required checks must pass (see below)
2. **CodeRabbit review** -- an AI-powered code review runs automatically on every PR, checking for bugs, security issues, medical safety concerns, and code quality. It posts comments directly on your PR with findings and suggestions. This is the same engine you can run locally with the [CodeRabbit CLI](#pre-review-with-coderabbit-cli-optional-but-recommended).
3. **Code owner review** -- the project lead reviews your PR; area maintainers may review too, and their review informs the lead's approval
4. **Feedback** -- you may be asked to make changes; push new commits to the same branch
5. **Merge** -- once approved and CI passes, the project lead squash-merges your PR

### Required CI Checks

Every PR must pass the checks required for its target branch before it can be merged:

| Check | What It Validates |
|-------|-------------------|
| Backend Tests | Python unit tests with PostgreSQL |
| Backend Lint | Ruff linter + formatter |
| Frontend Tests | Jest tests + Next.js build |
| Frontend Lint | ESLint |
| Sidecar Tests | Vitest for AI proxy |
| Attribution Check | No prohibited attribution lines |
| GitGuardian | Secret/credential scanning |
| Security Scan Gate | SAST + DAST security testing for PRs targeting `main` (see below) |

### How CI handles fork PRs

If you opened this PR from your own fork (the normal contributor flow), every required CI check above runs automatically. The one exception comes from the repo's fork-approval policy, which is set to require approval for **first-time contributors only**: on your very first contribution to the repo, the project lead has to click "Approve and run" once before CI starts. Beyond that you don't need to do anything special, and nobody needs to grant you any permissions.

A few details on how that works, in case you're auditing:

- **Labels and the attribution sticky comment** are posted by workflows running under `pull_request_target`. They inspect your PR's metadata (title, body, file list) and the text of your commits and diff -- they never install dependencies from your branch or execute any of your code. The attribution workflow fetches your commits as a remote-only ref so the working tree stays as the base.
- **The Security Scan Gate** generates a throwaway password at job runtime to register ephemeral users in the CI database. The Docker stack lives and dies inside the same job, so the value protects nothing and isn't a repo secret. For PRs targeting `main`, the gate runs identically for forks and branch PRs.
- **CodeRabbit** has its own review queue. If you push faster than it can catch up you may see stale state on the PR until it does -- not a CI failure. Comment `@coderabbitai review` to re-trigger if needed.

If a check fails for what looks like an environmental reason rather than a problem in your code, ping a maintainer in the PR and we'll investigate.

### 🔒 Security Scan (Smart Targeting)

This is a medical platform. We take security seriously. For PRs targeting `main`, the Security Scan Gate runs **targeted security tests based on what your PR actually changes**. It won't waste 25 minutes scanning the API if you only changed the web frontend. Feature PRs targeting `develop` are covered by the full security suite after they merge.

| If you changed... | What runs |
|-------------------|-----------|
| `apps/api/` | Semgrep Python, auth pentests, IDOR, SSRF, API fuzzer, nuclei API, ZAP API active scan |
| `apps/web/` | Semgrep TypeScript, nuclei Web, ZAP Web scan |
| `sidecar/` | Semgrep TypeScript |
| `docker-compose*`, `Dockerfile*` | Everything (infra changes affect all services) |
| `scripts/security/` | Everything |
| Docs, config, or other non-code files | Nothing -- security gate reports green instantly |

For the full breakdown of what each test suite does, see [docs/dev/security-testing.md](docs/dev/security-testing.md).

### 🚨 What If the Security Scan Finds Something?

Don't panic. Here's what happens automatically:

1. **glycemicgpt-security posts a comment** on your PR showing exactly what failed and why
2. **GitHub Issues are created** for each finding, assigned to you, with severity labels and remediation guidance
3. **You fix the issue** in your PR -- push a new commit with the fix
4. **CI runs again** -- if the finding is resolved, the issue **auto-closes** with a "resolved in PR #X" comment
5. **You're done** -- green CI, closed issues, ready for review

The whole cycle happens within your PR. You don't need to manually close issues or wait for a maintainer.

**If your code caused the finding:** Fix it. The scan won't pass until you do. Common things it catches:
- Semgrep flagging hardcoded secrets, injection patterns, or insecure crypto
- ZAP finding SQL injection, XSS, or missing security headers
- IDOR tests detecting cross-user data leaks

**If the finding is pre-existing (not your fault):** Sometimes the scan catches something in code you didn't write. You have two options:
1. **Fix it anyway** (preferred -- we appreciate it even if you didn't cause it)
2. **Add a documented exception** -- see below

**If you close your PR without fixing:** Issues linked solely to your PR are automatically cleaned up. If another PR independently detected the same finding, the issue stays open and is tracked against that PR instead.

### 🛡️ Security Exceptions

Sometimes a finding is a known limitation, an accepted risk, or a false positive. That's fine -- but you can't just ignore it. We have a formal process.

**Semgrep (code-level findings):** Add `# nosemgrep: rule-id` as a comment on the flagged line. Must be a real code comment, not inside a string.

**ZAP (runtime findings):** Add an entry to `scripts/security/zap-suppressions.json`:
```json
{
  "pluginId": "10055",
  "scan": "web",
  "reason": "Next.js requires unsafe-inline for hydration. Fix tracked in #123."
}
```

**OSV-Scanner (dependency vulnerabilities):** Add an entry to `osv-scanner.toml`:
```toml
[[IgnoredVulns]]
id = "GHSA-xxxx-yyyy-zzzz"
reason = "Not exploitable -- only affects feature X which we don't use"
```

**The rules (non-negotiable):**
- Every exception **must** include a reason. No reason = no merge.
- Reference the issue that will fix the underlying problem (e.g., `Fix tracked in #123`).
- Suppressed findings still show up in CI logs -- they're visible, just non-blocking.
- Maintainers review all exceptions quarterly. Stale ones get removed.
- If you're not sure whether something is a real finding or a false positive, ask in the PR -- that's what code review is for.

### 🛰️ Platform-level security scanning (GitHub-native)

Alongside the PR-time CI scans above, the repo enables GitHub's platform-level scanners as a second layer. Contributors generally don't interact with these directly -- they run in the background and surface findings in the repo's **Security** tab, which is gated to maintainers. The project lead reviews open alerts on a weekly cadence.

| Tool | What it catches | What it adds vs existing tools |
|---|---|---|
| **Dependabot alerts** (alerts only -- not auto-PRs) | New CVEs published against dependencies you already have. Runs continuously, even when nothing changes in the repo. | OSV-Scanner only catches CVEs on the next CI run; Dependabot catches them the moment GitHub Advisory Database publishes. Renovate continues to handle the actual upgrade PRs -- Dependabot's auto-PR feature is intentionally OFF to avoid duplicate upgrade PRs. |
| **Secret Scanning + Push Protection** | Accidentally committed API keys, tokens, or other credentials in public providers' formats. Push Protection blocks the push before the credential lands in the repo. | GitGuardian gives the same coverage at PR/commit time; this is a second-line GitHub-native safety net. |

**If you push and Push Protection blocks you:** GitHub's error message tells you exactly which secret was detected and where. The block fires BEFORE the secret reaches GitHub, so the commit you tried to push has not been published. Three legitimate responses:
1. **It was a real secret you accidentally committed:** remove it from the commit history (`git commit --amend` for the most recent commit, or `git rebase -i` for an earlier one), then re-push. Because Push Protection blocked the push, the secret never reached GitHub -- rotation is a best-practice second step but not strictly required since the credential was never exposed. (Different rule applies if Secret Scanning detects the secret AFTER it was already pushed: in that case, rotate immediately AND remove from history, since the commit is reachable via reflog/forks/PR API for ~90 days even after a force-push.)
2. **It's a test fixture or example value (not a real credential):** rephrase it so it doesn't match the detector pattern (e.g., use a clearly-fake suffix like `EXAMPLE-NOT-A-SECRET`), or follow the GitHub UI's "bypass with reason" flow if available.
3. **You're not sure:** ask in the PR comments. A maintainer can help triage.

If a Security-tab alert appears, the project lead (or designated maintainer) triages it within a week. Real findings get a tracked issue and follow the same "every exception needs a reason" rule as the CI scans above.

> **Note:** There is a separate [Promotion PR Template](.github/PROMOTION_PR_TEMPLATE.md) used only for develop-to-main releases. Regular contributors don't need to worry about this.

---

## 🎨 Code Style

### 🐍 Python (Backend -- `apps/api/`)

- Formatter: **Ruff** (`ruff format`)
- Linter: **Ruff** (`ruff check`)
- Type hints required for function signatures
- FastAPI patterns: use `Depends()` for dependency injection

### 🟦 TypeScript (Frontend -- `apps/web/`)

- Formatter/Linter: **ESLint** + **Prettier**
- Next.js 15 App Router conventions
- React Server Components by default; `"use client"` only when needed
- Tailwind CSS for styling; shadcn/ui for components

### 🤖 TypeScript (Sidecar -- `sidecar/`)

- Express.js REST patterns
- Vitest for testing
- Multi-provider AI proxy (routes requests to Claude, OpenAI, Ollama, etc.)
- Follows same TypeScript conventions as frontend

---

## 📚 Documentation

When you add or change a feature, update the docs in `docs/`. Documentation is part of the change, not a separate concern.

**File format:**

- Use `.md` (standard Markdown). It renders on GitHub for PR review and browsing, and the website at `glycemicgpt.org/docs` renders it the same way.
- `.mdx` is allowed only when a page actually needs to embed JSX components. We don't have any today and probably never will -- default to `.md`.

**Frontmatter (required at the top of every page):**

```markdown
---
title: A short page title
description: One-sentence description for the website's sidebar and search.
---
```

Only `title` and `description`. No other fields -- the website handles structure via `_meta.json` files.

**Where pages go:**

| Audience | Location |
|---|---|
| Users self-hosting the platform (the primary audience) | Top-level `docs/`, `docs/install/`, `docs/daily-use/`, `docs/troubleshooting/`, `docs/caregivers/`, `docs/concepts/` |
| Developers contributing code | `docs/dev/` |

The user-facing pages are written for non-technical diabetics and caregivers. If you're adding a developer-track page, put it in `docs/dev/` and tone can stay technical.

**Sidebar ordering:**

Each directory may have a `_meta.json` listing pages in the order they appear in the website's sidebar:

```json
{
  "title": "Section Title",
  "pages": ["index", "page-one", "page-two"]
}
```

If `_meta.json` is absent, the sidebar falls back to alphabetical. Don't include the `.md` extension in the `pages` array.

**Links and assets:**

- Cross-doc links use **relative paths**: `[Get Started](../get-started.md)`. The website's sync script rewrites these to website-relative URLs.
- Image references use **relative paths**: `![Install screen](./assets/install-step-1.png)`.
- Don't use absolute URLs for in-repo content -- relative paths render correctly on both GitHub and the website.

**Tone for user-facing docs:**

- Lead with the goal, not the tool ("See your glucose on a dashboard" beats "Configuring the FastAPI service")
- Plain language ("pair your pump" not "establish a BLE GATT connection")
- One outcome per page
- Prerequisites in a callout box (`>`-style blockquote) at the top of any install / setup page
- Symptoms-first troubleshooting -- titles like "BG isn't updating," not "Diagnosing the SSE event loop"
- Never give medical advice -- always defer to "consult your healthcare provider"
- Honest tradeoffs when two paths exist (Docker vs Kubernetes, etc.)

See the existing pages under `docs/` for examples.

---

## 🤖 AI-Assisted Development & Attribution Policy

**Using AI tools to help write code is completely fine; leaving AI attribution lines in the repo is not.** You own the code you submit -- understand it, make it match our patterns, and test it. The broader policy is org-wide -- see the [master contributing guide](https://github.com/lumose-health/.github/blob/main/CONTRIBUTING.md#-ai-assisted-development--attribution-policy).

### No AI attribution in code

This repository must be clean of AI attribution lines:

- **No** `Co-Authored-By: Claude`, `Generated by ChatGPT`, or similar lines in commits
- **No** `// Generated by AI` or `// Copilot suggestion` comments in code
- **No** AI tool branding, promotional links, or attribution banners in PR descriptions

CI runs an **Attribution Check** on every PR -- scanning commit trailers, changed-file comments, and the PR description -- that fails the PR on a hit. The git commit-msg hook installed during [Quick Start](#-quick-start-webapi----recommended-for-most-contributors) strips these locally as a first line of defense. CodeRabbit also runs automatically via [`.coderabbit.yaml`](.coderabbit.yaml); you can catch its findings first with the [CodeRabbit CLI](#pre-review-with-coderabbit-cli-optional-but-recommended).

### Bot Whitelist

These automation identities are whitelisted and do **not** trigger attribution findings:

- **GitHub system:** `github-actions[bot]`, `dependabot[bot]`
- **Project automation:** `glycemicgpt-ci[bot]`, `glycemicgpt-security[bot]`, `glycemicgpt-release[bot]`, `glycemicgpt-merge[bot]`, `glycemicgpt-renovate[bot]`
- **Third-party integrations:** `coderabbitai[bot]`, `gitguardian[bot]`
- **Legacy:** `homebot-0[bot]`

To whitelist another legitimate non-AI bot, open an issue.

---

## 📁 Project Structure

```
GlycemicGPT/
├── apps/
│   ├── api/            # FastAPI backend (Python)
│   │   ├── src/        # Source code
│   │   └── tests/      # pytest tests
│   └── web/            # Next.js 15 frontend (TypeScript)
│       ├── src/        # Source code (App Router)
│       └── __tests__/  # Jest tests
├── sidecar/            # AI provider proxy (TypeScript/Express)
│   ├── src/            # Source code
│   └── tests/          # Vitest tests
├── docker-compose.yml  # Full stack orchestration
├── .github/
│   ├── workflows/      # CI/CD pipelines
│   ├── CODEOWNERS      # Code ownership for PR reviews
│   └── ISSUE_TEMPLATE/ # Issue templates
└── docs/               # Project documentation
```

### Plugin Development

The mobile app uses a capability-based plugin architecture. New device support (pumps, CGMs, BGMs) is added as plugin modules in [android-unofficial](https://github.com/lumose-health/android-unofficial), which hosts the plugin SDK. See that repository's [Plugin Architecture Guide](https://github.com/lumose-health/android-unofficial/blob/main/docs/dev/plugin-architecture.md) for how to create a new plugin module, the capability interfaces and mutual-exclusion rules, declarative UI descriptors, the event bus, the Hilt DI registration pattern, and the Tandem plugin as a reference implementation.

### Mobile Code Lives in android-unofficial

The Android and Wear OS apps and the plugin SDK have been extracted into
[android-unofficial](https://github.com/lumose-health/android-unofficial). This repository is
backend-only: the API, web dashboard, and AI sidecar.

- **Mobile PRs, issues, and releases live in android-unofficial.** Open mobile changes there
  against its `develop` branch.
- Backend, web, sidecar, and platform documentation contributions live here.

For the Android/Wear build and test mechanics, see the
[android-unofficial contributing guide](https://github.com/lumose-health/android-unofficial/blob/develop/CONTRIBUTING.md).

---

## 📦 Release Channels

| Channel | Branch | Docker Tag |
|---------|--------|------------|
| **Stable** | `main` | `latest`, semver |
| **Dev** | `develop` | `dev` |

Stable releases are created automatically by release-please when code is promoted from `develop` to `main`. Your contribution will ship in the next stable release after the promotion PR is merged.

Android APK releases are cut from [android-unofficial](https://github.com/lumose-health/android-unofficial).

---

## 📜 License

GlycemicGPT is licensed under the [GNU General Public License v3.0](LICENSE). By contributing, you agree that your contributions will be licensed under the same license.

---

## 💬 Questions?

- 🙏 **General questions & help** -- Post in [Q&A Discussions](https://github.com/lumose-health/GlycemicGPT/discussions/categories/q-a)
- 💡 **Feature ideas & brainstorming** -- Post in [Ideas Discussions](https://github.com/lumose-health/GlycemicGPT/discussions/categories/ideas)
- 🐛 **Bug reports** -- Open an [Issue](https://github.com/lumose-health/GlycemicGPT/issues/new/choose) using the appropriate template
- 🙌 **Show off your setup** -- Post in [Show and Tell](https://github.com/lumose-health/GlycemicGPT/discussions/categories/show-and-tell)

Please **do not** open Issues for general questions -- use Discussions instead. Issues are for actionable bugs and feature requests.

We try to respond to PRs, issues, and discussions within a few days. If your PR sits without feedback for more than a week, feel free to leave a comment pinging the maintainers.
