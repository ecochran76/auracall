# Cross-Service Context Handoff Plan | 0111-2026-06-05

State: CLOSED
Lane: P01

## Purpose

Design the provider-neutral workflow for moving useful context from one
conversation/account/service into another without pretending a 1:1 provider
copy is possible. The durable unit is a supervised handoff packet: source
conversation context, materialized files/artifacts, provenance, omissions, an
analysis-selected target seed, and target readback proof.

This plan is intentionally cross-tenant and cross-service. ChatGPT Business to
ChatGPT Pro is the first motivating example, but the architecture must also
support provider pairs such as ChatGPT -> Gemini, Gemini -> ChatGPT, Grok ->
ChatGPT, and same-provider cross-account transfers when each side has a valid
AuraCall runtime profile and account binding.

## Current State

- AuraCall already has account-mirror, history-materialization, archive, and
  provider/browser automation foundations for ChatGPT and Gemini, with Grok
  provider work available through existing browser/API surfaces.
- Recent work made source materialization more truthful by separating
  conversation-history retrieval from account-library retrieval and by keeping
  provider work bounded and attributable.
- App Intelligence integration already exists as a downstream consumer pattern
  for tenant/model/project binding choices, but AuraCall does not yet own a
  first-class handoff workflow or packet schema.
- There is no provider-neutral contract that says:
  - which source context was fully cached;
  - which artifacts were materialized locally;
  - which artifacts matter most for a target conversation;
  - which target files/context were submitted;
  - which omissions or provider limitations remain.

## Scope

- Define the provider-neutral handoff model:
  - source endpoint: provider, AuraCall runtime profile, browser profile,
    account binding, source conversation/project/ref, and optional source
    account-mirror key;
  - target endpoint: provider, AuraCall runtime profile, browser profile,
    account binding, target project/conversation intent, and upload/submit
    capabilities;
  - handoff packet: normalized context JSON, materialized files, archive
    references, ranked target seed artifacts, compact prompt/context JSON,
    omissions, and verification evidence.
- Define the App Intelligence supervisor choreography:
  - deterministic host-owned run ledger;
  - phase state machine;
  - structured model decisions for ranking and compaction;
  - policy gates before source browser work, target upload, and target submit;
  - replayable event log and artifact registry.
- Specify the first implementation slice as a dry-run packet builder that does
  not mutate the target provider.
- Preserve tenant privacy:
  - private payloads and downloaded artifacts stay under user-scoped AuraCall
    runtime storage;
  - repo docs describe schemas and workflows, not tenant-private content.

## Non-Goals

- Do not attempt a byte-for-byte provider conversation clone.
- Do not rely on one provider's internal IDs as the cross-service contract.
- Do not enable broad automatic account-library or live-follow modes as part
  of the first handoff slice.
- Do not mutate the target conversation until source completeness, analysis
  output, and target identity/capability checks have passed.
- Do not let model output directly perform uploads, submissions, config edits,
  browser navigation, or file deletion. The host validates structured
  decisions, then invokes AuraCall adapters.

## Architecture

### Handoff Endpoint

Each endpoint is resolved as:

```json
{
  "provider": "chatgpt",
  "runtimeProfileId": "default",
  "browserProfileId": "default",
  "accountBindingKey": "binding:chatgpt:default:default",
  "accountMirrorTenantKey": "service-account:chatgpt:<identity>",
  "conversationRef": "https://provider.example/conversation-or-project-ref",
  "projectRef": null,
  "capabilities": {
    "readConversationContext": true,
    "materializeArtifacts": true,
    "uploadFiles": true,
    "submitMessage": true,
    "readTargetResponse": true
  }
}
```

Provider adapters own how these fields map to real routes, DOM surfaces, API
calls, and materialization commands. The handoff supervisor only consumes the
normalized capability contract and evidence.

### Handoff Packet

The durable packet should live under user-scoped runtime state, for example:

```text
~/.auracall/handoffs/<handoff_id>/
  run.json
  events.jsonl
  source/
    context.json
    manifest.json
    omissions.json
    files/
    artifacts/
  analysis/
    input-index.json
    selected-target-seed.json
    compact-context.json
    target-primer.md
    decision.json
  target/
    submission-plan.json
    submission-result.json
    readback.json
```

The packet schema must preserve:

- provider-neutral identifiers;
- provider-native source refs;
- local artifact refs and checksums;
- source completeness state;
- materialization method and surface;
- ranking/selection rationale;
- target upload/submission evidence;
- explicit omissions with retryability.

### App Intelligence Supervisor

App Intelligence should supervise the workflow as a deterministic state
machine:

1. `discover_source`: resolve source provider/account binding and read-only
   capability posture.
2. `cache_source`: run bounded source context/cache/materialization work.
3. `verify_source`: emit completeness, omissions, checksums, and retry gates.
4. `analyze`: use structured model output to rank artifacts, compact context,
   and prepare a target primer.
5. `discover_target`: resolve target provider/account binding and upload/submit
   capabilities.
