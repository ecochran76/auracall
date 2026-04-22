# Plan 0041 | Browser-Service Script Family

State: CLOSED
Lane: P01

Closed: 2026-04-22

## Scope

- group browser-service-related development scripts under a discoverable
  browser-service family directory
- avoid breaking existing root `scripts/<name>.ts` entrypoints
- avoid moving AuraCall/Grok-specific helper scripts into
  `packages/browser-service` while they still import app/provider code

## Current State

- browser-service-owned generic tooling already lives in
  `packages/browser-service/src/browserTools.ts`
- the root `scripts/browser-tools.ts` file is a thin AuraCall compatibility
  wrapper
- many legacy debugging scripts are browser-service-related but still import
  AuraCall provider modules such as `src/browser/providers/grokAdapter.ts`
- moving those scripts into the package would blur package boundaries and
  break existing doc and shell references

## Acceptance Criteria

- browser-service-related script entrypoints are discoverable under
  `scripts/browser-service/`
- existing root script paths continue to work
- wrapper/copy files do not duplicate script logic
- direct-CDP escape hatches continue to work through the wrapper paths
- docs state that new references should prefer the browser-service family path

## Outcome

- Added `scripts/browser-service/` with thin wrapper copies for:
  - generic browser tools and launch/test helpers
  - Grok/browser verification helpers
  - guarded legacy direct-CDP helpers
- Kept historical root script paths intact for compatibility.
- Added `scripts/browser-service/README.md` documenting why these are wrappers
  instead of package moves.
- Added wrapper-shape tests so the family directory stays a routing surface and
  does not drift into duplicated implementation logic.
- Updated package browser smoke scripts to use the browser-service family path;
  the Grok DOM smoke sets `AURACALL_ALLOW_RAW_CDP=1` because it is explicitly a
  legacy direct-CDP smoke.

## Validation

- `pnpm vitest run tests/scripts/browserServiceWrappers.test.ts tests/scripts/rawDevtoolsGuard.test.ts`
- `pnpm run check`
- wrapper raw-CDP refusal smoke:
  `pnpm tsx scripts/browser-service/test-remote-chrome.ts 127.0.0.1 1`
- `pnpm run plans:audit -- --keep 41`
- `git diff --check`

## Definition Of Done

- browser-service script family wrappers exist and are tested
- root script compatibility remains intact
- roadmap/runbook/journal/fixes-log record the new script-family posture
