# Partial Materialization Live-Follow Continuation | 0293-2026-08-20

State: CLOSED
Lane: P01

## Stable Objective

Keep `chatgpt/wsl-chrome-3` live follow resumable when a completion-owned
history-materialization job contains verified materializations alongside one
or more retryable transfer failures, while preserving terminal blocking for
catastrophic and all-failed outcomes.

## Current State

- Durable history-materialization jobs intentionally use `failed` when any
  real selected transfer fails, even when another selected asset materializes.
- Completion readback preserves both the durable job status and exact
  `materialized` / `failed` counts.
- The completion runner now distinguishes a mixed failed job from an
  all-failed or result-less job by its verified materialization count.
- Installed live readback shows a mixed failed job preserving its receipt,
  observing the post-materialization quiet window, and continuing on the same
  completion instead of blocking for scheduler recreation.

## Selected Design

- Keep history-materialization result and durable job classification unchanged.
- At the completion module's existing interface, block a failed job only when
  it contains zero verified materializations.
- Let a mixed failed job with positive materialization evidence use the same
  settled quiet-window continuation already used by successful and skipped
  live-follow materialization.
- Preserve a missing result as zero materializations so catastrophic failures
  continue to block fail-closed.

## TDD And Validation

1. Add one public completion-interface regression for a failed job with two
   materialized assets and one failed transfer; confirm `blocked` RED.
2. Add the minimum completion-consumer gate; confirm `idle_waiting` GREEN and
   keep the existing all-failed regression GREEN.
3. Run completion, history-materialization, scheduler, live-follow, HTTP, CLI,
   MCP, typecheck, build, scoped lint, CodeGraph, plan audit, and diff hygiene.
4. Install the validated user runtime and observe one current live-follow
   partial-success terminal continue through its quiet window without blocking.

## Non-Goals

- No change to history-materialization job status or result classification.
- No scheduler, HTTP, MCP, CLI, or configuration interface change.
- No provider retry-policy, interaction-budget, or identity change.
- No agent-browser inspection or modification.

## Acceptance Criteria

- [x] A failed completion-owned job with positive materialization evidence does
  not block live follow.
- [x] An all-failed or result-less failed job remains terminally blocked.
- [x] The existing post-materialization quiet window controls the next pass.
- [x] Affected provider-free validation and static gates pass.
- [x] Installed runtime readback proves current live continuation behavior.

## Validation Evidence

- The exact mixed-result regression was RED before the repair and GREEN with
  the existing all-failed regression after it. The affected completion,
  live-follow, scheduler, history-materialization, MCP, HTTP, and CLI packets
  passed 412 tests across 9 files.
- The complete Vitest run passed 323 files and 2,927 tests, with 21 files and
  65 opt-in/live tests skipped. Typecheck, production build, six live-follow
  fixture smokes, scoped zero-warning Biome lint, and diff hygiene passed.
- CodeGraph was current at 906 files and read back the narrowed completion
  predicate plus the existing quiet-window continuation. The plan audit passed
  293 plans with zero validation errors before final closeout.
- The validated checkout was installed into the user runtime and
  `auracall-api.service` restarted as PID 87339. Completion
  `acctmirror_completion_431a3b29-71aa-4c45-8eb2-c8458ec96a73` observed
  history job `hmj_2b78e011f28343a59f9c6f0860f9bd53` terminate `failed` with
  one verified materialization and three failures. It remained the same
  nonterminal completion with `error: null`, waited until 12:26:20 CDT, and
  returned to `running` with fresh `detail-inventory:started` progress at
  12:26:25 CDT.
- Provider-session proof matched the configured ChatGPT identity on the
  `wsl-chrome-3` browser profile and exact managed browser profile path. No
  agent-browser inspection or modification occurred in this repair slice.

## Definition Of Done

Partial success no longer terminates the live-follow completion, all-failed
behavior remains fail-closed, the installed runtime exhibits the repaired
behavior, documentation agrees, and Plan 0293 is closed with current evidence.
