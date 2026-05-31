# Gemini Bounded Artifact Catch-Up Plan | 0089-2026-05-31

State: OPEN
Lane: P01

## Purpose

Move `gemini/auracall-gemini-pro` from one-off proof retrieval into a bounded
catch-up batch for retrievable conversation artifacts. Plans 0087 and 0088
proved the core prerequisites: Gemini project/Gem discovery is clean, selected
conversation artifact retrieval can materialize a checksum-bearing local asset,
queued history-materialization jobs now advance through the normal installed
API path, malformed Gemini conversation targets are rejected before browser
work, and search conversation rows now reflect materialized artifact freshness.

This plan executes the next safe scale step: a capped Gemini catch-up batch
with baseline counts, terminal per-candidate evidence, after counts, and hard
provider-guard stop rules.

## Current State

- `gemini/auracall-gemini-pro` project/Gem discovery remains clean:
  - project manifest count is `0`;
  - Google/third-party catalog Gems such as `chess-champ`, `brainstormer`, and
    `storybook` are not valid project/history targets.
- Plan 0087 proved selected conversation `8e8e58b57ae544ea` can refresh
  routeably and materialize `Before The Tide Returns` with local path and
  SHA-256 evidence.
- Plan 0088 proved installed API job dispatch for Gemini materialization:
  - job `hmj_f276983d378c494a83a5d685b683fbf7` advanced from `queued` to
    terminal `succeeded` without direct service invocation;
  - archive/search and the account-mirror conversation row now agree on
    `assetFreshness.materializationJobId`.
- The remaining Gemini work is not metadata-only waiting. It is bounded
  retrieval and classification of still-deferred or missing-local Gemini
  conversation assets.
- Broad unattended catch-up has not been proven. The next run must stay capped
  and produce before/after counts before raising the scale.

## Root Cause Summary

Gemini artifact retrieval now has working dispatch, candidate hygiene, and
conversation-level readback, but the account mirror still contains cached
conversation rows whose asset inventory is unknown, deferred, or not yet
reconciled to local files. A safe catch-up step needs to convert a small
candidate set into concrete outcomes: materialized with checksum, no
downloadable assets, route miss, provider guard, unsupported surface, skipped,
or failed with actionable reason.

## Scope

- Build a fresh installed baseline for `gemini/auracall-gemini-pro`:
  - active live-follow completion state;
  - provider guard/readiness state;
  - account-mirror catalog counts;
  - recovery-candidate counts;
  - current generated-artifact/search availability counts;
  - active or queued history-materialization jobs.
- Select a deterministic catch-up batch from valid Gemini conversation
  candidates only.
- Run one bounded materialization batch through the installed API path with:
  - `provider=gemini`;
  - `runtimeProfile=auracall-gemini-pro`;
  - `refreshSnapshot=true`;
  - `assetKinds=[all]`;
  - conservative `maxItems`;
  - no project/Gem URLs.
- Poll to terminal state and record per-candidate outcome evidence.
- Compare before/after archive/search/recovery counts and document what
  changed.
- Define the next scale gate from evidence rather than assuming all
  retrievable artifacts will catch up automatically.

## Non-Goals

- Do not run an unbounded Gemini catch-up campaign.
- Do not target Gemini project/Gem URLs.
- Do not visit, recreate, edit, or mutate Gemini Gems or conversations.
- Do not cycle through Google-made or third-party Gems.
- Do not bypass provider guard, CAPTCHA, Google `sorry`, account chooser,
  browser queue ownership, cooldown, or foreground-yield rules.
- Do not change the retired frontend.
- Do not broaden to ChatGPT, Grok, or other providers.
- Do not claim all retrievable Gemini artifacts are caught up unless the
  after-counts prove that state.

## Architecture Boundaries

- Candidate selection belongs to account-mirror/catalog/recovery readback plus
  Gemini canonical target validation.
- Retrieval belongs to durable history-materialization jobs created through the
  installed API/CLI path.
- Provider browser work must remain explicit, bounded, and stop-on-guard.
- Cache-only readback must remain browser-free.
- Search/archive/account-mirror readback is the operator evidence surface for
  materialized, skipped, failed, and still-deferred outcomes.
- Broad live-follow policy changes are out of scope unless this bounded batch
  exposes a narrow defect that blocks the proof.

## Implementation Tracks

### Track 1 | Installed Baseline

Status: planned.

- Read active Gemini live-follow completion status and provider guard state.
- Read account-mirror catalog metrics for projects and conversations.
- Read Gemini recovery candidates and classify:
  - already materialized;
  - remote-known missing local;
  - unknown/deferred asset inventory;
  - terminal skipped/failed evidence;
  - invalid targets rejected by Plan 0088 hygiene.