6. `preview_target`: produce a dry-run target submission plan with file count,
   size, context, and omissions.
7. `submit_target`: only after approval or explicit noninteractive policy, use
   AuraCall to upload selected files and submit the primer/context.
8. `verify_target`: read the target conversation response and cache the target
   context back into the handoff packet.

The supervisor owns phase, allowed actions, approvals, ledger, and stop rules.
AuraCall adapters execute bounded provider operations. Structured model calls
only produce decisions such as artifact ranking, context compaction, and target
submission recommendations.

## Work Tracks

### Track 1 | Provider-Neutral Handoff Schema

Status: completed.

- Define `handoff_run`, `handoff_endpoint`, `handoff_packet`,
  `handoff_manifest_item`, `handoff_omission`, `handoff_analysis_decision`,
  and `handoff_submission_plan` shapes.
- Align artifact refs with existing archive/materialization records instead of
  inventing a parallel file store.
- Include deterministic packet versioning from the first slice.

Acceptance evidence:

- A dry-run fixture can represent ChatGPT -> ChatGPT, ChatGPT -> Gemini, and
  Gemini -> ChatGPT without provider-specific top-level fields.

### Track 2 | Source Completeness Gate

Status: completed.

- Resolve one source endpoint and prove identity before browser work.
- Cache conversation context through the provider's strongest available read
  path.
- Materialize source uploads/files/artifacts through bounded explicit
  materialization calls.
- Emit completeness and omissions without target mutation.

Acceptance evidence:

- A source-only handoff packet reports message/context counts, materialized
  file/artifact counts, checksums, and retryable versus terminal omissions.

### Track 3 | App Intelligence Analysis Gate

Status: completed.

- Build the structured analysis input from `context.json` and `manifest.json`.
- Ask the analysis worker for schema-validated output:
  - ranked selected artifacts;
  - compact context JSON;
  - target primer prompt;
  - omitted-but-important warnings;
  - upload budget fit.
- Reject malformed or policy-invalid decisions before any target action.

Acceptance evidence:

- Analysis output is valid JSON, points only at manifest item ids, and produces
  a target seed that can be previewed without provider access.

### Track 4 | Target Preview And Submission

Status: completed.

- Resolve target endpoint and verify target account binding.
- Discover target upload and submit capabilities.
- Produce a target preview plan before uploads.
- Gate real upload/submission behind explicit policy approval.
- Cache target readback after submission.

Acceptance evidence:

- The first live target proof creates a target conversation or appends to a
  selected target conversation, uploads only selected artifacts, submits the
  compact context, and records readback proof.

## First Implementation Slice

Open the first implementation slice as source-only and dry-run:

- command/API shape:
  - `auracall handoff prepare --source-provider <provider>
    --source-profile <runtimeProfile> --source-ref <conversation-or-project-ref>
    --target-provider <provider> --target-profile <runtimeProfile> --dry-run
    --json`
- behavior:
  - resolve source and target endpoints;
  - verify source identity and target identity/capability posture if available;
  - run bounded source cache/materialization only;
  - write a handoff packet;
  - run analysis to produce target preview artifacts;
  - do not upload or submit anything to the target.
- proof:
  - packet path;
  - source completeness;
  - analysis decision validation;
  - target preview summary;
  - zero target browser mutations.

## Exit Criteria

- Plan 0111 can close when AuraCall has a documented provider-neutral handoff
  contract and the first dry-run packet builder proves one source conversation
  can become an auditable target preview without target mutation.
- A follow-up plan should then implement the first approved target submission
  proof for a specific source/target pair.

## Closeout

Closed as **Dry-Run Handoff Packet Builder Installed**.

- `src/handoff/service.ts` defines the provider-neutral handoff endpoint,
  packet, manifest item, omission, analysis decision, submission plan, and run
  record shapes.
- `src/cli/handoffCommand.ts` provides the CLI wrapper and summary formatter.
- `auracall handoff prepare` is registered as a top-level command and currently
  requires `--dry-run` so target upload/submit cannot happen in this slice.
- The packet writer creates:
  - `run.json`;
  - `events.jsonl`;
  - `source/context.json`;
  - `source/manifest.json`;
  - `source/omissions.json`;
  - `analysis/input-index.json`;
  - `analysis/selected-target-seed.json`;
  - `analysis/compact-context.json`;
  - `analysis/target-primer.md`;
  - `analysis/decision.json`;
  - `target/submission-plan.json`;
  - `target/submission-result.json`;
  - `target/readback.json`.
- The dry-run submission plan records `targetMutationAllowed=false`,
  `uploadAttemptCount=0`, and `submitAttemptCount=0`.
- Explicit missing source/target runtime profiles fail closed instead of
  falling back to the active profile.
- README now documents the preview-only command and packet posture.

Validation:

- `pnpm vitest run tests/cli/handoffCommand.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome lint src/handoff/service.ts src/cli/handoffCommand.ts tests/cli/handoffCommand.test.ts bin/auracall.ts`
- `pnpm tsx bin/auracall.ts handoff prepare --help`
