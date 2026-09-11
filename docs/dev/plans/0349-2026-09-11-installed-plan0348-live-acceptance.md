# Installed Plan 0348 Live Acceptance | 0349-2026-09-11

State: CLOSED
Lane: P42
Operational state: INTEGRATED_TERMINAL_EVIDENCE_FAILURE
Branch: ops/plan0349-installed-plan0348-live-acceptance
Target: main
Integration: merge
Revision: 2 | 2026-09-11

## Stable Objective

Install exact published Plan 0348 bytes and complete one serialized live pass
proving compact `6Pro` terminal selection plus genuine PDF materialization from
the recovered Deep Research conversation.

## Current State

- Published `main` is clean and equal to origin at `f1d24156a`; P41 is
  provider-free accepted and integrated.
- P40's one prompt stopped before Send and consumed no artifact fetch. P41 then
  reproduced the current `6Pro` row with `aria-expanded="false"` and repaired
  its false submenu classification.
- Last fresh runtime custody recorded six paused and zero queued/running/idle-
  waiting completions, service PID `96978`, and managed Chrome PID `71128` on
  `45015`. Refresh all of these before effects.
- One install passed 523-file source/installed parity at normalized SHA-256
  `569ad132...`; service PID `51128` is active/running with zero restarts.
- The only identity operation was piped into `jq`. AuraCall's force-exit boundary
  truncated the piped JSON, leaving the identity evidence unparseable and the
  consumer at exit 5. The lane fails closed without a retry.
- Prompt and artifact budgets remained unspent: zero prompt attempts, Sends,
  artifact fetches, retries, conversation mutations, or runtime controls.
  Receipt: `docs/dev/notes/2026-09-11-plan0349-installed-live-acceptance.json`.
- Exact published topic `f46b17122` merged into `main` at `ec538abd5` without
  additional runtime or provider effects.

## Execution Graph

1. Publish this plan and P42 registration before effects; re-run affected
   provider-free validation and exact Git/runtime preflight.
2. Perform one supported install and verify full source/installed `dist` parity,
   metadata, service state, and one no-prompt identity smoke.
3. Run one explicit `chatgpt:premium` Chat prompt using selection strategy,
   at most one Send, no thinking-time selection, no fallback, and no retry.
4. On prompt success only, run one read-only artifact fetch for conversation
   `6aa368bc-43c4-83ea-8d98-964264dd4340`; inspect the manifest and actual bytes.
5. Persist a redacted receipt, re-read final custody, integrate accepted or
   terminal evidence, and close eligible local Git custody.

## Acceptance Criteria

- `ILA2-R1`: one supported install yields identical 523-file source/installed
  inventories and normalized hashes; service and one identity smoke are green.
- `ILA2-R2`: one prompt requests `chatgpt:premium`, desires `6 Pro`, records raw
  observed compact `6Pro`, issues at most one Send, and returns exactly
  `AURACALL_P42_6PRO_OK_20260911` with no retry or fallback.
- `ILA2-R3`: one artifact fetch independently materializes Markdown, DOCX, and
  PDF. PDF name/extension/MIME/signature are genuine and its hash differs from
  DOCX; retained or wrong variants cannot count.
- `ILA2-R4`: final narrow runtime custody is stable and no recovered-
  conversation mutation or scheduler/completion/materialization control runs.
- `ILA2-R5`: receipt, plan, lane, roadmap, runbook, journal, Git, and published
  main agree. Live acceptance closes the end-to-end goal.

## Bounds And Hard Stops

- Exactly one install, identity smoke, prompt attempt with at most one Send,
  and—only after prompt success—one artifact fetch. No retry, resend, current
  fallback, alternate profile, second conversation, or extra canary.
- Never click `Answer now`. Stop on CAPTCHA/human verification, identity or
  browser-owner ambiguity, active completion, or post-effect uncertainty.
- Recovered conversation access is read-only. Never mutate, retry, regenerate,
  continue, rename, delete, or delete/overwrite retained artifacts.
- No broad status, developer-app response, Skill execution, scheduler,
  completion, live-follow, background-drain, or materialization controls.

## Definition Of Done

ILA2-R1 through ILA2-R5 are live accepted and integrated, or exact terminal
evidence is integrated and the goal continues through a bounded repair.
