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
  - `docs/dev/browser-profile-family-refactor-plan.md`
  - `docs/dev/next-execution-plan.md`
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
- Browser/account state lives under `~/.auracall`. Managed browser profiles
  are under `~/.auracall/browser-profiles/<auracallProfile>/<service>`.

## Live test rules

- OpenAI live tests are opt-in:
  - `AURACALL_LIVE_TEST=1 pnpm vitest run tests/live/openai-live.test.ts`
- Browser runs can take minutes. Keep the scope narrow and validate one surface
  at a time.
- On WSL, prefer WSL Chrome first. Treat Windows Chrome from WSL as a separate
  browser profile, not a default assumption.

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

