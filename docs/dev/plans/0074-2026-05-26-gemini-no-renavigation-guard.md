# Gemini No-Renavigation And Guard-First Live Follow

State: CLOSED
Date: 2026-05-26
Lane: P01
Parent Plan: `docs/dev/plans/0073-2026-05-25-live-follow-artifact-inventory-proof-controls.md`

## Context

Plan 0073 implemented the scoped proof and artifact-inventory evidence needed
for Gemini live-follow proof, but the installed Gemini proof is blocked by
Google unusual-traffic interstitials in the dedicated managed browser profile.
Before that proof resumes, the Gemini browser path needs one narrower hardening
slice: routine live follow should not create avoidable navigation churn, and
provider guard state should be detected before a refresh pass starts.

The code audit found no intentional Gemini `Page.reload` or
`location.reload` path in the provider adapter. The risk is repeated navigation
from target attach and route-settle helpers:

- `connectToGeminiTab()` can reuse a same-origin Gemini target through the
  browser-service target opener, which can focus the target with navigation.
- Callers then immediately call a Gemini surface helper such as the Gem manager
  or Gem edit navigation helper, and those helpers always call
  `Page.navigate`.
- `/app` conversation surface reuse already has a current-route readiness
  check, but `/gems/view` and `/gems/edit/<projectId>` do not.
- Some Gem edit callers intentionally use navigation as a fresh-read or
  post-write verification boundary, so same-route skips must be scoped to ready
  read-only paths or carry an explicit fresh-navigation override.
- Direct `/app/<conversationId>` validation remains useful for operator
  diagnostics, but routine live follow should not bounce through direct
  conversation URLs when rail discovery or rail click can answer first.

That audit explains a plausible anti-bot trigger pattern even without reloads:
attach-time same-origin re-targeting plus immediate surface navigation can make
the managed browser look more synthetic than necessary.

## Current State

Available now:

- The Gemini tenant runs through `auracall-gemini-pro`, browser profile
  `gemini-stealthcdp`, and managed browser profile
  `~/.auracall/browser-profiles/gemini-stealthcdp/gemini`.
- Plan 0070 already closed the no-refresh rail rule for Gemini conversation
  context and artifact materialization: rail-backed reads should use `/app` or
  the relevant Gem/project surface and click a rail row before falling back to
  direct conversation navigation.
- Plan 0073 proof mode can run one provider/runtime target without adopting
  unrelated persisted completions or waking the broader fleet.
- Scheduler diagnostics can report browser mutation counts, but the next slice
  needs more precise source names for attach-time navigation versus
  surface-navigation helpers.

Open risks:

- An existing Gemini target can still be navigated during attach/reuse before
  provider code has decided which surface needs navigation.
- Gem manager and Gem edit helpers can re-navigate even when the target is
  already on the requested ready surface.
- A broad Gem edit same-route skip could accidentally weaken post-write
  verification paths that currently depend on a fresh page read.
- A guarded Gemini profile can be discovered only after a live-follow pass has
  started instead of as a pre-pass stop condition.
- Detail inventory can continue spending the pass on Gem/project surfaces while
  conversation detail surfaces remain unscanned.
- Direct conversation route validation can be mistaken for a routine discovery
  path unless it is explicitly operator-only and separately labeled.

## Goal

Make Gemini live follow and proof runs use the lowest-churn browser path:

- detect provider guard pages before starting Gemini refresh work
- attach to existing Gemini targets without navigation side effects
- skip duplicate same-route navigation for ready read-only `/gems/view` and
  `/gems/edit/<projectId>` targets while preserving explicit fresh navigation
  for post-write verification
- keep routine conversation discovery and materialization rail-first
- label any direct `/app/<conversationId>` fallback as an exceptional mutation
  source
- prove the next scoped Gemini run has zero reloads and no duplicate
  same-route navigations before resuming the Plan 0073 terminal proof

## Non-Goals

- Do not automate CAPTCHA, reCAPTCHA, `google.com/sorry`, account chooser, or
  other human-verification clearance.
- Do not refresh the browser to walk Gemini rail conversations.
- Do not remove all direct conversation navigation fallbacks. Keep them for
  recorded rail misses, deleted/non-existent conversation evidence, and
  explicit operator diagnostics.
