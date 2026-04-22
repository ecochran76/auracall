# Plan 0040 | Direct CDP Script Guard

State: CLOSED
Lane: P01

Closed: 2026-04-22

## Scope

- fence legacy direct-CDP scripts under `scripts/`
- preserve explicit debugging escape hatches for operators
- keep normal browser access routed through browser-service tooling

## Current State

- managed browser profile operations route through the browser operation
  dispatcher
- `browser-tools --port <port>` now acquires a raw endpoint dispatcher key
- several legacy verification/debug scripts still connect with
  `chrome-remote-interface` or `puppeteer.connect(...)` directly
- those scripts are useful for development, but they should not be a silent
  browser-service bypass

## Acceptance Criteria

- legacy direct-CDP scripts require an explicit opt-in before connecting
- operators can still run the scripts with a concise flag or environment
  variable
- the opt-in flag is consumed before script-specific positional argument
  parsing
- tests cover the escape hatch and the default refusal message
- docs record the intended normal path and the raw-CDP escape hatch

## Outcome

- Added `scripts/raw-devtools-guard.ts`.
- Guarded all `scripts/` TypeScript files that directly import
  `chrome-remote-interface` or call `puppeteer.connect(...)`.
- Escape hatches:
  - pass `--allow-raw-cdp`
  - or set `AURACALL_ALLOW_RAW_CDP=1`
- The flag is removed from `process.argv` before the script reads positional
  arguments, so existing debug-script calling conventions remain stable.
- Browser-service-owned tooling remains the preferred path:
  `pnpm tsx scripts/browser-tools.ts --port <port> ...`

## Validation

- `pnpm vitest run tests/scripts/rawDevtoolsGuard.test.ts`
- `pnpm run check`
- raw script refusal smoke:
  `pnpm tsx scripts/test-remote-chrome.ts 127.0.0.1 1`
- source scan confirmed no direct-CDP TypeScript script under `scripts/` lacks
  the guard import
- `pnpm run plans:audit -- --keep 40`
- `git diff --check`

## Definition Of Done

- direct-CDP scripts are guarded by default
- escape hatches are documented and tested
- roadmap/runbook/journal/fixes-log record the behavior change
