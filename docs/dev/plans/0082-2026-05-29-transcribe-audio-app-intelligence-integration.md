# Transcribe-Audio App Intelligence Integration Plan | 0082-2026-05-29

State: CLOSED
Lane: P01

## Purpose

Make AuraCall the source of truth for the provider account, execution binding,
model selector, project binding, and agent choices that `transcribe-audio`
uses for App Intelligence and first-pass readout workflows.

The integration should let `transcribe-audio` select stable AuraCall
`agentId` values and validated dispatch-pool teams instead of recreating
ChatGPT tenant, browser binding, model, and project selection logic in
transcribe-audio config files.

## Current State

- Plan 0076 is closed and AuraCall exposes tenant-centered agent choice
  readback through `GET /v1/config/agent-choices`.
- AuraCall effective agents now expose `tenantKey`, `bindingId`, `bindingKey`,
  `runtimeProfileId`, `browserProfileId`, `service`, `modelSelector`,
  compatibility model/project fields, structured `projectBinding`, and
  per-agent validation.
- Plans 0077 through 0080 are closed for the greenfield AuraCall `/console`
  sequence. The existing legacy frontend pages remain frozen.
- Plan 0081 is closed and the roadmap now names downstream `transcribe-audio`
  App Intelligence integration as the next primary implementation lane.
- `transcribe-audio` already has AuraCall-backed first-pass summary batch
  tooling. Its current README describes:
  - `scripts/auracall_legacy_enrichment_batch.py`;
  - a project-bound `Transcripts` client env;
  - `AURACALL_DISPATCH_TEAM` for batch dispatch-pool routing;
  - prepare/enqueue/status/materialize flows;
  - `check_readout_quality.py` as the quality gate before scaling.
- `transcribe-audio` also has local App Intelligence run ledgers, preflight
  endpoints, prompt-packet review, send gates, structured-decision validation,
  and human-review gates under `/api/intelligence/...`.
- Implemented: AuraCall `GET /v1/config/agent-choices` now includes effective
  teams from the registry-backed catalog, not only file-backed teams.
- Implemented: `transcribe-audio` has a redacted AuraCall choices readiness
  reader that records selected agent/team ids, binding readiness,
  dispatch-pool membership, route links, and secret-free API-key posture.
- Implemented: first-pass summary prepare/enqueue prefers
  `AURACALL_AGENT_ID` for single-agent runs and preserves
  `AURACALL_DISPATCH_TEAM` for dispatch-pool routing.
- Live readback after reinstall/restart proved the scoped transcribe key can
  read `transcribe-audio-chatgpt-pro-pool` with three ready members.

## Scope

- Define the AuraCall-to-transcribe-audio contract for:
  - agent choice discovery;
  - selected `agentId` persistence;
  - dispatch-pool team selection;
  - project-bound `Transcripts` readiness;
  - scoped API key use;
  - batch/run status readback links.
- Add the smallest AuraCall readback refinements needed if the current
  `agent-choices` contract cannot prove the required transcribe-audio
  readiness checks.
- Implement the `transcribe-audio` consumer side so first-pass summary and App
  Intelligence workflows can fetch AuraCall choices and store stable agent/team
  ids.
- Preserve existing dry-run, preview, approval-token, and materialization gates
  in `transcribe-audio`.
- Add one bounded end-to-end smoke:
  - fetch AuraCall choices;
  - select the configured transcript agent or dispatch-pool team;
  - prepare a first-pass summary manifest without submitting provider work;
  - submit one reviewed item only after the manifest/readiness checks pass;
  - materialize the result and run the readout quality gate.
- Update both repos' durable planning/runbook surfaces if this slice modifies
  `transcribe-audio`.

## Non-Goals

- Do not move transcript prompts, transcript artifacts, readout schemas, or App
  Intelligence ledgers into AuraCall.
- Do not store raw transcript text, prompt packets, readout bodies, or private
  transcript paths in AuraCall planning docs.
- Do not change, restyle, or extend AuraCall legacy frontend pages:
  `/dashboard`, `/agents`, `/config`, or `/ops/browser`.
- Do not add broad AuraCall run controls such as launch, retry, cancel, resume,
  pause, or drain in this plan.
- Do not enable unattended external writes from transcribe-audio App
  Intelligence decisions.
- Do not broaden provider support beyond the configured transcript-focused
  AuraCall agents unless a later plan selects that work.

## Product Contract

`transcribe-audio` should treat AuraCall as the provider execution registry:

- store stable `agentId` and optional dispatch-pool team ids;
- display provider account, binding, model selector, and project binding from
  AuraCall readback;
- treat invalid or not-ready AuraCall bindings as blocking preflight state;
- use explicit override fields only for exceptional runs;
- keep transcript payload construction, readout schema validation,
  materialization, and quality gates inside `transcribe-audio`.

AuraCall should not need to understand transcript-specific prompts or private
artifact paths. Its responsibility is to expose truthful execution choices and
run/readback surfaces.

## Implementation Tracks

### Track 1 | Contract Audit

Status: closed.

- Compare `GET /v1/config/agent-choices` against the transcribe-audio
  requirements for first-pass summaries and App Intelligence model turns.
- Verify whether current readback can identify:
  - transcript-capable agents;
  - dispatch-pool team members;
  - project-bound `Transcripts` readiness;
  - scoped API key posture;
  - invalid/not-ready browser bindings;
  - related AuraCall run/status links.
