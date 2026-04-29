## Runtime Inspection Service-State Probe Plan | 0017-2026-04-16

State: CLOSED
Lane: P01

## Current State

- the passive provider-observation provider-parity seam is complete and
  live-validated through persisted readback:
  - ChatGPT, Gemini, and Grok all persist bounded passive observations on the
    execution seam when their provider-owned evidence exists
- the local API already exposes read-only runtime posture through:
  - `GET /status`
  - `GET /v1/team-runs/inspect`
  - `GET /v1/runtime-runs/inspect`
- the current API can answer runtime-owned mid-turn questions:
  - queue state
  - claim state
  - active lease owner
  - runner affinity posture
- it cannot yet answer provider-owned mid-turn questions such as:
  - whether the active provider is currently thinking
  - whether a response is visibly incoming
  - whether the active provider has reached a terminal response state

## Purpose

Add one bounded read-only API/CLI probe for live per-run provider service state
without collapsing provider evidence into generic runtime health.

## Problem Statement

Operators can already inspect a running Aura-Call execution, but the current
inspection surface stops at queue/lease posture. That leaves a useful gap:

- "the run is still active" is not the same thing as
  "the provider is thinking"
- "the runner owns the lease" is not the same thing as
  "the provider is visibly streaming"

If Aura-Call adds live provider probing, it needs to preserve the current
architecture:

- runtime inspection remains run-scoped and read-only
- provider heuristics stay provider-owned
- `/status` remains server/runner health, not chat-state semantics

## Design Goals

- keep the probe opt-in and read-only
- keep the surface run-scoped
- separate `runtimeState` from `serviceState`
- allow honest `unavailable` posture when no live probe can run
- keep provider-specific detection out of generic runtime inspection logic

## Non-Goals

- no widening of `/status` into provider chat-state reporting
- no background watcher service
- no durable mid-turn write stream in this slice
- no generic DOM polling contract owned by runtime inspection
- no requirement that every provider live-probe implementation land in the
  first slice

## Capability Boundary

### Runtime inspection owns

- query validation and read-only routing
- active-step selection and run-scoped probe context
- returning a bounded `serviceState` envelope
- preserving explicit `unavailable` reasons

### Provider/browser seam owns

- actual live service-state detection
- provider-specific evidence refs
- confidence assignment

### Review ledger owns

- nothing new in this slice
- the durable ledger remains the postmortem source of truth

## Recommended Bounded Model

Add one optional `serviceState` field to runtime inspection payloads only when
the caller explicitly requests a probe.

Suggested request shapes:

- CLI:
  - `auracall api inspect-run --run-id <id> --probe service-state`
- HTTP:
  - `GET /v1/runtime-runs/inspect?runId=<id>&probe=service-state`

Suggested bounded response shape:

```ts
type RuntimeInspectionServiceState = {
  probeStatus: 'observed' | 'unavailable';
  service: 'chatgpt' | 'gemini' | 'grok' | null;
  ownerStepId: string | null;
  state:
    | 'thinking'
    | 'response-incoming'
    | 'response-complete'
    | 'provider-error'
    | 'login-required'
    | 'captcha-or-human-verification'
    | 'awaiting-human'
    | 'unknown'
    | null;
  source: 'provider-adapter' | 'browser-service' | null;
  observedAt: string | null;
  evidenceRef: string | null;
  confidence: 'low' | 'medium' | 'high' | null;
  reason: string | null;
};
```

## Finite Implementation Plan

### Slice 1: Opt-in service-state probe contract on runtime inspection

Status: implemented

Goal:

- add one explicit read-only inspection seam for live provider service state

In scope:

- extend `inspectRuntimeRun(...)` to accept an opt-in service-state probe
  request
- extend `auracall api inspect-run` and
  `GET /v1/runtime-runs/inspect` with explicit probe selection
- return a bounded `serviceState` object with:
  - observed service state, or
  - explicit `unavailable` posture and reason
- keep the actual live probe injectable so provider/browser code can own it

Acceptance criteria:

- normal runtime inspection behavior is unchanged when no probe is requested
- opt-in probe requests return one bounded `serviceState` payload
- the payload distinguishes:
  - runtime-owned queue/lease posture
  - provider-owned live service state
- the surface is honest when probing cannot happen:
  - not running
  - no running step
  - no configured live probe
  - live probe returned no state

Verification:

- targeted runtime inspection unit coverage
- targeted HTTP inspection route coverage
- targeted CLI formatter coverage
- `pnpm exec tsc -p tsconfig.json --noEmit`

### Slice 2: Provider-backed live service-state probes

Status: implemented for ChatGPT, browser-backed Gemini, and browser-backed Grok

Goal:

