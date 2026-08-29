# ChatGPT timeout unit and turn-control acceptance | 0321-2026-08-28

State: CLOSED
Lane: P14
Operational state: ACCEPTED / INTEGRATED
Branch: fix/plan0321-reliable-turn-control
Target: main
Integration: merge
Revision: 4 | 2026-08-29

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
- The exact candidate is installed in the user runtime. The installed CLI and
  production CLI entrypoint match the built source bytes, API PID `9496` is
  healthy with zero service restarts, and installed `auracall --version`
  reports `0.1.1`.
- The current `wsl-chrome-3` ChatGPT surface is authenticated with Developer
  mode enabled and exposes exactly one enabled, active, private, user-scoped
  LitScout app.
- One normal-Chat, current-model, manual-approval canary committed exactly one
  prompt with `--timeout 60m`, returned exactly
  `AURACALL_TIMEOUT_TURN_OK` in 14.8 seconds, and reported zero retries.
- The exact Chrome PID launched for inventory/canary reuse was terminated after
  the run; port `45015` closed, the managed browser readback became idle, and no
  scheduler or materialization control action ran. The separately pre-existing
  scheduler remained under its own cadence.
- The LitScout experiment remains outside this plan and returns to LitScout
  Plan 0463 under that plan's authority and gates.
- The accepted branch merged non-forced to `main` at integration receipt
  `1659bdbb2f0c54459e728f420a82eddfb06d6126`.
- Follow-up ownership proof established that the separate `default` browser
  blocking worktree cleanup was inactive and not serving LitScout. With exact
  operator authority it was terminated, after which P14's clean worktree plus
  local and remote topic branches were removed.

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
