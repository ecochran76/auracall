# ChatGPT Long-Prompt Observation Recovery | 0326-2026-09-02

State: CLOSED
Lane: P19
Operational state: PROVIDER_FREE_ACCEPTED
Branch: fix/plan0326-long-prompt-observation-recovery
Target: main
Integration: merge
Revision: 1 | 2026-09-02

## Stable Objective

Separate AuraCall's observation lease from ChatGPT's model lifecycle so an
elapsed observer deadline with positive active-generation evidence remains a
resumable exact turn, preserves accumulated response evidence and browser
identity, and recovers through read-only reattachment without another Send.

## Current State

- LitScout Experiment 51 reached AuraCall's 3,600-second wait with 33,688
  assistant-text characters, a visible Stop control, and no provider error.
  AuraCall persisted `browser-terminal-response` as terminal `error`; later
  read-only reattachment recovered the completed response from the same turn.
- `performSessionRun` owns the overall browser deadline. Its abort reason can
  carry `browserResponseProgress`, but every timeout other than a classified
  browser disconnect currently terminalizes the Session and model run.
- `runBrowserMode` captures progress on abort, then normally closes the
  DevTools client, browser, and browser-operation lease unless the operator
  separately requested browser retention.
- `sessionDisplay` already reattaches a persisted running browser Session when
  its controller has exited and exact runtime identity remains available. The
  recovery path calls `resumeBrowserSession`; it does not replay the prompt.
- The existing assistant-response reload fallback is not a sufficient
  renewable-observation contract: it is error-triggered, has no durable
  15-minute cooldown, and does not first distinguish healthy progress from a
  stale or interrupted connection.
- The sibling LitScout handoff is
  `docs/dev/notes/0125-2026-09-02-experiment-51-research-coordination-boundary.md`;
  AuraCall's local authority is
  `docs/dev/notes/0002-2026-09-02-litscout-experiment-51-long-prompt-observation-handoff.md`.
- Provider-free implementation now classifies only non-empty assistant text
  with Stop visible and no completion/dialog as active generation. It persists
  Session/model state as running with
  `observation_expired_generation_active`, retains exact runtime/conversation
  identity, and preserves the managed browser for read-only reattachment.
- Assistant response observation now emits stable message/turn identity plus a
  content fingerprint. Healthy fingerprint progress suppresses refresh;
  stale/interrupted observation may refresh only the exact conversation and is
  guarded by one 15-minute per-Runtime cooldown.

## Execution Graph

1. Freeze the Experiment 51 timeout shape at the CLI Session persistence seam:
   elapsed observer lease, active-generation progress, exact browser and
   conversation identity, and no provider terminal error.
2. Classify only positive active generation as
   `observation_expired_generation_active`; keep Session/model state running,
   clear terminal completion fields, persist bounded progress, and return
   without presenting the observation expiry as a model timeout.
3. Preserve the exact managed browser and submitted tab when that state is
   classified, while releasing the foreground observer and operation lease so
   the existing read-only Session reattachment path can recover completion.
4. Introduce one provider-local observation-recovery controller that compares
   successive exact-turn progress snapshots, suppresses refresh while progress
   is healthy, and permits at most one same-conversation read-only recovery
   refresh per 15-minute window when progress is stale or connection
   interruption is positively observed.
5. Reconcile accumulated response representations by stable assistant
   message/turn identity and content fingerprint after recovery. Never touch
   the composer, click `Answer now`, navigate to another conversation, or
   submit a new turn.
6. Update Session/operator documentation and durable engineering notes, then
   run the focused regression packet, adjacent reattachment and ChatGPT browser
   tests, typecheck, build, scoped lint, planning audits, and diff hygiene.

## Acceptance Criteria

- `LPO-R1`: a Session deadline with Stop visible and growing assistant text
  persists Session and model state as running/resumable with
  `observation_expired_generation_active`; it does not persist terminal
  `browser-terminal-response` or `completedAt`.
- `LPO-R2`: timeout classification preserves exact AuraCall runtime profile,
  browser profile, managed browser process/port/tab, conversation identity,
  stable assistant identity/fingerprint, and bounded accumulated-response
  evidence needed for read-only continuation.
- `LPO-R3`: the existing Session reattachment path recovers the same turn after
  observer exit without calling the prompt runner or causing another Send.
- `LPO-R4`: healthy current progress records a heartbeat and causes no physical
  refresh; stale or explicitly interrupted progress can cause at most one
  exact-conversation recovery refresh in any 15-minute window.
- `LPO-R5`: recovery fails closed on target/account/conversation ambiguity and
  never clicks `Answer now`, changes composer content, submits a prompt, or
  creates a new conversation.
- `LPO-R6`: genuine provider completion/error, unrecoverable connection
  failure, and operator cancellation retain truthful terminal behavior.
- `LPO-R7`: focused and adjacent provider-free tests, typecheck, build, scoped
  lint, planning audits, and diff hygiene pass with exact tier/exclusion
  reporting.

## Bounds

- Provider-free source, tests, and documentation only. No browser launch,
  navigation, refresh, prompt, provider call, runtime install, service restart,
  scheduler/completion control, or live canary.
- One implementation attempt plus one evidence-driven repair cycle.
- One recovery controller and one 15-minute cooldown authority; do not add an
  unrelated polling workflow or a second browser ownership path.
- Preserve exact account, AuraCall runtime profile, browser profile, managed
  browser, target, Project, conversation, and assistant-turn identity.
- ChatGPT skill lifecycle discovery and CRUD are a separate successor and must
  not be coupled to this source slice.

## Definition Of Done

All seven criteria have provider-free evidence on this branch, operator docs
describe the resumable observation state and read-only recovery command, and
installed/live acceptance remains explicitly separate.

## Closeout Evidence

- `LPO-R1` / `LPO-R2`: `tests/cli/sessionRunner.test.ts` freezes the Experiment
  51 shape and proves running Session/model persistence, no `completedAt`, exact
  Chrome target/conversation retention, bounded assistant IDs/fingerprint, and
  `browser-observation-expired` recovery metadata.
- `LPO-R3`: the full provider-free suite includes the existing no-replay
  reattachment contract in `tests/runtime.configuredExecutor.test.ts` and the
  three reattach end-to-end cases in `tests/browser/reattach.e2e.test.ts`.
- `LPO-R4` / `LPO-R5`: `tests/browser/observationLease.test.ts` proves healthy
  heartbeat, 15-minute stale recovery, cooldown suppression, and fail-closed
  completed/dialog handling. Production recovery verifies the same
  conversation ID before and after the single control-plane navigation.
- `LPO-R6`: the classifier excludes completion/dialog/no-text states; existing
  terminal timeout, provider error, cancellation, and disconnect tests remain
  green in the full suite.
- `LPO-R7`: focused and adjacent packet: 9 files / 148 tests passed; typecheck,
  production build, scoped Biome lint, plan audit (`325` kept, `0` errors), and
  `git diff --check` passed. Full provider-free suite: 324 files / 3,038 tests
  passed, 21 files / 65 live tests skipped, and one unrelated existing
  mutation-inventory expectation failed because
  `scripts/observe-chatgpt-tool-approval.ts` no longer contains a raw direct
  navigation mutation while its allowlist entry remains.
- No browser, provider, install, restart, scheduler, or live action was run.
  Provider-free acceptance is complete; installed/live acceptance is not
  claimed.
