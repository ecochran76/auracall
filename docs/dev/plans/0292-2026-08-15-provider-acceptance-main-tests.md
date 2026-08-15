# Provider Acceptance Main Tests | 0292-2026-08-15

State: CLOSED
Lane: P01
Successor to: `0291-2026-08-15-architecture-deepening-campaign.md`

## Stable Objective

Close Plan 0291's retained Medium test gap by dynamically exercising the
ChatGPT and Grok acceptance-run main interfaces without invoking a live
browser or provider.

## Current State

- Four provider-main tests dynamically cover ChatGPT CLI-over-resume
  precedence, initial/final failure checkpoints, PASS/FAIL presentation,
  full-run best-effort cleanup, and Grok PASS/FAIL/keep-projects/project
  cleanup behavior.
- Importing either acceptance script is side-effect free; direct CLI execution
  remains guarded by exact script-path identity and both `--help` surfaces are
  unchanged.
- The shared harness remains unchanged and provider workflow implementation
  remains in the provider scripts.
- The shared `browserAcceptanceHarness` already owns process, deadline,
  output, JSON, optional state, and final-evidence mechanics.
- Provider phases, assertions, retries, guards, cleanup decisions, and CLI
  presentation remain local to the ChatGPT and Grok acceptance scripts.
- Existing tests cover the shared harness and static provider locality, but do
  not execute provider-main PASS, FAIL, cleanup, or ChatGPT CLI-over-resume
  behavior.

## Selected Design

- Add one provider-local main interface to each acceptance script.
- Keep the production provider workflow inside its existing script.
- Admit a narrow test adapter at each provider-local seam so provider-free
  tests can replace only the expensive provider execution while exercising
  real argument resolution, state/evidence handling, result presentation, and
  cleanup policy.
- Keep the shared harness unchanged; do not introduce a shared workflow engine
  or move provider phase policy across its seam.

## TDD And Validation

1. Add red tests for ChatGPT CLI-over-resume precedence, PASS, FAIL, checkpoint
   ordering, and full-run best-effort cleanup.
2. Add red tests for Grok PASS, FAIL, keep-projects, project cleanup, and final
   evidence presentation.
3. Implement the minimum provider-local main interfaces and make the tests
   green.
4. Run the focused script packet, both safe `--help` smokes, typecheck, build,
   scoped zero-warning lint, CodeGraph readback, plan audit, and diff hygiene.

## Non-Goals

- No live acceptance, browser, provider, install, restart, scheduler, or
  completion action.
- No operator-facing CLI option or state-contract change.
- No shared provider workflow/state-machine layer.
- No broad acceptance-script formatting rewrite.

## Acceptance Criteria

- [x] ChatGPT provider-main tests dynamically prove explicit CLI values win
  over resume defaults.
- [x] ChatGPT provider-main tests dynamically prove PASS, FAIL, final
  checkpoint/evidence ordering, and full-run cleanup.
- [x] Grok provider-main tests dynamically prove PASS, FAIL, keep-projects,
  cleanup, and final evidence presentation.
- [x] Importing either provider script does not auto-run a live acceptance
  workflow.
- [x] Focused and affected provider-free validation, CodeGraph, docs, plan
  audit, diff hygiene, commit history, and origin agree.

## Validation Evidence

- Focused provider-main tracer: 4/4 passed.
- Shared harness, structure, and provider-main packet: 11/11 passed.
- `pnpm run typecheck`, `pnpm build`, scoped Biome lint, both safe help
  smokes, CodeGraph readback, plan audit, and diff hygiene passed.
- CodeGraph indexed 906 files and found each provider-main definition plus its
  test caller.
- No authorized live acceptance ran. The initial red import tracer exposed the
  preexisting auto-execution defect: ChatGPT stopped at provider-session
  authorization before mutation, Grok entered its first create command and
  failed, no test-owned process remained, and an exact local-state search found
  neither generated project name. No further provider command was issued.

## Definition Of Done

The retained Medium in Plan 0291's audit note is marked resolved with current
dynamic evidence, Plan 0292 is closed, and no live effect has occurred.
