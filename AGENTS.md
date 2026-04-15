# AGENTS.md

## Repo focus

Aura-Call is a browser/API orchestration CLI. Keep changes aligned with the
current architecture and docs, and prefer tightening semantics over adding more
aliases.

## Before you start

- Review recent commits: `git log --oneline -5`
- Skim the current operational docs:
  - `README.md`
  - `docs/testing.md`
  - newest entries in `docs/dev-fixes-log.md`
- For browser/config work, also skim:
  - `docs/dev/plans/0008-2026-04-14-browser-profile-family-refactor.md`
  - `docs/dev/plans/0001-2026-04-14-execution.md`
  - `docs/dev/browser-service-upgrade-backlog.md`
  - `docs/dev/browser-service-tools.md`

## Required doc hygiene

- Keep `docs/dev/dev-journal.md` updated with current focus, progress, and
  blockers.
- Add durable fixes/lessons to `docs/dev-fixes-log.md`.
- If semantics or operator behavior changes, update the user-facing docs in the
  same slice.

## Terminology

Use these terms consistently:

- `browser profile`
  - browser-service level runtime/account family config
  - examples: `default`, `wsl-chrome-2`
- `source browser profile`
  - native Chromium profile used for bootstrap/cookie sourcing
  - examples: `Default`, `Profile 1`, `Profile 2`
- `managed browser profile`
  - Aura-Call-owned automation profile directory
- `AuraCall runtime profile`
  - top-level Aura-Call config entry selected by `auracallProfile` /
    `--profile`

Avoid using plain `profile` when the meaning is ambiguous.

## Browser work rules

- Prefer reusable browser-service fixes when a problem smells generic.
- Keep provider-specific heuristics in adapters unless the same pattern is
  clearly repeated elsewhere.
- Never auto-click ChatGPT's `Answer now` button.
- For browser smokes that look suspicious, rerun with
  `--browser-keep-browser --verbose` and inspect the live DOM with
  `pnpm tsx scripts/browser-tools.ts ...`.
- Until captcha/human-verification automation exists, treat Gemini
  `google.com/sorry`, visible CAPTCHA, reCAPTCHA, and similar anti-bot pages
  as a hard stop:
  - do not keep retrying automation against the same managed browser profile
  - require human interaction to clear the page before resuming
  - after clearance, resume with the lowest-churn path first:
    - one real AuraCall command
    - then one bounded `browser-tools` inspection only if still needed
- Browser/account state lives under `~/.auracall`. Managed browser profiles
  are under `~/.auracall/browser-profiles/<auracallProfile>/<service>`.

## Live test rules

- OpenAI live tests are opt-in:
  - `AURACALL_LIVE_TEST=1 pnpm vitest run tests/live/openai-live.test.ts`
- Browser runs can take minutes. Keep the scope narrow and validate one surface
  at a time.
- On WSL, prefer WSL Chrome first. Treat Windows Chrome from WSL as a separate
  browser profile, not a default assumption.
- On Gemini specifically, serialize live probes and avoid repeated direct
  `/app/<id>` navigation when debugging. If a `sorry`/captcha page appears,
  stop and let a human clear it before any more automated steps on that
  managed browser profile.

## ChatGPT browser notes

- Root and project CRUD are green on the managed WSL Chrome path.
- Project chat authority is the project `Chats` panel, not the abbreviated
  sidebar subset.
- Root rename/delete should use the sidebar row action surface, not header
  menus.
- Artifact/context extraction is implemented; keep hostile-state hardening and
  diagnostics intact when touching read paths.

## Release / ops notes

- Before a release, skim `docs/manual-tests.md` and rerun the relevant manual
  smokes for the touched surface.
- npm publish with OTP:
  - prepare/tag/release first
  - run `npm publish ...`
  - stop at `Enter OTP:`
  - ask the user for the OTP and continue
- Beta publishes require a fresh beta version suffix.

## Environment notes

- Session data lives under `~/.auracall`.
- If browser cookie sync fails because `keytar` or `sqlite3` native modules
  are missing in a pnpm dlx cache, rebuild the module in the printed package
  directory with system Python and rerun.
- WSL ChatGPT runbook:
  - `docs/wsl-chatgpt-runbook.md`
- Windows-specific work:
  - `docs/windows-work.md`

## End-of-turn agent policy

Every end-of-turn update must include all of the following sections:

- Status + Verification
  - What changed in the turn.
  - Test and command evidence with pass/fail outcomes.
  - Any doc/behavior changes and why they matter.
- Best Recommendation (Primary)
  - Exactly one best recommendation, stated decisively with rationale.
  - Include a clear next action.
- Ranked Alternatives
  - Present close alternatives when relevant, using the ordering:
    - Best (recommended) + rationale
    - second-best + tradeoff
    - alternative + tradeoff
  - Keep this short and concrete; include what is deferred or delayed.
- Plan + Audit
  - Next slice with explicit acceptance criteria.
  - Audit checklist for what still needs validation before the next step.
- Roadmap/Reassessment check
  - Explicit statement of whether slice scope remains on roadmap.
  - If the phase is nearing completion, explicitly decide whether to continue
    to the next checkpoint or pause for a roadmap reassessment.
- Risks/Blockers
  - Top residual blockers with the exact unblocker needed.

## Policy Loading Contract

- `AGENTS.md` is a routing surface, not a one-time pointer.
- Re-read the relevant policy files under `docs/dev/policies/` at the start of any non-trivial turn.
- Re-read the relevant policy files when task scope changes mid-session.
- When behavior is ambiguous, prefer re-reading policy over improvising from stale assumptions.

## Policy Re-read Triggers

- re-read planning-related policy before opening, revising, or closing a substantive plan
- re-read documentation-related policy before changing docs, contracts, or canonical authorities
- re-read validation and closeout policy before claiming work complete
- re-read branch, commit, and integration policy before starting a multi-file or multi-step implementation slice

## Policy Entry

This repo keeps its durable repo-local policy under `docs/dev/policies/`.

Always read:
- `docs/dev/policies/0008-architecture-guardrails.md`
- `docs/dev/policies/0009-documentation-change-control.md`
- `docs/dev/policies/0017-turn-closeout.md`
- `docs/dev/policies/0018-validation-and-handoff.md`

For planning/roadmap work also read:
- `docs/dev/policies/0005-planning-discipline.md`
- `docs/dev/policies/0007-roadmap-runbook-governance.md`

For git/integration/release work also read:
- `docs/dev/policies/0010-git-worktree-hygiene.md`
- `docs/dev/policies/0011-commit-history-discipline.md`
- `docs/dev/policies/0012-branch-and-integration-strategy.md`
- `docs/dev/policies/0013-commit-and-push-cadence.md`
- `docs/dev/policies/0016-versioning-and-release.md`
- `docs/dev/policies/0019-upstream-fork-maintenance.md`

For multi-agent or long-running context work also read:
- `docs/dev/policies/0004-notes-and-memories.md`
- `docs/dev/policies/0006-parallel-plan-design.md`
- `docs/dev/policies/0014-multi-agent-reconciliation.md`
- `docs/dev/policies/0015-subagent-workflow-optimization.md`

## Scope

- `AGENTS.md` includes repo-local guidance plus the policy entry section.
- The durable policy body lives under `docs/dev/policies/`.
- Canonical bounded plan artifacts belong under `docs/dev/plans/`.
- Keep repo-specific commands, environment details, and operational caveats in this file or adjacent local docs.