- wire real provider/browser live probes into the new inspection seam without
  widening generic runtime inspection ownership

Recommended first provider:

- ChatGPT on the managed browser path

Rationale:

- strongest existing live evidence boundary
- existing placeholder/streaming/completion semantics are already documented

Acceptance criteria:

- one active ChatGPT run can return live `serviceState`
- evidence remains provider-owned
- unavailable posture remains honest when the browser/session cannot be probed
- Gemini browser-backed runs can return live `serviceState` on the same seam
- Gemini API-backed runs return honest `unavailable` posture instead of
  browser-derived state

Current checkpoint:

- `api serve` now wires a default ChatGPT-backed live probe onto
  `GET /v1/runtime-runs/inspect?...&probe=service-state`
- the default callback resolves the running step AuraCall runtime profile
  before probing the managed browser session
- `serveResponsesHttp` now also wires the configured stored-step executor by
  default, so direct `/v1/responses` runs use the same real configured
  browser-backed execution path as the bounded live proof
- live proof has now reached `probeStatus = observed` on active ChatGPT direct
  runs with provider-owned state progression:
  - `thinking` via `chatgpt-placeholder-turn`
  - `response-incoming` via `chatgpt-streaming-visible`
  - terminal runs correctly return explicit `unavailable` posture instead of
    stale provider state
- `api serve` now also wires a default Gemini-backed live probe onto the same
  inspection seam for browser-backed runs:
  - resolves the running step AuraCall runtime profile before probing
  - refuses non-browser Gemini runtime profiles
  - prefers executor-owned transient live state for active browser-backed runs
    and only falls back to provider-owned page evidence when no executor-owned
    state is available
  - current Gemini evidence boundary is:
    - `thinking` via `gemini-web-request-started` from the configured
      browser-backed executor
    - `response-incoming` / `response-complete` / `login-required` via
      provider-owned page evidence when available
- focused Gemini coverage now exists for:
  - provider-owned Gemini helper states
  - runtime-profile routing
  - non-browser runtime-profile refusal
- live operator proof on this WSL pairing now shows:
  - remembered-login recovery plus cookie export restores the
    `auracall-gemini-pro` browser path
  - direct browser Gemini succeeds again on that profile
  - a longer active Gemini `api serve` run originally returned only:
    - `probeStatus = observed`
    - `state = unknown`
    - `evidenceRef = gemini-live-probe-no-signal`
    - `confidence = low`
  - after adding executor-owned transient Gemini live state, a direct
    `api serve` run on `auracall-gemini-pro` now returns repeated active
    `thinking` readback even when the page looks idle:
    - `runId = resp_5f985759ab394ebdaffce387a5cc8602`
    - `probeStatus = observed`
    - `state = thinking`
    - `evidenceRef = gemini-web-request-started`
    - `confidence = medium`
  - terminal inspection still returns honest `unavailable`
  - that specific run later failed, so this live proof closes the active
    `thinking` seam rather than successful end-to-end Gemini completion
- `api serve` now also wires a default Grok-backed live probe onto the same
  inspection seam for browser-backed runs:
  - resolves the running step AuraCall runtime profile before probing
  - refuses non-browser Grok runtime profiles
  - prefers executor-owned transient live state for active browser-backed runs
    and only falls back to provider-owned page evidence when no executor-owned
    state is available
  - current Grok evidence boundary is:
    - `thinking` via `grok-prompt-submitted` from the configured
      browser-backed executor
    - `response-incoming` via visible Grok assistant text
    - `provider-error` via visible Grok rate-limit toast
    - `login-required` via visible signed-out/auth surface
- focused Grok coverage now exists for:
  - provider-owned Grok helper states
  - runtime-profile routing
  - non-browser runtime-profile refusal
  - executor-owned transient live-state preference
- live operator proof on this WSL pairing now shows:
  - a direct `api serve` run on `auracall-grok-auto` returned repeated active
    `thinking` readback during execution:
    - `runId = resp_668e19a0ea5946d3aea8cdcbf683c127`
    - `probeStatus = observed`
    - `state = thinking`
    - `evidenceRef = grok-prompt-submitted`
    - `confidence = medium`
  - the same run later completed successfully and terminal inspection returned
    honest `unavailable`

Next checkpoint:

- completed; follow-on quality work now lives in
  [0018-2026-04-17-service-state-quality-follow-up.md](/home/ecochran76/workspace.local/auracall/docs/dev/plans/0018-2026-04-17-service-state-quality-follow-up.md)

## Definition Of Done

- one bounded active plan exists for live runtime inspection service-state
  probing
- roadmap and runbook point to this plan as the next active checkpoint
- the first contract slice is implemented and testable
- runtime health and provider service state remain explicitly separate
