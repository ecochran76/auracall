# Account Mirror Failure Backoff Recovery Override | 0138-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Fix the remaining live-follow recovery bug where a target can prove the correct
provider-app identity, repair a stale identity mismatch, then remain unable to
run an operator-directed recovery refresh because a later metadata timeout put
the target into `failure-backoff`.

The triggering case is `chatgpt/wsl-chrome-2` after Plan 0137:

- provider-app identity is authoritative and matches
  `consult@polymerconsultinggroup.com`;
- stale `consulting pcg pro` identity mismatch repaired;
- active history-materialization and mirror-completion queues are `0`;
- status still reports `delayed / failure-backoff` after
  `Account mirror metadata collector timed out for chatgpt/wsl-chrome-2`;
- `POST /v1/account-mirrors/refresh` can bypass `minimum-interval`, but cannot
  bypass `failure-backoff`.

## Options Considered

### Option A: Shorten all failure cooldowns

Rejected. This would improve recovery speed but also makes automatic
live-follow more aggressive after real provider failures and risks repeated
browser churn.

### Option B: Treat identity-proven metadata timeout as success

Rejected. The identity proof is valuable and must be persisted, but the mirror
refresh did not complete. Treating timeout as success would hide incomplete
metadata/materialization state.

### Option C: Add an explicit failure-backoff override

Chosen. Add a narrow, operator-directed override that bypasses
`failure-backoff` only for explicit recovery requests. The override must not
bypass provider guard/manual-clear, provider cooldown, provider hard-stop, active
queued/running operations, expected-identity-missing, or a current authoritative
provider-app identity mismatch.

This preserves background politeness while giving operators a deterministic way
to rerun after a known timeout once the safety gates are clear.

## Scope

- Add an account-mirror politeness input flag for failure-backoff override.
- Thread the flag through status registry, refresh service, HTTP refresh route,
  and operator/status readback where needed.
- Keep `ignoreMinimumInterval` separate from the new failure-backoff override.
- Ensure automatic scheduler/live-follow refresh does not bypass failure
  backoff by default.
- Preserve hard-stop behavior for current provider-app identity mismatch and
  provider guard/manual-clear pages.
- Validate against `chatgpt/wsl-chrome-2` with an installed runtime rerun.

## Non-Goals

- Do not weaken provider manual-clear/captcha/hard-stop behavior.
- Do not make background live-follow retry loops more aggressive.
- Do not mark metadata timeout as a successful mirror refresh.
- Do not hand-edit user-scoped cache files as the product fix.
- Do not alter handoff target mutation behavior.

## Acceptance

- Unit tests prove `ignoreFailureBackoff` lets an explicit account-mirror
  refresh proceed through `failure-backoff`.
- Unit tests prove the override does not bypass current authoritative
  provider-app identity mismatch.
- Unit tests prove the override does not bypass provider manual-clear or
  provider hard-stop/cooldown gates.
- HTTP tests prove `/v1/account-mirrors/refresh` accepts both camelCase and
  snake_case failure-backoff override fields and passes them to the refresh
  service.
- Status/readback tests prove operators can request a recovery-eligible view
  without making default status hide ordinary backoff.
- Installed live proof on `chatgpt/wsl-chrome-2` shows an explicit recovery
  refresh can start despite prior `failure-backoff`, while identity evidence
  remains provider-app authoritative for
  `consult@polymerconsultinggroup.com`.
- Active account-mirror/materialization jobs are not leaked after the rerun.

## Validation Plan

- `pnpm vitest run tests/accountMirror/politePolicy.test.ts`
- `pnpm vitest run tests/accountMirror/statusRegistry.test.ts`
- `pnpm vitest run tests/accountMirror/refreshService.test.ts`
- focused HTTP refresh route tests
- focused CLI/API status tests if CLI readback changes
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on changed files
- `pnpm run build`
- `pnpm run plans:audit -- --keep 138`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- live `POST /v1/account-mirrors/refresh` with
  `ignoreFailureBackoff=true`
- `auracall api status --json --timeout-ms 30000`
- active materialization/completion queue readbacks

## Definition Of Done

Plan 0138 closes when account-mirror failure backoff remains the default for
automatic live-follow, but an explicit operator recovery request can bypass
failure backoff after safety gates are clear, prove current provider-app
identity, and leave no active job leaks.

## Closeout

Closed on 2026-06-07.

- Added `ignoreFailureBackoff` as a separate account-mirror recovery override.
- The override is honored only for explicit refresh requests and only at the
  `failure-backoff` gate.
- `ignoreMinimumInterval` remains scoped to minimum-interval behavior.
- Provider guard/manual-clear, provider cooldown/hard-stop, active
  queued/running work, missing expected identity, and current authoritative
  provider-app identity mismatch remain higher-priority gates.
- `/v1/account-mirrors/status` accepts `ignoreFailureBackoff` and
  `ignore_failure_backoff` for recovery-preview readback.
- `/v1/account-mirrors/refresh` accepts `ignoreFailureBackoff` and
  `ignore_failure_backoff` for operator-directed recovery refreshes.

Validation:

- `pnpm vitest run tests/accountMirror/politePolicy.test.ts
  tests/accountMirror/statusRegistry.test.ts
  tests/accountMirror/refreshService.test.ts`
- `pnpm vitest run tests/http.responsesServer.test.ts -t "failure-backoff
  recovery overrides|read-only account mirror status"`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on changed source/test files
- `pnpm run build`
- `pnpm run plans:audit -- --keep 138`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`

Installed live proof on `chatgpt/wsl-chrome-2`:

- default status remains `delayed / failure-backoff`;
- recovery status with `ignore_failure_backoff=true` and
  `ignore_minimum_interval=true` reports `eligible`;
- explicit recovery refresh with `ignoreFailureBackoff=true` was not rejected
  as `account_mirror_not_eligible` and entered provider collection;
- the provider-app identity evidence remained authoritative for
  `consult@polymerconsultinggroup.com`;
- the collector still timed out during metadata collection, so this plan does
  not claim to fix the slow metadata read itself;
- retained mirror counts remained
  `projects=6`, `conversations=68`, `artifacts=64`, `files=73`, `media=0`;
- active history-materialization jobs returned `0`;
- active mirror-completion operations returned `0` after cancelling stale
  idle-waiting completion
  `acctmirror_completion_016bd031-8c80-46dc-9a05-e4d03266ccff`.
