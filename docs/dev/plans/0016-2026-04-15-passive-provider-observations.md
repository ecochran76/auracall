# Passive Provider Observations Plan | 0016-2026-04-15

State: CLOSED
Lane: P01

## Current State

- the team-run review ledger checkpoint is complete:
  - read-only ledger projection is live
  - `auracall teams review` is live
  - stored provider references are preserved when execution metadata carries
    them
  - hard-stop observations are derived from durable failure metadata
- Slice 1 is now implemented for the ChatGPT execution path:
  - `runBrowserMode` returns stored passive observations for:
    - `thinking`
    - `response-incoming`
    - `response-complete`
  - configured stored-step execution persists those observations into
    `browserRun.passiveObservations`
  - the review ledger projects stored passive observations without embedding
    provider-specific detection logic
- live validation on 2026-04-16 refined the ChatGPT evidence boundary:
  - the most reliable `thinking` signal on the managed WSL Chrome path is the
    placeholder assistant turn text `ChatGPT said:Thinking`
  - `response-incoming` remains best detected by assistant snapshot growth
    while the stop button is still visible
  - `response-complete` remains best detected when the stop button disappears
  - thinking-status reads must be sanitized to bounded state labels so verbose
    monitoring does not spill prompt or assistant-body text after the
    placeholder phase
- the remaining observability gap is now live validation and any later
  confidence/evidence normalization refinements, not basic provider parity
- Slice 2 is now implemented for Gemini executor paths:
  - the TypeScript Gemini web executor emits stored passive observations from
    returned provider metadata
  - the browser-native Gemini attachment path emits stored passive
    observations from page-state progression
  - configured stored-step execution persists those observations into
    `browserRun.passiveObservations` on the existing seam
- Slice 3 is now implemented for Grok browser execution:
  - Grok emits stored passive observations from its assistant-result lifecycle
  - `thinking` is recorded after successful prompt submission
  - `response-incoming` is recorded on first new assistant content
  - `response-complete` is recorded when the Grok assistant result stabilizes
    and returns
  - both local/managed and remote Chrome Grok execution paths persist those
    observations into `browserRun.passiveObservations`
- live persisted validation on 2026-04-16 confirmed the provider-parity seam:
  - Grok persisted:
    - `thinking`
    - `response-incoming`
    - `response-complete`
  - Gemini persisted:
    - `response-incoming`
    - `response-complete`
  - Gemini did not emit `thinking` in that live run, which matches the current
    Gemini evidence boundary because the provider did not return live thoughts

## Purpose

Define the next bounded implementation lane after the review-ledger checkpoint:

- adapter-owned passive provider observations captured during execution and
  persisted so the review ledger can replay them later

This plan is intentionally narrower than "full monitoring":

- no background watcher service
- no standalone transcript UI
- no generic DOM polling loop owned by runtime/service mode

## Problem Statement

Aura-Call can now reconstruct a whole team-run sequence, but it still cannot
durably answer key passive-state questions for successful runs:

- when a provider was thinking
- when a response was clearly incoming/streaming
- when a provider finished responding

Without a provider-owned observation seam, future monitoring risks becoming:

- DOM heuristics duplicated across generic layers
- runtime-state guesses that do not reflect provider reality
- non-replayable observations that disappear after the browser session ends

## Design Goals

- keep provider-state ownership in adapters/executors
- persist observations as durable execution metadata
- attach evidence references and confidence
- preserve a provider-neutral ledger readback shape
- start with one bounded provider/execution-path slice first

## Non-Goals

- no broad service-mode background monitoring
- no new public write surface
- no cache-path inference based on naming conventions
- no lease-state-to-chat-state mapping
- no requirement that every provider reach parity in the first slice

## Capability Boundary

### Provider adapters / execution path own

- state detection for provider-specific UI semantics
- evidence capture such as:
  - selector/source id
  - URL class
  - adapter event name
  - optional lightweight diagnostic note
- emission of structured passive observations during step execution

### Runtime durable state owns

- persistence of emitted observations in stored execution metadata
- stable linkage to run id, step id, provider/service, timestamps, and
  evidence refs

### Review ledger owns

- projection of stored passive observations into the existing ledger shape
- ordered readback beside steps, artifacts, handoffs, and failures

## Recommended Bounded Model

### 1. Add one stored observation envelope

Persist provider-emitted observation items on step output/shared state using a
small durable shape:

```ts
type StoredProviderObservation = {
  state:
    | 'thinking'
    | 'response-incoming'
    | 'response-complete'
    | 'provider-error'
    | 'login-required'
    | 'captcha-or-human-verification'
    | 'awaiting-human';
  source: 'provider-adapter' | 'browser-service';
  observedAt: string;
  evidenceRef?: string | null;
  confidence: 'low' | 'medium' | 'high';
};
```