- Do not change tenant cache ownership. Tenant content remains provider plus
  bound identity; runtime/browser fields remain execution binding and
  provenance.
- Do not broaden scoped proof mode beyond the Plan 0073 provider/runtime
  contract.
- Do not click Gemini composer actions or create provider content as part of
  routine live follow.
- Do not suppress explicit fresh-navigation or reload-like verification where a
  mutating Gem operation needs a fresh provider read to prove persistence.

## Architecture Boundaries

### Attach Versus Navigate

Target attach is a browser-service selection operation. It may create a new
target only when no usable Gemini target exists or when an explicit operator
launch asks for one. It should not navigate an existing Gemini target as a side
effect.

Provider surface helpers own navigation decisions. They must check the current
URL and readiness state before calling `Page.navigate`.

Same-route skips are not a global replacement for fresh verification. Mutating
Gem operations such as rename, upload, delete, or remove-file confirmation may
require an explicit `forceNavigate` or equivalent fresh-read path before
asserting provider persistence.

### Provider Guard First

Gemini live-follow, scoped proof, and bounded reconciliation must census all
relevant Gemini targets for hard-stop states before scraping:

- `google.com/sorry`
- CAPTCHA or reCAPTCHA surfaces
- Google account chooser
- visible sign-in or account mismatch
- other human-verification interstitials

If any matching target is guarded, persist provider guard evidence and stop the
operation before another provider interaction.

The pre-pass census must be read-only against existing DevTools metadata or a
bounded non-mutating probe. It must not create a target, navigate a target,
bring a target to front, or otherwise disturb the managed browser profile while
deciding whether the profile is guarded.

### Rail-First Conversation Work

Routine Gemini conversation work should use:

1. the current `/app` or loaded `/app/<conversationId>` surface with rail open
2. project/Gem surfaces when reading project-specific conversation lists
3. in-page rail clicks for known conversation ids
4. direct `/app/<conversationId>` navigation only after a recorded rail miss or
   for explicit operator diagnostics

## Implementation Slices

### 1. Stop Before Guarded Browser Work

- Add a Gemini target-census helper that classifies all managed-profile Gemini
  targets before a refresh, proof, or bounded reconciliation pass starts.
- Persist provider guard state when any target is on `google.com/sorry`,
  CAPTCHA, reCAPTCHA, account chooser, or human-verification state.
- Keep the census non-mutating: no `Page.navigate`, no `CDP.New`, and no target
  focus/bring-to-front side effect.
- Make completion service and refresh service stop or idle on that guard before
  starting collector work.
- Keep identity mismatch and provider guard as stronger gates than bounded
  proof or operator reconciliation minimum-interval bypasses.

Acceptance criteria:

- A test proves a `google.com/sorry` target sets provider guard before refresh
  work starts.
- Tests prove account chooser/sign-in and CAPTCHA/reCAPTCHA classes are
  classified as provider guard states before refresh work starts.
- A test proves the guard census does not call `Page.navigate`, `CDP.New`, or
  target focus/bring-to-front helpers.
- A test proves bounded proof still stops on provider guard.
- Status readback names the guarded target URL class without printing secrets.

### 2. Make Gemini Attach Side-Effect Free

- Change Gemini attach/reuse so an existing Gemini target is selected without
  `Page.navigate`.
- If browser-service needs a generic option, add a narrow no-navigate reuse
  flag instead of duplicating target-selection logic in the provider adapter.
- Keep new target creation available when no usable Gemini target exists.
- Record attach selection separately from navigation in mutation diagnostics.

Acceptance criteria:

- A Gemini adapter test proves connecting to an existing same-origin target
  does not call `Page.navigate`.
- A browser-service test proves no-navigate reuse still focuses or selects the
  target needed for CDP work.
- Diagnostics can distinguish target selection from target navigation.

### 3. Add Same-Route Readiness Short-Circuits

- Add current-route and ready-state checks for `/gems/view`.
- Add current-route and ready-state checks for `/gems/edit/<projectId>`.
- Keep the existing `/app` conversation-surface readiness behavior intact.
- Add a fresh-navigation override, or separate read-only versus verification
  helpers, so post-write Gem verification can still force a provider reread
  before accepting persisted rename/upload/delete state.
