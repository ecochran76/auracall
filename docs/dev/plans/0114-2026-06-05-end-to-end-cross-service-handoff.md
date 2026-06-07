# End-To-End Cross-Service Handoff Plan | 0114-2026-06-05

State: OPEN
Lane: P01

## Purpose

Define the complete AuraCall/App Intelligence workflow for moving useful
conversation context, files, artifacts, and provenance from one provider,
tenant, or service account into another. The workflow must stay provider
neutral: ChatGPT Business to ChatGPT Pro is a motivating case, not the product
boundary.

The desired operator outcome is a supervised handoff run that can:

- prove the source context and artifacts were cached or explain what is
  missing;
- ask an analysis worker to select the most important portable context and
  artifacts;
- assemble a target-ready package with compact JSON, selected files, primer,
  and omissions;
- require explicit approval before target upload or submit;
- submit through the right target adapter;
- read back target state and persist replayable proof.

## Current State

- Plan 0111 installed the provider-neutral dry-run packet builder and packet
  layout under user-scoped AuraCall runtime storage.
- Plan 0112 installed import of existing `history_materialization_job`
  readbacks into the source manifest and omissions.
- The command surface is currently `auracall handoff prepare --dry-run`.
- The packet already carries source context, manifest, omissions, analysis
  preview, compact context, target primer, target submission plan, skipped
  submission result, skipped readback, and zero-target-mutation evidence.
- The remaining gap is an end-to-end supervised workflow that creates or
  imports source cache/materialization jobs, validates analysis decisions,
  builds a target package, obtains approval, uploads/submits, and reads back
  the target.

## Product Contract

### Handoff Run

A handoff run is the durable unit of work. It is not a provider conversation
clone. It is an evidence-backed transfer of enough context for the target
conversation to continue productively.

Required run properties:

- source endpoint: provider, AuraCall runtime profile, browser profile,
  account binding, source ref, and project ref when available;
- target endpoint: provider, AuraCall runtime profile, browser profile,
  account binding, target conversation/project intent, and capability posture;
- packet path under `~/.auracall/handoffs/<handoff_id>/`;
- phase ledger, event stream, approvals, model decisions, adapter calls,
  generated artifacts, and readback proof;
- explicit omissions and retryability;
- a clear target mutation boundary.

### Operator Modes

- `preview`: prepare packet, source evidence, analysis, and target package
  without target upload or submit.
- `approve-upload`: upload selected files to target but do not submit the
  primer/context prompt.
- `approve-submit`: upload selected files if needed, submit the primer/context,
  and read back the target response.
- `repair`: resume a failed or partial handoff from ledger state without
  repeating completed provider work unless forced.

Preview must remain the default. Upload and submit require a human approval
event or an explicit noninteractive policy stored in the run ledger.

## End-To-End Phases

### Phase 0 | Intake And Policy Resolution

Resolve source/target providers, AuraCall runtime profiles, browser profiles,
account bindings, source refs, target intent, run mode, budgets, and approval
policy.

Acceptance:

- invalid providers, missing explicit runtime profiles, or ambiguous target
  account bindings fail closed before provider work;
- packet path and run ledger are created before the first browser/API action;
- effective approval policy is persisted.

### Phase 1 | Source Discovery

Read source endpoint posture and identify the strongest available source read
path: existing packet inputs, account-mirror cache, conversation context
cache, history materialization, account-library materialization, or
provider-specific browser context read.

Acceptance:

- source capability report says which read/materialization paths are eligible;
- source account identity proof is recorded;
- provider guard/captcha states stop the run before repeated automation.

### Phase 2 | Source Cache And Materialization

Create or import bounded source context/materialization work. Existing job
readbacks are accepted; new provider work must be explicit, bounded, and
attributed to the handoff run.

Acceptance:

- context JSON, manifest, omissions, checksums, archive refs, and job ids are
  persisted;
- active source jobs are reused or read back rather than duplicated;
- source completeness state is `complete`, `partial`, or `not_cached` with
  reasons.

### Phase 3 | Source Verification Gate

Validate that source material is internally consistent before analysis.

Acceptance:

- every selected local file exists or is marked omitted;
- checksums and sizes match materialization readbacks when available;
- retryable omissions are separated from terminal omissions;
- source completeness below policy threshold stops target phases unless the
  operator explicitly approves continuing with partial context.

### Phase 4 | Analysis Input Assembly

Build a deterministic analysis input bundle from source context, manifest,
omissions, source capability report, target capabilities, budgets, and any
operator priorities.

Acceptance:

- analysis input references packet-relative paths and manifest item ids only;
- private payloads remain in user-scoped runtime storage;
- token/file-size budgets are computed before model analysis.

### Phase 5 | App Intelligence Analysis