This should be written as explicit metadata from the execution path, not
reconstructed later by the ledger.

### 2. Keep ledger projection generic

`src/teams/reviewLedger.ts` should read stored observation envelopes without
embedding provider-specific detection logic.

### 3. Start with one provider/execution path

The first slice should cover one execution path where observation semantics are
already strong enough to justify persistence. Recommendation:

- ChatGPT browser execution path first

Rationale:

- strongest existing browser hardening
- most mature DOM-specific defensive notes already exist
- gives one concrete observation producer before expanding to Gemini/Grok

## Finite Implementation Plan

### Slice 1: Stored passive observation seam plus ChatGPT execution-path capture

Status: implemented for ChatGPT browser execution; live evidence boundary refined

Goal:

- prove one durable passive observation pipeline end to end without broadening
  monitoring scope

In scope:

- add one stored provider-observation envelope on the execution seam
- let ChatGPT browser execution emit bounded passive observations for:
  - `thinking`
  - `response-incoming`
  - `response-complete`
- persist those observations on the stored run/step path
- project them through the existing review ledger and `auracall teams review`

Acceptance criteria:

- one stored ChatGPT-backed step can persist a deterministic observation
  sequence
- the review ledger surfaces those observations without provider-specific logic
- successful runs can show passive provider-state transitions, not only failure
  hard stops
- no generic runtime/lease layer infers chat state on its own

Verification:

- passed on 2026-04-15:
  - `pnpm vitest run tests/runtime.configuredExecutor.test.ts tests/teams.reviewLedger.test.ts tests/cli/teamRunCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- live validation on 2026-04-16:
  - direct instant trace:
    - `/tmp/chatgpt-direct-instant-dom-trace.jsonl`
  - direct thinking trace:
    - `/tmp/chatgpt-direct-thinking-dom-trace.jsonl`
  - the reliable thinking signal was the placeholder assistant turn
    `ChatGPT said:Thinking`, not the generic status-node scan
  - post-patch thinking recheck:
    - `/tmp/chatgpt-postpatch-thinking-output-2.txt`
    - verbose monitoring preserved one bounded `Thinking` line without later
      prompt/body spill

### Slice 2: Gemini parity on the same stored seam

Goal:

- extend the stored observation seam to Gemini once one provider path is
  stable

Status: implemented for Gemini executor paths; live validation still pending

Acceptance criteria:

- Gemini execution emits stored passive observations on the same durable shape
- configured stored-step execution persists those observations without adding
  provider logic to the ledger
- `auracall teams review` can read Gemini passive observations through the
  existing stored-step projection
- no generic runtime or ledger code infers Gemini chat-state semantics

Verification:

- passed on 2026-04-16:
  - `pnpm vitest run tests/gemini-web/executor.test.ts tests/runtime.configuredExecutor.test.ts tests/teams.reviewLedger.test.ts tests/cli/teamRunCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- current evidence boundary:
  - Gemini web executor observations are derived from returned provider
    thoughts/text/images and successful completion
  - Gemini browser-native attachment observations are derived from prompt
    commitment, first visible answer text, and stable completion
  - live Gemini validation remains separate because this machine still needs
    stricter exported-cookie and anti-bot preflight

### Slice 3: Grok parity and confidence/evidence normalization

Goal:

- normalize cross-provider evidence refs and confidence posture without moving
  detection into generic runtime code

Status: implemented for Grok browser execution; live validation still pending

Acceptance criteria:

- Grok execution emits stored passive observations on the same durable shape
- configured stored-step execution persists those observations without adding
  provider logic to the ledger
- `auracall teams review` can read Grok passive observations through the
  existing stored-step projection
- no generic runtime or ledger code infers Grok chat-state semantics

Verification:

- passed on 2026-04-16:
  - `pnpm vitest run tests/browser/grokActions.test.ts tests/runtime.configuredExecutor.test.ts tests/teams.reviewLedger.test.ts tests/cli/teamRunCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- current evidence boundary:
  - Grok observations derive from provider-owned assistant-result lifecycle
  - `thinking` starts at successful prompt submission
  - `response-incoming` starts at first new assistant content beyond the
    baseline snapshot
  - `response-complete` is recorded when the stabilized Grok result returns

## Definition Of Done

- the next monitoring lane is explicitly wired into roadmap/runbook authority
- the review-ledger checkpoint is treated as complete rather than accumulating
  more scope
- the finite passive-observation provider-parity slice is implemented and
  testable across ChatGPT, Gemini, and Grok
- provider-state ownership stays adapter-first
- live persisted validation has confirmed the bounded provider-parity seam
