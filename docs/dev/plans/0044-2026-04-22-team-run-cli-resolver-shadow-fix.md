# Team-Run CLI Resolver Shadow Fix | 0044-2026-04-22

State: CLOSED
Lane: P01

## Scope

Fix the repo-dogfood regression where `auracall teams run` returned a planned
runtime run without draining the browser-backed team step.

## Current State

- A narrow Grok CLI dogfood run returned `runtimeRunStatus: "planned"`.
- The persisted CLI local runner registered only the active `default` AuraCall
  runtime profile, no browser profile, no service account, and
  `browserCapable: false`.
- The planned step required `runtimeProfileId = auracall-grok-auto`,
  `browserProfileId = default`, and `service = grok`.

## Root Cause

- Commander supplies the global default `browserModelStrategy = select`.
- The resolver treated that default as a transitional CLI service alias.
- The real user config uses bridge `profiles`; the alias writer always created
  target `runtimeProfiles.default`.
- Target `runtimeProfiles` is authoritative, so that partial default entry
  shadowed the bridge `profiles` family during capability projection.

## Change

- Transitional CLI service aliases now write into `runtimeProfiles` only when
  the loaded config is already using target `runtimeProfiles`.
- Bridge-shaped configs keep the alias under `profiles`, preserving the full
  browser-backed AuraCall runtime profile family.
- Added resolver coverage for bridge-shaped configs with Commander-style
  default `browserModelStrategy` plus a concrete project selector.

## Acceptance Criteria

- `auracall teams run auracall-solo ... --json` drains to a terminal state.
- CLI local runner capability projection keeps team-required browser-backed
  AuraCall runtime profiles visible for bridge-shaped configs.
- Stable live team baseline returns green after the fix.

## Validation

- `pnpm vitest run tests/schema/resolver.test.ts tests/cli/teamRunCommand.test.ts`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 pnpm tsx bin/auracall.ts teams run auracall-solo "Reply exactly with: AURACALL_DOGFOOD_DEBUG_OK" --title "AuraCall dogfood debug fixed" --prompt-append "Do not use tools. Reply with exactly AURACALL_DOGFOOD_DEBUG_OK and nothing else." --max-turns 1 --json`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 pnpm run test:live:team:baseline`