- If readiness fails, navigate once through the surface helper and record that
  exact source.

Acceptance criteria:

- Tests prove ready `/gems/view` skips `Page.navigate`.
- Tests prove ready `/gems/edit/<projectId>` skips `Page.navigate`.
- Tests prove post-write Gem verification can still force navigation or a fresh
  provider read on an already-ready `/gems/edit/<projectId>` route.
- Tests prove not-ready surfaces still navigate once and settle normally.

### 4. Keep Routine Conversation Work Rail-First

- Ensure routine live follow and materialization do not call direct
  conversation validation as part of normal discovery.
- Keep direct `/app/<conversationId>` validation as an operator/debug path and
  label it separately in diagnostics.
- On rail miss, record whether the direct fallback ended at the conversation,
  bare `/app`, account chooser, or a provider guard route.
- Treat `/app` redirect from a direct conversation URL as evidence that the
  conversation may be deleted, unavailable, or inaccessible, not as proof that
  direct navigation is the preferred path.

Acceptance criteria:

- Tests prove routine live follow does not use the direct validation bounce.
- Tests prove direct fallback evidence is distinct from rail-click evidence.
- Scheduler diagnostics report direct fallback counts separately from rail
  clicks and same-route skips.

### 5. Rebalance Gemini Detail Inventory

- When materialization policy asks for missing assets, prioritize conversation
  detail surfaces before project/Gem file surfaces.
- Continue reporting unscanned conversation assets as `unknown` or `deferred`,
  not zero.
- Keep full-sweep cursor progress so a long pass can resume without starving
  either conversation detail or project detail.

Acceptance criteria:

- Tests prove an asset-seeking Gemini pass scans conversation detail before
  spending budget on project-only detail.
- Tests prove no scanned conversation detail means deferred/unknown inventory,
  not `artifacts=0` tenant truth.

### 6. Add Mutation Proof Readback

- Extend diagnostics to count mutation sources by provider operation:
  - target attach/select
  - attach-time navigation
  - Gem manager navigation
  - Gem edit navigation
  - conversation surface navigation
  - rail click
  - direct conversation fallback
  - reload
- Add a scoped proof readback field that summarizes duplicate same-route
  navigation attempts.

Acceptance criteria:

- A scoped Gemini proof can report zero reloads.
- A scoped Gemini proof can report zero duplicate same-route navigations.
- Any remaining direct fallback is visible by source and count.

## Parallelizable Tracks

- Provider guard target census and completion-service stop behavior can proceed
  independently from route short-circuit work.
- Attach no-navigation changes can proceed in browser-service tests while
  Gemini adapter tests cover provider behavior.
- Mutation diagnostics can proceed once the source names are agreed.
- Detail inventory prioritization can proceed after Plan 0073 evidence fields
  remain stable.

## Critical Path

1. Add guard-first target census and stop behavior.
2. Make Gemini attach/reuse side-effect free for existing targets.
3. Add `/gems/view` and `/gems/edit/<projectId>` same-route short-circuits.
4. Remove routine direct validation bounces from live-follow paths.
5. Rebalance detail inventory toward conversation detail for asset-seeking
   policies.
6. Add mutation proof readback.
7. After the operator clears the current Gemini guard page, run one scoped proof
   with mutation diagnostics before resuming the Plan 0073 terminal
   materialization proof.

## Implementation Progress

2026-05-26 deterministic slice landed:

- browser-service target reuse accepts a no-navigation reuse mode for existing
  same-origin or compatible-host targets, and Gemini attach uses it.
- Gemini `/gems/view` and `/gems/edit/<projectId>` helpers now skip
  duplicate navigation only when the current route is already ready; post-write
  Gem verification paths still force a fresh provider read.
- account-mirror refresh runs a non-mutating Gemini target census before
  collector work and records provider guard state for `google.com/sorry`,
  account chooser/sign-in, CAPTCHA/reCAPTCHA, and human-verification classes.
- routine Gemini conversation detail reads retain rail-first behavior; rail
  clicks and direct conversation fallback now emit distinct mutation sources.
- scheduler diagnostics browser mutation readback now includes `byKind`,
  `bySource`, and `duplicateSameRouteAttempts`.
- Gemini detail inventory was already conversation-first and cursor-resumable
  from the Plan 0073 evidence work.
