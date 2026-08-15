# Browser Context Liveness And LitScout Approval Proof | 0288-2026-08-15

State: OPEN
Disposition: REPAIR AND LIVE PROOF AUTHORIZED
Lane: P01

## Stable Objective

Remove the proven pre-submit cache-context stall and obtain current live proof
that AuraCall selects exact `Allow once` for one read-only LitScout call without
clicking `Always allow` or `Answer now`.

## Current State

- Plan 0286 implemented the exact approval policy provider-free at `4ce634c5`.
- Plan 0287's sole live command timed out before `runBrowserMode()`, prompt
  submission, approval detection, or connector use. Cleanup and every excluded
  effect passed; receipt commit `4e8f067d` is pushed.
- Source now routes optional browser-context cache metadata through
  `resolveNonInteractiveBrowserContextIdentity()`, which disables provider
  identity detection and skips provider feature-signature detection.
- The red regression first failed because the seam did not exist. It now
  resolves configured identity in 5 ms while deliberately never-settling live
  probes remain uncalled. The affected eight-file gate passes 123 tests and
  typecheck passes.
- The actual browser run independently retains its provider identity gate.
  Production build, lint, final diff/planning audits, commit, and live proof
  remain.

## Execution Contract

1. Add one small browser-context identity module whose interface returns
   configured/cache identity only, explicitly disabling provider identity and
   feature-signature detection.
2. Prove red-to-green that never-settling provider probes cannot delay this
   non-interactive browser-context resolution.
3. Route `buildBrowserContext()` through that module while preserving null
   fallback and the actual browser-run identity preflight.
4. Run focused/affected tests, typecheck, build, lint, CodeGraph, planning
   audit, and diff hygiene; commit and push before browser access.
5. Run one bounded source-direct LitScout canary at a time on AuraCall runtime
   profile `wsl-chrome-3`, managed browser profile
   `~/.auracall/browser-profiles/wsl-chrome-3/chatgpt`, Chat/current model,
   selected app `Corel33t`, and exact `allow-once`.
6. Each live attempt may submit at most one prompt and call only read-only
   LitScout `auth_session`. A distinct provider-free diagnosis/repair/green
   commit is required before another attempt.
7. Close only after exact approval logging, disappearance confirmation,
   expected token, cleanup, and excluded-effect evidence all pass, or after the
   bounded attempts reach a terminal failed-safe outcome.

## Non-Goals And Hard Stops

- No install, service restart, scheduler/completion/materialization control,
  app/OAuth mutation, generic search/browse, LitScout research/action/canonical
  write, `always-allow`, or `Answer now`.
- Stop the active attempt on CAPTCHA/human verification, account mismatch,
  unknown ownership, unexpected tool, ambiguous approval, unconfirmed click,
  prompt-submission uncertainty, or any material mutation outside the packet.
- Do not repeat an identical failed live attempt. Every successor attempt must
  follow a source-grounded provider-free correction and pushed green checkpoint.

## Acceptance Criteria

- [x] A red regression proves never-settling live identity/feature probes do not
  participate in non-interactive browser-context metadata resolution.
- [x] The prompt startup path reaches `runBrowserMode()` without pre-run live
  provider enrichment and retains its actual provider identity gate.
- [ ] Provider-free validation and source/remote readback pass before live work.
- [ ] One current LitScout turn submits once, logs exact `Allow once`, confirms
  disappearance, invokes only `auth_session`, and returns exact token
  `LITSCOUT_ALLOW_ONCE_OK`.
- [ ] No attempt clicks `Always allow` or `Answer now`; excluded effects remain
  zero and exact cleanup passes.
- [ ] Durable receipts, plan/roadmap/runbook/journal, audits, commits, and origin
  agree with the terminal outcome.

## Effect Budget

- `max_live_canary_attempts: 3`
- `max_prompt_submissions: 3`
- `max_litscout_connector_calls: 3`
- `max_tool_approval_clicks: 3`
- `approval_policy: allow-once`
- `max_identical_live_retries: 0`
- `max_installs: 0`
- `max_service_restarts: 0`
- `max_scheduler_or_completion_controls: 0`
- `max_litscout_canonical_writes: 0`

## Definition Of Done

Completion requires current live evidence for the exact operator preference,
not merely green source tests. A failed attempt may drive another bounded
provider-free repair within this plan, but acceptance remains false until one
turn proves exact `Allow once`, the expected LitScout token, and cleanup.