Run an App Intelligence analysis worker under a host-owned schema. The worker
may rank artifacts, compact context, summarize source state, and recommend a
target primer. It must not execute uploads, submits, deletes, browser actions,
or config edits.

Required structured decision:

```json
{
  "object": "auracall.handoff-analysis-decision.v2",
  "selectedManifestItemIds": [],
  "compactContext": {},
  "targetPrimer": "",
  "omissionWarnings": [],
  "budgetFit": {
    "fits": true,
    "estimatedPromptTokens": 0,
    "selectedFileBytes": 0
  },
  "approvalRecommendation": "preview_only"
}
```

Acceptance:

- JSON schema validation passes;
- selected ids all exist in the manifest;
- compact context references omissions honestly;
- decisions that exceed target budgets fail into a repairable preview state.

### Phase 6 | Target Discovery

Resolve target endpoint identity, project/conversation intent, upload
capabilities, submit capability, target file limits, and provider guard state.

Acceptance:

- target account identity proof is recorded before any mutation;
- target project/conversation resolution is previewed with no submit;
- provider guard/captcha states stop the run before uploads.

### Phase 7 | Target Package Assembly

Write the target-ready package without mutation:

```text
target/
  package.json
  upload-manifest.json
  submission-plan.json
  primer.md
  compact-context.json
  selected-files/
```

Acceptance:

- every selected file is copied or linked into a packet-relative target package;
- upload order, expected filenames, mime types, sizes, and checksums are
  explicit;
- `targetMutationAllowed=false` remains true in preview mode;
- package digest is stable for replay.

### Phase 8 | Approval Gate

Require approval before upload and again before submit unless policy has
explicitly combined them.

Acceptance:

- approval event records actor, time, policy, run id, packet digest, target
  endpoint, selected files, and primer digest;
- stale approval is invalidated if target package digest changes;
- denial leaves packet in a terminal `approval_denied` or repairable
  `preview_ready` state.

### Phase 9 | Target Upload

Invoke the target provider adapter to upload selected files under an operation
lease owned by the handoff run.

Acceptance:

- upload attempts, provider file ids, local file ids, checksums, and failures
  are written to `target/submission-result.json`;
- partial upload failures are retryable without redoing source phases;
- uploaded artifacts are not submitted until submit approval exists.

### Phase 10 | Target Submit

Submit the target primer and compact context, attaching or referencing
uploaded files according to the target provider adapter.

Acceptance:

- submitted prompt digest, target conversation ref, provider message id when
  available, selected file ids, and submit timestamp are recorded;
- provider-specific UI/API evidence is normalized into the packet;
- failed submit preserves enough evidence for repair or manual completion.

### Phase 11 | Target Readback

Read the target response and cache the target conversation context back into
the handoff packet.

Acceptance:

- `target/readback.json` includes target conversation ref, response status,
  response excerpt/summary, provider message id when available, and cached
  context refs;
- the run can answer whether target received the handoff;
- omissions from the target side are explicit and retryable where possible.

### Phase 12 | Closeout, Replay, And Repair

Emit a final handoff summary and keep enough state to replay, audit, or resume
without relying on chat history.

Acceptance:

- final summary includes source completeness, selected artifact count, uploaded
  count, submit status, target readback status, omissions, and packet path;
- `handoff status <id>` and `handoff resume <id>` can operate from ledger
  state;
- repair can restart from source verification, analysis, target package,
  upload, submit, or readback as appropriate.

## App Intelligence Control Plane

App Intelligence owns:

- deterministic run state machine;
- ledger writes and event ordering;
- approval policy;
- schema validation for model decisions;
- adapter action allowlists per phase;
- budget checks and target mutation gates;
- repair/resume stop rules;
- replay log and final readback.

Provider adapters own:

- provider-native navigation/API details;
- identity readback;
- context extraction;
- materialization;
- upload;
- submit;
- target response readback.

Model workers own only bounded stochastic decisions:

- selecting and ranking artifacts;
- compacting source context;
- drafting target primer text;
- recommending whether the run should continue, stop, or ask for operator
  review.

Model output never directly mutates target services.

## Implementation Slices

### Slice 0115 | Handoff Run Ledger And Status

- Add a durable handoff run registry under `~/.auracall/handoffs`.
- Add `auracall handoff status <id> --json`.
- Make `prepare` write ledger events through the same registry instead of
  standalone packet writes.

### Slice 0116 | Source Job Orchestration

- Add explicit source cache/materialization orchestration to handoff preview.
- Reuse/import existing source jobs before creating new bounded jobs.
- Attribute provider work to handoff run id and expose source completeness
  gates.

### Slice 0120 | Analysis Decision Schema V2 And Package Preview

