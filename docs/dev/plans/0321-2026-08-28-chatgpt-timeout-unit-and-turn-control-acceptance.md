# ChatGPT timeout unit and turn-control acceptance | 0321-2026-08-28

State: OPEN
Lane: P14
Operational state: SOURCE_REPAIR_GREEN / INSTALL_AND_LIVE_ACCEPTANCE_PENDING
Branch: fix/plan0321-reliable-turn-control
Target: main
Integration: merge
Revision: 1 | 2026-08-28

## Stable Objective

Make the next LitScout-mediated ChatGPT research experiment use the requested
wall-clock timeout, the already integrated exact composer and terminal-output
boundaries, and a current authenticated browser/app surface without ambiguous
local retry advice or stale answer capture.

## Current State

- The prior experiment proved `--timeout 60m` became 60 seconds because
  `parseTimeoutOption` used permissive `parseFloat`, which also accepted junk
  suffixes.
- Provider-free RED reproduced the exact result (`60` instead of `3600`) and
  partial-token acceptance. Strict duration parsing is now GREEN for numeric
  seconds, `90s`, `60m`, `1h30m`, `auto`, and malformed-input rejection.
- Integrated Plans 0319 and 0320 already provide exact composer replacement,
  exact committed-turn proof, and preservation of a substantive copied answer
  over terminal interruption chrome. Their focused contracts remain GREEN.
- Wider provider-free validation passes `385/385` with one declared skip across
  the full ChatGPT adapter, composer, response, reattach, model selector,
  browser lifecycle, CLI timeout, and session terminalization surfaces.
- Typecheck, scoped zero-warning lint, production build, plan audit, diff
  hygiene, and current CodeGraph pass.
- Install, live no-effect canary, app inventory, and the LitScout experiment
  remain pending. No provider/browser/runtime mutation occurred in source work.

## Execution Graph

1. Freeze and RED-test the timeout-unit defect at the production CLI parser.
2. Implement strict full-string duration parsing and retain numeric seconds and
   `auto` compatibility.
3. Re-run composer, committed-turn, response-boundary, output-selection,
   timeout, signal-terminalization, and model-selector contracts.
4. Commit and install the exact candidate; prove source/installed parity and
   healthy API/browser ownership.
5. Inventory the live ChatGPT app/catalog and OAuth state, retaining one
   canonical LitScout app surface.
6. Run one no-write prompt canary, then return control to LitScout Plan 0463 for
   its one fresh bounded Frakktal experiment.

## Acceptance Criteria

- `TUA-R1`: `60m` parses to 3,600 seconds and malformed partial durations fail.
- `TUA-R2`: exact composer, committed-turn, response-boundary, terminal-output,
  timeout, signal-cleanup, and current model-label contracts pass provider-free.
- `TUA-R3`: source and installed runtime bytes match and the API is healthy.
- `TUA-R4`: one live no-effect canary commits exactly one prompt, returns the
  same-turn answer, and leaves no ambiguous running turn or owned browser state.
- `TUA-R5`: the live ChatGPT catalog exposes one canonical authenticated
  LitScout surface before the cross-repo experiment begins.

## Bounds

- One implementation attempt plus one evidence-driven repair.
- One install/restart attempt unless adoption evidence identifies a repairable
  mismatch.
- One no-effect ChatGPT canary; no LitScout mutation in this plan.
- No OAuth reconnect, app replacement, provider research, submission, filing,
  publication, outreach, or unrelated runtime cleanup.

## Definition Of Done

All five criteria have current source, installed, and live evidence, and the
browser is ready for LitScout Plan 0463 without timeout-unit, composer,
same-turn-output, app-identity, or remote-turn ambiguity.
