# Team Run Review Ledger Plan | 0015-2026-04-15

State: CLOSED
Lane: P01

## Current State

- service mode already reports runtime-oriented health:
  - persisted local runner records
  - runner heartbeat/liveness
  - active lease heartbeat and lease-health classification
  - runtime queue and local-claim projection
  - configured service-account affinity readback
- current service-mode health is not a provider-neutral chat-state monitor
- provider/browser adapters may detect readiness, completion, failures, hard
  stops, and artifacts while executing a step, but those observations do not
  yet form one durable cross-provider state stream
- current team/runtime inspection preserves enough identifiers to start a
  review spine:
  - `taskRunSpecId`
  - `teamRunId`
  - runtime run id
  - step, handoff, shared-state, event, lease, and runner summaries
- the first Slice 1 projection helper now exists under:
  - `src/teams/reviewLedger.ts`
- current Slice 1 behavior is internal and read-only:
  - it projects from an existing persisted runtime bundle
  - it preserves serial step order
  - it preserves runtime/browser/service/account provenance when present
  - it preserves provider conversation refs from existing step output
    `browserRun` metadata when present
  - it represents missing provider conversation refs as `null`
  - it leaves `observations` empty until later passive-monitoring slices
- Slice 2 now exposes the first operator read surface:
  - `auracall teams review`
  - supported lookup keys are exactly one of:
    - `--task-run-spec-id`
    - `--team-run-id`
    - `--runtime-run-id`
  - it preserves alias provenance and bounded matching runtime-run ids
  - it remains read-only and does not authorize public team execution writes
- individual provider chats may remain reviewable in provider caches, but the
  provider cache is not the canonical orchestration record for a team task
- public team execution writes remain paused
- Slices 1-4 are now complete:
  - read-only ledger projection
  - read-only CLI review surface
  - stored provider reference enrichment
  - durable failure-derived hard-stop observations
- the roadmap reassessment checkpoint after Slice 4 is complete
- richer passive provider-state monitoring is now delegated to:
  - [0016-2026-04-15-passive-provider-observations.md](/home/ecochran76/workspace.local/auracall/docs/dev/plans/0016-2026-04-15-passive-provider-observations.md)

## Purpose

Define the next higher-level service/runtime capability before richer passive
provider monitoring:

- a durable team-run review ledger that can reconstruct what Aura-Call did,
  why each step ran, which provider conversation or cache record it touched,
  what result it produced, and how handoffs moved through the run

This plan memorializes the design boundary for:

- service-mode LLM health monitoring
- passive chat-state monitoring
- serial and future parallel team-task review
- reproducibility and postmortem readback

## Design Decision

Build the review ledger before developing broad passive status monitoring.

Rationale:

- passive provider-state observations need a durable parent before they are
  useful
- a ledger gives every future observation a stable attachment point:
  - team run
  - runtime run
  - step
  - service
  - browser profile
  - service account
  - provider conversation/cache reference
  - prompt/input snapshot
  - output/artifact reference
- provider DOM and network state is volatile, so it should not define the
  orchestration model
- the ledger improves review and reproducibility even before provider-state
  monitoring grows beyond current execution-path failure detection

## Capability Boundary

### Service-mode health owns

- runner registration and heartbeat
- runner liveness and expiry
- active lease heartbeat freshness
- queue and claim projection
- account/browser/runtime affinity readback
- bounded recovery and repair posture

### Passive provider monitoring should own later

- provider-specific chat state observations such as:
  - `thinking`
  - `response-incoming`
  - `response-complete`
  - `provider-error`
  - `login-required`
  - `captcha-or-human-verification`
  - `awaiting-human`
- evidence references for observations:
  - selector match
  - URL class
  - browser event
  - adapter classification
  - screenshot or diagnostic artifact when explicitly captured
- confidence and source metadata

### Team-run review ledger owns now