- Read current search/archive generated-artifact availability counts.
- Confirm no active or queued Gemini history-materialization job conflicts
  with the batch.

### Track 2 | Candidate Selection

Status: planned.

- Select a capped deterministic batch of valid conversation targets.
- Prefer candidates with evidence of missing local assets or stale/deferred
  asset inventory.
- Exclude:
  - non-canonical Gemini URLs;
  - sign-in redirects;
  - static app/download/settings/Gem/catalog routes;
  - already-materialized proof conversation unless it is needed as a control;
  - duplicate-title rows where the intended proof would be ambiguous.
- Record the selected ids, provider URLs, selection reason, and expected
  outcome class before execution.

### Track 3 | Bounded Retrieval Execution

Status: planned.

- Create one installed API history-materialization job for the selected batch.
- Use `refreshSnapshot=true`, `assetKinds=[all]`, and a conservative item cap.
- Poll through normal API readback to terminal state.
- Stop immediately if Gemini shows CAPTCHA, Google `sorry`, account chooser,
  provider guard, wrong-account state, or browser queue ownership conflict.
- Do not invoke the compiled materialization service directly.

### Track 4 | Evidence Reconciliation

Status: planned.

- For each attempted conversation, record:
  - routeability state;
  - detail refresh state;
  - artifact/file/media counts;
  - materialized local path and checksum, if any;
  - archive item id and asset route, if any;
  - terminal skip/failure reason, if any.
- Verify search/archive/account-mirror conversation readback agree for
  materialized targets.
- Verify still-deferred targets remain honestly marked as deferred or unknown.
- Record before/after counts for:
  - available Gemini generated artifacts;
  - missing-local or recovery-candidate counts;
  - unknown/deferred Gemini asset inventory;
  - active/queued/succeeded/failed/skipped materialization jobs.

### Track 5 | Next Scale Gate

Status: planned.

- Decide the next Gemini step from the after-counts:
  - repeat another capped batch;
  - raise the cap modestly;
  - fix a provider/readback defect;
  - pause for operator/manual browser clearance.
- Update roadmap/runbook/dev-journal with the selected next gate.

## Acceptance Criteria

- Plan 0089 is wired into `ROADMAP.md`, `RUNBOOK.md`, and
  `docs/dev/dev-journal.md`.
- Installed baseline captures Gemini project count, conversation count,
  recovery-candidate counts, artifact availability counts, provider guard
  state, and active materialization job state before execution.
- Candidate selection includes only canonical Gemini conversation targets and
  records why each candidate was selected.
- One bounded installed Gemini materialization batch is created through the
  normal API path and reaches terminal state, or stops on a documented provider
  guard/human-verification blocker.
- Every attempted candidate has terminal evidence:
  - materialized with local path/checksum;
  - no downloadable assets;
  - route miss;
  - skipped/unsupported;
  - failed with actionable reason;
  - or blocked by provider guard with exact unblocker.
- Search/archive/account-mirror readback agree for materialized targets.
- Before/after counts show whether available artifacts increased, missing-local
  counts dropped, or deferred inventory was terminally classified.
- No Google/third-party Gem URL such as `chess-champ`, `brainstormer`, or
  `storybook` is visited.

## Validation Plan

- Read-only baseline:
  - `auracall api mirror-completion-status <active-gemini-completion> --json`
  - `auracall api mirror-recovery-candidates --provider gemini --runtime-profile auracall-gemini-pro --json`
  - `auracall api search --provider gemini --runtime-profile auracall-gemini-pro --json`
  - `auracall api archive --provider gemini --runtime-profile auracall-gemini-pro --json`
  - `auracall api history-materialization-jobs --provider gemini --runtime-profile auracall-gemini-pro --json`
- Bounded execution:
  - installed `history-materialization-create` through the normal API path;
  - normal API polling to terminal state.
- Post-run proof:
  - search/archive/account-mirror readback for attempted ids;
  - local path/checksum verification for materialized files;
  - recovery-candidate before/after count comparison.
- Static/doc gates if code or docs change:
  - targeted tests for any changed code;
  - `pnpm run typecheck` when TypeScript changes;
  - targeted `biome lint` for touched code/docs if applicable;
  - `pnpm run plans:audit -- --keep 89`;
  - `git diff --check`.

## Definition Of Done

- The bounded Gemini catch-up batch has terminal evidence for every selected
  candidate or an exact provider/browser unblocker.
- Before/after counts are recorded in this plan and in `RUNBOOK.md`.
- Materialized assets, if any, have local path and SHA-256 evidence visible
  through archive/search/account-mirror readback.
- Remaining Gemini work is expressed as a concrete next gate, not a vague
  broad catch-up assumption.
- If any provider guard, CAPTCHA, account chooser, or Google `sorry` page
  appears, automated retries stop and the plan records the exact manual
  clearance needed before continuation.
