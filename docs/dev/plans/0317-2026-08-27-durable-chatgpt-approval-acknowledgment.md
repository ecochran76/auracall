# Durable ChatGPT Approval Acknowledgment | 0317-2026-08-27

State: OPEN
Lane: P10
Operational state: PROVIDER_FREE_ACCEPTED / INSTALL_PENDING
Branch: fix/plan0317-durable-chatgpt-approval
Target: main
Integration: merge after P09 reconciliation
Revision: 1 | 2026-08-27

## Stable Objective

Keep one authenticated LitScout connector usable across a multi-call ChatGPT
turn by distinguishing durable OAuth connection state from ChatGPT's per-call
tool-consent UI, and make AuraCall acknowledge an identical-looking successor
approval card without weakening the unchanged-card one-click fence.

## Current State

- LitScout Plan 0458 authenticated successfully and completed both
  `auth_session` calls. The live OAuth server supports rotating refresh tokens,
  and the canonical database retained an unconsumed refresh credential after
  the run.
- AuraCall selected exact `Always allow`, but stopped with `ChatGPT tool
  approval surface did not disappear after selecting Always allow.` The first
  call completed and ChatGPT rendered another approval card with the same
  visible tool/action text.
- The current handler accepts disappearance or a different fingerprint and
  correctly fences a truly unchanged card. It has no DOM-instance evidence to
  distinguish an identical replacement card from the original card.
- The exact 1.4-second regression reproduced
  `chatgpt-tool-approval-not-confirmed` before the repair. The handler now
  assigns each exact mounted card a stable page-lifetime WeakMap identity;
  identical replacement and unchanged-card cases both pass.
- Provider-free acceptance passes: focused approval `16/16`, approval/config
  propagation `141/141`, browser ownership/approval `80/80`, typecheck, scoped
  zero-warning Biome, production build, plan-library validation with zero
  errors, current CodeGraph, and diff hygiene.
- P08 owns aggregate-status latency. P09 owns Project-slug Work-mode proof and
  is live-accepted/reconciliation-pending. P10 changes neither source surface.

## Authority And Bounds

- The operator requested that this durability repair be planned and executed.
- One critical-path owner and no subagents.
- Expected write set: `src/browser/actions/chatgptToolApproval.ts`, its focused
  tests, approval/testing/operator docs, P10 planning state, and one live
  acceptance receipt.
- Provider-free RED/GREEN comes first. Live acceptance uses the existing
  LitScout app, account, OAuth client, and managed browser profile; it must not
  refresh, replace, reinstall, disconnect, or reconnect the ChatGPT app.
- At most two live submissions: one primary acceptance and one
  diagnosis-backed retry only if the first failure is pre-effect and has a
  distinct remediable fingerprint. Never click `Answer now`.
- Ordinary same-client refresh-token rotation is expected bookkeeping, not an
  authentication lapse. Any `invalid_token`, `invalid_grant`, account drift,
  app-identity drift, CAPTCHA, or human-verification surface stops live work.

## Ranked Falsifiable Hypotheses

1. The clicked card is replaced by a new DOM node with identical visible text;
   stable per-node identity will make acknowledgment pass while the unchanged
   node still fails.
2. The click misses or ChatGPT leaves the original node mounted; per-node
   identity will remain unchanged and the existing failure must persist.
3. OAuth actually expires during the turn; LitScout will return an auth error
   or rotate no refresh token, independent of card identity.
4. A different managed browser profile or app registration is used; exact
   profile/app/account readback will drift before the prompt.

## Execution Graph

1. Add a fast deterministic regression for an identical-fingerprint successor
   card and prove it RED while the unchanged-card fence remains GREEN.
2. Add non-mutating, page-lifetime DOM-instance identity to the exact approval
   card and use it only for settle/acknowledgment/fencing decisions.
3. Run focused and affected provider-free tests, typecheck, scoped lint, build,
   CodeGraph, planning audits, and diff hygiene.
4. Publish the validated checkpoint, install once at a clean browser-operation
   boundary, and prove source/installed parity.
5. Run one real multi-call LitScout acceptance with `always-allow`, no app
   reconnect, and reconcile approval events, OAuth rotation, LitScout calls,
   terminal answer, browser ownership, and repository state.

## Acceptance Criteria

- `DCA-R1`: one fast agent-runnable test reproduces the identical visible
  fingerprint successor-card failure before the repair.
- `DCA-R2`: the probe returns stable identity for one mounted exact card and a
  different identity for its DOM replacement, without changing provider DOM.
- `DCA-R3`: an identical replacement acknowledges the first click and can be
  handled next; a truly unchanged card remains one-click fenced.
- `DCA-R4`: manual, ambiguous, changed-before-click, disappearance, distinct
  fingerprint, repeated legitimate approval, exact paired-label, and `Answer
  now` exclusion regressions remain green.
- `DCA-R5`: affected tests, typecheck, scoped lint, build, CodeGraph, planning
  audits, and diff hygiene pass on the committed checkpoint.
- `DCA-R6`: installed artifacts are byte-identical and one real multi-call
  LitScout turn completes without app refresh/replacement/reconnect; evidence
  separately reports OAuth authentication and ChatGPT tool consent.

## Non-Goals

- No OAuth lifetime increase, refresh-token weakening, app replacement,
  connector reconnect, or browser-profile migration.
- No generic text matching, broad approval bypass, second click on one DOM
  card, `Answer now`, or arbitrary elapsed-time acknowledgment.
- No P08 status, P09 Work-mode, scheduler, account-mirror, provider pacing,
  LitScout research-controller, or research-content change.

## Definition Of Done

- All six criteria have current source, installed, and live evidence.
- The experiment can reuse one authenticated LitScout connection across its
  tool calls, and any remaining ChatGPT consent prompts are truthfully handled
  and reported as consent rather than authentication failures.
- P10 is committed, published, reconciled, and closed with no unresolved
  browser ownership or connector mutation.