- the user runtime was rebuilt, installed, and smoke-checked with
  `/home/ecochran76/.local/bin/auracall --version`.

2026-05-26 live scoped proof passed:

- the dedicated `auracall-gemini-pro` / `gemini-stealthcdp` managed browser
  profile was clear and identity smoke matched `ecochran76@gmail.com` from the
  Gemini Google-account label.
- scoped proof server `127.0.0.1:18173` reported
  `accountMirrorProofScope.enabled = true`, `globalLiveFollowSuppressed =
  true`, one scoped Gemini target, and zero adopted active completions.
- bounded proof completion
  `acctmirror_completion_17ccf29f-e4ee-479c-9d0c-3a71776126bc` completed one
  `full_sweep` pass for `gemini:auracall-gemini-pro` with request
  `acctmirror_2cc0a2cd-1351-4d9e-9aa3-d9667a86065b`.
- provider guard readback stayed clear for the scoped target.
- scheduler diagnostics for that completion reported no reload mutations and
  `duplicateSameRouteAttempts.total = 0`; mutation sources were
  `provider:gemini:connect-tab`, `provider:gemini:navigate-gems-view-page`,
  `provider:gemini:navigate-conversation-surface`, and
  `provider:gemini:navigate-edit-page`.
- the completion handed off Plan 0073 follow-on materialization job
  `hmj_112116b41db94ec5b9c3bb7c867e35e9`; that job later succeeded at
  `2026-05-26T14:47:12.730Z`, materializing seven assets from ten
  conversations with zero failures. Plan 0074's navigation/guard proof is
  complete; terminal checksum reconciliation remains Plan 0073 work.

## Validation Plan

Deterministic tests:

- `pnpm vitest run tests/browser-service/chromeTargetReuse.test.ts tests/browser/geminiAdapter.test.ts tests/accountMirror/refreshService.test.ts tests/cli/apiSchedulerDiagnosticsCommand.test.ts`
- `pnpm run typecheck`
- targeted tests for:
  - guard-first provider stop
  - no-navigation target attach
  - non-mutating guard census
  - account chooser/sign-in and CAPTCHA/reCAPTCHA guard classes
  - `/gems/view` same-route skip
  - `/gems/edit/<projectId>` same-route skip
  - post-write Gem verification fresh-navigation override
  - no routine direct validation bounce
  - detail inventory prioritization

Static gates:

- `pnpm exec tsc --noEmit --pretty false`
- targeted Biome lint for touched source and test files
- `pnpm run check` if shared browser-service or account-mirror contracts change
- `pnpm run plans:audit -- --keep 74`
- `git diff --check`

Live smoke, after manual Gemini clearance only:

1. Run identity smoke for `gemini:auracall-gemini-pro`.
2. Start a scoped proof server or scoped bounded proof for only
   `gemini:auracall-gemini-pro`.
3. Run one bounded refresh/materialization pass.
4. Read scheduler diagnostics and require zero reloads and no duplicate
   same-route navigations.
5. Resume the remaining Plan 0073 terminal materialization/checksum proof only
   if provider guard remains clear.

## Acceptance Criteria

- Gemini target attach/reuse no longer navigates existing targets as a side
  effect.
- Ready `/gems/view` and `/gems/edit/<projectId>` targets do not re-navigate.
- Gemini provider guard pages stop live follow before collector work starts.
- Routine live follow does not use direct `/app/<conversationId>` validation as
  a discovery path.
- Asset-seeking Gemini passes prioritize conversation detail surfaces and do
  not report false zero asset inventory when conversation detail is unscanned.
- Diagnostics prove zero reloads and no duplicate same-route navigations in the
  scoped Gemini proof.
- Plan 0073's final installed proof resumes only after this hardening passes
  and the operator clears the current Google unusual-traffic interstitial.

## Definition Of Done

- All deterministic tests and static gates in this plan pass.
- `README.md`, `docs/testing.md`, or the operator docs document any changed
  command or readback behavior.
- `docs/dev-fixes-log.md` records the durable browser-navigation lesson.
- User runtime is rebuilt and installed if code changes land.
- The final handoff includes mutation diagnostics, provider guard state, and
  the scoped proof completion id used to unblock Plan 0073.
