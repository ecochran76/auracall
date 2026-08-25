# ChatGPT Project-Slug Work Marker | 0316-2026-08-25

State: OPEN
Lane: P09
Operational state: REPAIR
Branch: fix/plan0316-project-slug-work-marker
Target: main
Integration: merge
Revision: 1 | 2026-08-25

## Stable Objective

Restore explicit ChatGPT Work-mode proof for an established Project
conversation when the loaded Project URL includes its human-readable slug but
the active sidebar link uses ChatGPT's canonical project-ID-only route, without
weakening exact Project, conversation, active-link, or `Work` badge checks.

## Current State

- LitScout Plan 0444 targets one existing ChatGPT Project conversation through
  AuraCall runtime profile `wsl-chrome-3` and requires Work mode with
  `GPT-5.6 Sol`.
- Two bounded pre-Send attempts reached the exact conversation and failed at
  `Unable to find the ChatGPT Work mode control`; no prompt or model effect
  occurred.
- AuraCall identity smoke proves the expected Pro personal provider session.
- Read-only live DOM evidence proves the active link is
  `/g/<project-id>/c/<conversation-id>` with an exact descendant `Work` span,
  while `location.pathname` is
  `/g/<project-id>-<human-readable-slug>/c/<conversation-id>`.
- `hasActiveConversationWorkMarker` currently requires byte-identical
  pathnames, so it rejects this genuine route pair.
- The live-derived tracer failed before the implementation, then the bounded
  provider-local repair passed all 18 composer-mode cases. The wider focused
  ChatGPT browser contract gate passed 139 tests across 7 discovered files;
  typecheck, scoped Biome, build, CodeGraph sync/status, plan audit, and diff
  hygiene also pass.
- Provider-free source acceptance is complete. Installed byte parity and the
  one no-prompt exact-target preflight remain before P09 can close.

## Authority And Bounds

- This is an urgent bounded harness repair under the standing LitScout Plan
  0444 execution goal; one critical-path owner and no subagents.
- Write set: `src/browser/actions/chatgptComposerMode.ts`, its focused tests,
  the Work-mode contract docs, and P09 planning/validation records.
- P08 owns aggregate status latency and has no expected source overlap. P09
  must not change API status, scheduler, account-mirror, provider pacing, or
  completion semantics.
- Provider-free repair first. One user-runtime install is allowed only after
  exact focused tests, affected validation, typecheck, scoped lint, build,
  CodeGraph, plan audit, and diff hygiene pass.
- One no-prompt installed Work-mode preflight may prove the exact retained
  conversation. The frozen Plan 0444 writer Send remains a separate reconciled
  action after source/runtime acceptance.
- Never infer Work from composer readiness, generic text, a non-active link, a
  different Project/conversation route, or the animated model slider. Never
  click `Answer now`.

## Execution Graph

1. Freeze live route evidence and add exact positive/negative provider-free
   fixtures for canonical-versus-slugged Project routes.
2. Implement the smallest provider-local canonical route comparison.
3. Run the focused Work-mode gate plus affected validation, typecheck, scoped
   lint, build, CodeGraph, plan audit, and diff hygiene.
4. Publish the validated checkpoint, install once, and run one no-prompt exact
   Work-mode preflight under AuraCall-owned browser lifecycle.
5. Record installed/live evidence, close/integrate P09, then return to the
   already-frozen LitScout Plan 0444 writer packet.

## Acceptance Criteria

- `PSW-R1`: a fixture reproduces the observed canonical active-link route
  against the slugged loaded route and fails before the repair.
- `PSW-R2`: explicit Work is accepted only when one visible `data-active` link
  resolves to the same exact conversation and same exact Project ID, allowing
  only ChatGPT's optional suffix after that Project ID.
- `PSW-R3`: different Project IDs, different conversation IDs, inactive links,
  missing/non-exact Work badges, and ordinary Chat remain fail-closed.
- `PSW-R4`: focused/affected tests, typecheck, scoped lint, build, CodeGraph,
  plan audit, and diff hygiene pass.
- `PSW-R5`: installed source is byte-identical and one no-prompt exact-target
  preflight proves Work plus `GPT-5.6 Sol` with the expected account and no
  Send.
- `PSW-R6`: P09 is published and reconciled without modifying P08 or any
  scheduler/account-mirror state; browser ownership is clean or explicitly
  retained by AuraCall for the next Plan 0444 operation.

## Non-Goals

- No generic route equivalence, broad substring match, sidebar redesign, Chat
  model-selector change, tool-approval change, or browser-service extraction.
- No prompt Send, LitScout action, provider request, app/OAuth mutation,
  scheduler control, or unrelated browser/process cleanup in the repair gate.

## Definition Of Done

- All six acceptance criteria have current provider-free, installed, and exact
  live evidence.
- The frozen Plan 0444 writer packet can pass AuraCall's Work-mode pre-Send gate
  without weakening any identity, route, mode, model, or cleanup boundary.
- P09 is closed/integrated with durable root-cause and validation evidence.