- Add schema-backed App Intelligence analysis decision validation.
- Separate deterministic packet assembly from model-generated ranking and
  compaction.
- Fail closed on invalid ids, budget overflow, or omission dishonesty.

- Build `target/package.json`, `upload-manifest.json`, selected file staging,
  primer, compact context, and stable package digest.
- Add preview command/readback that proves no target mutation.

### Slice 0121 | Approval And Target Upload

- Add approval event storage and target upload command path.
- Upload selected files with lease ownership, provider ids, and retryable
  failure evidence.
- Do not submit prompt in this slice unless a separate submit approval exists.

### Slice 0123 | Target Submit And Readback

- Add approval-gated target submit.
- Read back target conversation/response.
- Persist final result, target context refs, and repair state.

### Slice 0124 | Repair, Resume, And Manual Export

- Add `handoff resume`, `handoff repair`, and manual export bundle.
- Support resuming from target package, upload, submit, or readback.
- Add final export bundle for manual handoff if provider automation is blocked.

### Slice 0125 | Console Operator UX

- Add local API and console/operator surfaces for status, resume, repair, and
  export artifacts.
- Keep provider mutation disabled; operate only packet-owned deterministic
  artifacts.

### Slice 0126 | Live Provider Recovery

- Bridge deterministic resume plans to an explicit live recovery action where
  permitted.
- Write replayable live recovery evidence for blocked or executed recovery
  attempts.
- Keep approval gates explicit for any live target mutation.

### Slice 0127 | Provider-Native Handoff Adapters

- Add a target adapter contract behind the live recovery action.
- Attach provider-native upload, submit, and readback adapters through that
  contract.
- Keep provider-specific browser heuristics outside the handoff state machine.

### Slice 0128 | Provider-Native Browser Adapter Proof

- Wire the first provider-native submit/readback adapter to the target adapter
  contract.
- Prove an approved same-provider or cross-provider handoff submit/readback
  through the adapter contract.

### Slice 0129 | Provider-Native File Upload Proof

- Attach a provider-native file upload runner behind the target adapter
  contract.
- Prove approved selected-file transfer into provider file ids, successful
  submit/readback, and failed-upload retry gating with fixture evidence.

### Slice 0130 | ChatGPT Prompt Attachment Adapter

- Implement the first provider-specific prompt attachment adapter using the
  existing ChatGPT browser prompt submission surface.
- Prove selected packet files flow into ChatGPT browser attachments with the
  approved primer and compact context while preserving host-owned approvals.

### Slice 0131 | ChatGPT Browser Recovery Surface

- Expose the ChatGPT browser target adapter through CLI, HTTP, and console
  handoff recovery controls.
- Preserve `packet_target_adapter` as the default executor.
- Fail closed when ChatGPT browser recovery is requested without
  browser-capable resolved AuraCall config.

### Slice 0132 | Live Provider Upload Adapter Proof

- Run one bounded approved handoff against a real target profile with selected
  file transfer, submit, readback, and replayable provider evidence.
- Record whether ChatGPT prompt attachment is sufficient or whether another
  provider-specific upload surface is required.

## Critical Path

1. Ledger/status must land before orchestration so every provider action has a
   replayable owner.
2. Source orchestration must prove completeness before model analysis can be
   trusted.
3. Analysis schema V2 must land before approval-gated target mutation.
4. Target package preview must be stable before approvals can bind to a digest.
5. Upload and submit must remain separate gates until live proof shows combined
   approval is safe.

## Parallelizable Tracks

- Provider capability inventory can run alongside ledger implementation.
- Analysis schema fixtures can be built while source orchestration is added.
- Operator UX mockups can start once target package JSON is stable.
- Manual export bundle can be developed independently of target submit.

## Non-Goals

- Do not implement a provider-native 1:1 conversation clone.
- Do not make ChatGPT-specific account-library behavior the general contract.
- Do not enable broad automatic live-follow or account-library scheduling.
- Do not bypass provider guard/captcha states.
- Do not submit to a target without ledger-stored approval.
- Do not store tenant-private source payloads in tracked repo files.

## Validation Strategy

- Unit tests for packet schema, ledger state transitions, decision validation,
  package digest, and approval invalidation.
- CLI tests for prepare/status/resume/approval failure paths.
- Adapter fixture tests for source context/materialization readback and target
  upload/submit readback normalization.
- Dry-run integration test for ChatGPT -> Gemini and same-provider
  cross-profile handoff with zero target mutation.
- One installed manual smoke per provider pair before enabling target mutation
  paths by default.

## Exit Criteria

Close this parent plan only when the full preview, approval, upload, submit,
readback, and repair workflow is installed behind explicit gates and validated
with at least one same-provider cross-tenant handoff and one cross-service
handoff. Individual implementation slices should close independently as they
ship.