- the ordered or branched execution sequence
- assignment and team linkage
- step-level provider/cache references
- prompt/input snapshots sufficient for postmortem review
- normalized step outputs and failure summaries
- artifact references
- handoff summaries
- runtime/account/browser profile provenance
- bounded observations slot for future passive provider states

## Non-Goals

- do not add a public `team run` write surface in this plan
- do not implement full passive DOM/network monitoring in this plan
- do not turn provider caches into the canonical orchestration record
- do not attempt deterministic rerun guarantees for live provider model output
- do not introduce multi-runner scheduling, reassignment, or background worker
  topology
- do not broaden runtime recovery endpoints into a transcript UI

## Review Ledger Contract

The first durable contract should be append-friendly and serializable:

```ts
type TeamRunReviewLedger = {
  id: string;
  teamRunId: string;
  taskRunSpecId: string;
  runtimeRunId: string;
  status: 'planned' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  sequence: TeamRunReviewStep[];
  artifacts: TeamRunReviewArtifact[];
  handoffs: TeamRunReviewHandoff[];
  observations: TeamRunReviewObservation[];
};
```

Minimum step shape:

```ts
type TeamRunReviewStep = {
  stepId: string;
  order: number;
  parentStepIds: string[];
  agentId: string;
  runtimeProfileId: string;
  browserProfileId?: string | null;
  service: string;
  serviceAccountId?: string | null;
  providerConversationRef?: {
    service: string;
    conversationId?: string | null;
    cachePath?: string | null;
    cachePathStatus?: 'available' | 'unavailable' | null;
    cachePathReason?: string | null;
    url?: string | null;
    configuredUrl?: string | null;
    projectId?: string | null;
    runtimeProfileId?: string | null;
    browserProfileId?: string | null;
    agentId?: string | null;
    model?: string | null;
  } | null;
  inputSnapshot: {
    prompt?: string | null;
    structuredContext?: Record<string, unknown> | null;
    artifactIds?: string[] | null;
  };
  outputSnapshot?: {
    summary?: string | null;
    text?: string | null;
    structuredOutputs?: Record<string, unknown> | null;
    artifactIds?: string[] | null;
  } | null;
  status: 'planned' | 'runnable' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'skipped' | 'cancelled';
  startedAt?: string | null;
  completedAt?: string | null;
  failure?: {
    code: string;
    message: string;
    providerState?: string | null;
  } | null;
};
```

Minimum observation shape:

```ts
type TeamRunReviewObservation = {
  id: string;
  stepId?: string | null;
  state:
    | 'thinking'
    | 'response-incoming'
    | 'response-complete'
    | 'provider-error'
    | 'login-required'
    | 'captcha-or-human-verification'
    | 'awaiting-human'
    | 'unknown';
  source: 'runtime' | 'provider-adapter' | 'browser-service' | 'operator';
  observedAt: string;
  evidenceRef?: string | null;
  confidence: 'low' | 'medium' | 'high';
};
```

Important rule:

- observations are attached to the ledger; they do not replace the durable
  step, handoff, artifact, or shared-state model

## Finite Implementation Plan

### Slice 1: Contract and projection-only review ledger

Status: implemented internally

Goal:

- produce a read-only ledger from existing persisted runtime/team records
  without changing execution behavior

In scope:

- add internal review-ledger types and projection helper
- project ledger records from existing:
  - task-run spec summary
  - team-run summary
  - runtime run
  - steps
  - handoffs
  - shared state history
  - response execution summary when present
- include an empty or runtime-derived `observations` array
- expose one internal read helper for tests and future route/CLI use

Acceptance criteria:

- one persisted team run can produce one deterministic review ledger
- the ledger orders serial steps correctly
- the ledger can represent future branches through `parentStepIds`
- the ledger preserves runtime, browser, service, and account provenance when
  available
- missing provider conversation refs are represented as `null`, not inferred
- no new public execution write behavior is introduced

Verification:

- passed on 2026-04-15:
  - `pnpm vitest run tests/teams.reviewLedger.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

### Slice 2: Read-only operator surface

Status: implemented as CLI

Goal:

- make the ledger reviewable through one bounded read surface

In scope:

- add one read-only inspection endpoint or CLI command
- support lookup by exactly one stable key:
  - `teamRunId`
  - `taskRunSpecId`
  - `runtimeRunId`
- preserve alias provenance and bounded match summaries, matching the runtime
  inspection posture
- document that provider caches remain supplemental evidence, not the ledger
  authority

Acceptance criteria:

- users can review the whole team sequence without manually stitching provider
  chat histories together
- serial run readback includes assignment, steps, handoffs, outputs, artifacts,
  failures, and provider/cache refs when available
- the surface is explicitly read-only
- invalid lookup shapes fail with one deterministic message

Verification:

- passed on 2026-04-15:
  - `pnpm vitest run tests/teams.reviewLedger.test.ts tests/cli/teamRunCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `pnpm run plans:audit`
  - `git diff --check`

### Slice 3: Provider reference enrichment

Status: implemented for stored browser-run metadata

Goal:

- attach real provider conversation/cache references where current adapters
  already know them

In scope:

- capture provider conversation id, tab URL, configured URL, project id,
  runtime profile id, browser profile id, agent id, and selected model when
  already available from ChatGPT/Gemini/Grok execution paths
- preserve cache path only when the stored provider metadata already carries a
  concrete path
- mark cache path status as `unavailable` when stored-step execution has not
  resolved provider cache identity
- avoid new provider scraping just to fill ledger fields
- preserve `null` for unavailable refs
- add artifact manifest references when already persisted

Acceptance criteria:

- at least one provider-backed run shows a concrete provider conversation or
  provider metadata reference in the ledger
- absence of a provider ref does not fail ledger projection
- refs point to durable or inspectable locations
- cache paths are not inferred from naming conventions without cache identity
  evidence
- no provider-specific heuristics leak into the generic ledger projection

Verification:

- passed on 2026-04-15:
  - `pnpm vitest run tests/runtime.configuredExecutor.test.ts tests/teams.reviewLedger.test.ts tests/cli/teamRunCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

### Slice 4: Minimal passive hard-stop observations

Status: implemented for durable failure-derived hard stops

Goal:

- use the ledger observation slot for high-value hard-stop states before
  attempting full live chat-state monitoring

In scope:

- record bounded observations for:
  - provider error
  - login required
  - captcha or human verification
  - awaiting human action
- attach observations to the relevant step when known
- keep `thinking` and `response-incoming` out of scope unless an adapter
  already exposes them reliably

Acceptance criteria:

- hard-stop provider states appear in the ledger as observations
- observations carry source, timestamp, confidence, and evidence reference
  when available
- current execution failure semantics remain unchanged
- Gemini captcha/sorry behavior remains a hard stop requiring human clearance

Verification:

- passed on 2026-04-15:
  - `pnpm vitest run tests/teams.reviewLedger.test.ts tests/cli/teamRunCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## Future Passive Monitoring Checkpoint

After Slices 1-4, reassess whether to add richer passive monitoring.

The richer monitoring checkpoint should not start until:

- the ledger can review a complete serial team run
- provider/cache refs are present where available
- hard-stop observations are durable
- the operator has one coherent readback surface for the whole sequence

Potential later states:

- `thinking`
- `response-incoming`
- `streaming`
- `tool-or-artifact-generating`
- `response-complete`

These should be provider-adapter observations, not runtime lease states.

## Definition Of Done

- design features for service health, passive monitoring, and run
  reproducibility are recorded in this canonical plan
- roadmap and runbook point to this plan as the active review/observability
  sequencing authority
- the first implementation slice is finite, testable, and read-only
- passive monitoring is explicitly sequenced after ledger review infrastructure
- no public team execution write surface is authorized by this plan
