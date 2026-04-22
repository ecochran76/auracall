# Plan 0039 | Raw DevTools Dispatcher Fencing

State: CLOSED
Lane: P01

Closed: 2026-04-21

## Scope

- close the normal `browser-tools --port` dispatcher bypass
- keep the change inside the browser-service operation dispatcher and
  `browser-tools` command surface
- document remaining legacy raw-CDP scripts as unsafe/debug-only follow-up

## Current State

- managed browser profile operations already route through the profile-scoped
  browser operation dispatcher
- `browser-tools --auracall-profile <name> --browser-target <target>` already
  acquires dispatcher ownership
- explicit `browser-tools --port <port>` skipped the managed browser profile
  dispatcher because it targeted a chosen DevTools endpoint directly
- hidden Gemini `google.com/sorry` tabs showed that browser-service needs
  stronger ownership over the whole DevTools browser instance, not just the
  selected tab or resolved managed profile

## Acceptance Criteria

- the operation dispatcher can build and lock a raw DevTools endpoint key
- `browser-tools --port <port>` acquires a port-scoped operation lock before
  resolving or connecting to the endpoint
- an active raw DevTools lock blocks another conflicting browser-tools command
  for the same endpoint
- managed-profile browser-tools commands continue to prefer the managed browser
  profile dispatcher key when the selected AuraCall runtime profile and browser
  target are known
- docs record that legacy direct-CDP verification scripts remain unsafe debug
  paths until routed or fenced separately

## Outcome

- `buildBrowserOperationKey(...)` now supports raw DevTools endpoint keys such
  as `devtools:127.0.0.1:45013`.
- Browser operation records now preserve optional `rawDevTools` endpoint
  metadata.
- `browser-tools` now acquires a dispatcher lock for explicit `--port` commands
  when an operation lock root is configured.
- The AuraCall browser-tools wrapper still uses the managed browser profile key
  when `--auracall-profile` or `--browser-target` gives enough context, and
  falls back to a raw endpoint key for plain port-only diagnostics.
- Remaining direct-CDP scripts under `scripts/` were not rewritten in this
  slice; follow-up Plan 0040 fences them behind an explicit raw-CDP guard while
  preserving development escape hatches.

## Validation

- `pnpm vitest run tests/browser-service/operationDispatcher.test.ts tests/browser/browserTools.test.ts`
- `pnpm run check`

## Definition Of Done

- code, tests, and docs align on raw DevTools endpoint dispatcher ownership
- roadmap/runbook/journal/fixes-log record the behavior change
- no runtime scheduler, provider adapter, or new public HTTP surface is added