- Closed contract gap: effective teams are now projected in
  `agent-choices`, including registry-backed dispatch-pool teams.

### Track 2 | Transcribe-Audio Choice Consumer

Status: closed.

- Add a transcribe-audio AuraCall choices client that reads the configured
  AuraCall base URL and scoped API key from user-scoped config or environment.
- Add redacted readiness/readback to the transcript API or config layer so the
  review console can show selected AuraCall agent/team readiness without
  exposing secrets.
- Keep preview endpoints non-mutating: choice fetches may read AuraCall, but
  must not start provider browser work.

### Track 3 | First-Pass Summary Batch Integration

Status: closed.

- Update first-pass summary prepare/enqueue logic to prefer stable AuraCall
  `agentId` and dispatch-pool team ids from the choices contract.
- Keep manifest preparation dry-run by default.
- Require the existing submit approval token before provider work starts.
- Materialize completed AuraCall responses back into
  `*.readout.json` / `*.readout.md` through the existing transcribe-audio
  status/materialize flow.
- Run `check_readout_quality.py` before widening batch size.

### Track 4 | App Intelligence Integration

Status: closed.

- Connect transcribe-audio App Intelligence provider/model routing to selected
  AuraCall agents where the workflow asks for AuraCall-backed reasoning.
- Keep App Intelligence run ledgers, prompt-packet review, send-preflight,
  structured-decision validation, and human-review gates in transcribe-audio.
- Record AuraCall run ids, response ids, batch ids, selected agent ids, and
  quality-gate results in local transcribe-audio ledgers without embedding raw
  transcript text in AuraCall.

### Track 5 | Validation And Handoff

Status: closed.

- Add focused tests for the AuraCall choices consumer and readiness projection.
- Add or update tests for first-pass summary manifest preparation using
  `agentId` / dispatch team choices.
- Run AuraCall validation for any changed AuraCall contract:
  - targeted config-choice/API tests;
  - `pnpm run typecheck`;
  - `pnpm run plans:audit -- --keep 82`;
  - `git diff --check`.
- Run transcribe-audio validation for app-side changes:
  - Python compile checks for changed modules;
  - focused pytest coverage for API/config/batch preparation;
  - readout quality gate for any live materialized smoke.
- Record the final evidence in both repos when both repos are touched.

## Closeout Evidence

- AuraCall contract:
  - `agent-choices` now projects `teams` from the effective registry catalog.
  - Regression coverage verifies registry-backed teams appear in choices.
- Transcribe-audio consumer:
  - added `auracall_choices.py`;
  - first-pass prepare/enqueue manifests include `auracall_readiness`;
  - `/api/intelligence/config` exposes the same redacted readiness.
- Installed-runtime proof:
  - rebuilt and installed the user AuraCall runtime;
  - restarted `auracall-api.service`;
  - restored registry team `transcribe-audio-chatgpt-pro-pool` through the
    operator config API without provider/browser project work;
  - scoped choices readback returned 48 agents, 15 teams, and the transcript
    dispatch-pool team with three members;
  - dry-run prepare wrote
    `/tmp/auracall-plan-0082-readiness-prepare.json` with
    `auracall_readiness.ok=true`, no warnings, and no provider submission.
- Live provider submit/materialize was not run because
  `transcript_store.py first-pass-summary-queue --format compact-json --limit 5`
  returned zero queued first-pass items. The existing approval-token and
  materialization paths remain covered by focused API tests.

## Acceptance Criteria

- AuraCall remains the authoritative source for service, tenant, binding, model
  selector, project binding, effective agent, and validation choices.
- `transcribe-audio` can fetch AuraCall choices through configured local API
  access without storing or displaying secrets.
- `transcribe-audio` persists stable `agentId` and optional dispatch-pool team
  ids rather than copying provider-specific tenant/browser/model/project
  internals.
- First-pass summary prepare remains dry-run and records the selected
  AuraCall agent/team choices in the manifest.
- Submit/provider work still requires the existing approval token.
- One reviewed first-pass summary smoke can materialize a readout and pass the
  quality gate before any batch-size increase.
- App Intelligence ledgers record AuraCall ids and quality evidence, but not
  raw transcript text in AuraCall docs or config.
- AuraCall legacy frontend pages remain unchanged.

## Validation Plan

AuraCall validation:

- `pnpm vitest run tests/config/agentConfigService.test.ts --maxWorkers 1 --testNamePattern "choices|tenants|bindings|projects|agents"`
- `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "agent tenant|agent choices"`
- `pnpm run typecheck`
- `pnpm run plans:audit -- --keep 82`
- `git diff --check`

Transcribe-audio validation:

- `python -m py_compile` for changed Python modules.
- Focused `.venv/bin/python -m pytest` tests for AuraCall choice config,
  transcript API readiness, and first-pass summary manifest preparation.
- One dry-run first-pass summary prepare against configured AuraCall choices.
- One reviewed single-item submit/materialize/quality-gate smoke only after the
  dry-run manifest and readiness checks pass.

## Definition Of Done

- Plan 0082 is wired into `ROADMAP.md` and `RUNBOOK.md`.
- AuraCall choice/readiness contract gaps are either closed or explicitly
  recorded as follow-up.
- `transcribe-audio` consumes AuraCall agent choices for the selected
  first-pass/App Intelligence workflow.
- Existing preview/apply and approval-token boundaries remain intact.
- Required validations pass in every touched repo.
- Plan 0082 is updated with implemented evidence and closed.
