# Browser-Service Reattach + Registry Reliability Plan

## Goal

Make browser attach, doctor, and session reattach deterministic across browser
profiles by classifying stale registry entries explicitly instead of treating all
failures as one generic "not alive" state.

This plan targets the shared browser-service substrate first. Provider adapters
should benefit from cleaner liveness signals, safer stale-entry pruning, and
better attach diagnostics without adding more provider-local heuristics.

## Problem

Current registry and attach behavior still compresses several real failure modes
into a boolean:

- the recorded browser process is gone
- the recorded DevTools port is no longer responsive
- a different browser process now owns the recorded profile path
- session metadata exists but the exact prior target no longer exists
- multiple attach candidates are visible but only weakly match

That leaves doctor output noisy and reattach behavior harder to reason about,
especially when multiple browser profiles are active at once.

## Scope

### In scope

- registry liveness classification in browser-service
- stale-entry pruning using explicit liveness reasons
- doctor/reporting that shows why an entry is stale
- stronger attach/reattach diagnostics around matched vs discarded candidates
- bounded rediscovery inside the intended browser profile boundary

### Out of scope

- provider-specific DOM recovery
- login/auth automation changes
- broad session UX redesign
- automatic ambiguity resolution across browser profiles

## Failure classes

The shared browser-service layer should distinguish at least:

- `live`
- `dead-process`
- `dead-port`
- `profile-mismatch`
- later slices may add:
  - `target-missing`
- now also classified in reattach flows:
  - `ambiguous`

## Implementation slices

### Slice 1 — Registry liveness classification

Goal:
- replace boolean "alive" probing with explicit browser-service liveness
  reasons

Deliverables:
- package-owned liveness classifier
- package-owned classified instance listing
- doctor surfaces liveness reason and actual discovered pid
- stale-entry warnings summarize stale kinds, not just counts

Acceptance:
- focused package registry tests green
- focused doctor tests green
- `pnpm run check` green

### Slice 2 — Safer stale-entry pruning

Goal:
- keep auto-pruning confident and profile-safe

Deliverables:
- prune only clearly stale registry entries
- record the liveness reason used for pruning in diagnostics/log output
- leave ambiguous candidates intact for operator inspection

Acceptance:
- dead-process / dead-port / profile-mismatch cases prune cleanly
- no false pruning when the browser profile is merely ambiguous

### Slice 3 — Attach target tightening

Goal:
- prefer exact browser-profile matches over generic host/url-family matches

Deliverables:
- stronger attach matching on:
  - managed browser profile dir
  - source browser profile name
  - service target
  - configured/custom URL family
- richer resolution diagnostics for winning and losing candidates

Acceptance:
- focused browser-service / Aura-Call attach tests green
- live default + `wsl-chrome-2` smoke green

### Slice 4 — Reattach reliability

Goal:
- keep session reattach inside the intended browser profile boundary

Deliverables:
- if the prior target is gone, do one bounded rediscovery in the same browser
  profile
- fail clearly on `target-missing` / `ambiguous`
- do not silently hop to another compatible-looking browser

Acceptance:
- reattach tests cover target gone vs wrong-profile vs successful rediscovery
- live reattach smoke green

## Code seams

Primary files:

- `packages/browser-service/src/service/stateRegistry.ts`
- `packages/browser-service/src/processCheck.ts`
- `src/browser/profileDoctor.ts`
- `src/browser/service/browserService.ts`
- `src/cli/sessionDisplay.ts`
- `src/browser/reattach.ts`

## Regression set

- `pnpm vitest run tests/browser-service/stateRegistry.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserService.test.ts --maxWorkers 1`
- plus any touched reattach/session tests
- `pnpm run check`

## Live smoke

- default browser profile attach/doctor
- `wsl-chrome-2` attach/doctor
- one stale-entry pruning scenario
- one reattach scenario from session metadata

## Definition of done

This track is complete enough when:

- dead browser-state entries are classified and surfaced explicitly
- doctor can explain why an entry is stale
- attach/reattach stays within the selected browser profile boundary
- ambiguity is surfaced clearly instead of silently drift-resolved
- focused tests and live smokes are green
