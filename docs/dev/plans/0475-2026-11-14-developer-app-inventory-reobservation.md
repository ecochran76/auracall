# P475 | Developer-app inventory re-observation

State: CLOSED
Lane: P475
Branch: fix/developer-app-nested-desktop-scope
Target: main
Issue: https://github.com/ecochran76/auracall/issues/538

## Current State

Public adapter regression reproduces the second inventory blocking its own
independent identity transport while its first inventory client retains continuous
display custody. The minimal repair closes that prior client before fresh identity.
Clean re-observation and unknown-close custody checks pass. Affected local tests,
typecheck, scoped lint and compiled CLI build pass; installed runtime is unchanged.

## Scope

One owner, serialized source repair in an isolated worktree based on c9d182957.
Change the developer-app adapter, its existing real-admission fixture and focused
docs. The seam uses the public adapter, real ChatGPT identity service, configured
backend authority, guarded CDP and sandbox display gate; external Chrome is mocked.

## Non-goals

No gate weakening, same-PID ownership inference, lock removal, browser/profile reset,
service upgrade, provider mutation, OAuth consent or native-client acceptance.
No unrelated refactoring or second broad review.

## Acceptance / Definition of Done

Repeated inventory finishes without reacquiring its own retained display. Unknown
prior transport cleanup stops before another identity client opens and retains
custody. Preserve foreign/human/generation guards. Record red/green, affected tests,
typecheck, build and scoped lint. Commit/publish a reviewable source checkpoint;
installation and actual native acceptance remain separate gates.

## Evidence

Initial regression: 1 failed in 8.04s total / 1.43s test; second read rejected with
bounded retained-display cancellation. Minimal repair: 1 passed in 8.47s / 610ms.
Cleanup variant first exposed existing aggregate error wording; corrected assertion
retains that original failure and now 2 passed in 9.08s / 764ms. No retries erased.
Local commands use Vitest with one worker; no hosted CI or live provider checks.

## Source closeout

146/146 affected tests pass across backendRequestAdmission, CLI commands and app
attachment admission (92.19s total). `pnpm typecheck`, scoped Biome lint,
`pnpm exec tsc -p tsconfig.build.json`, `pnpm run build:vendor`, candidate CLI
`--version`, and `git diff --check` pass. Compile-only CLI startup first failed for
missing bundled config; the normal build:vendor step supplies it without a source
change. The full UI build and comprehensive repository suite were not run for this
adapter-only repair. Plan audit reports the existing68findings, none in this plan.
No hosted CI, broad review, merge or installed runtime change.

The candidate may be invoked explicitly from this worktree under separate bounded
native-install authority. Its source/build proof does not qualify OAuth, actual
client tools or the independent private credential receiving boundary.
