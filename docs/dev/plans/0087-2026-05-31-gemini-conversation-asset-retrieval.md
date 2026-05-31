# Gemini Conversation Asset Retrieval Plan | 0087-2026-05-31

State: CLOSED
Lane: P01

## Purpose

Move `gemini/auracall-gemini-pro` from clean project/Gem discovery into
conversation-level asset confidence and bounded full retrieval. Plans 0086 and
the follow-up fixes proved the full-retrieval machinery, blocked Google
catalog Gems at discovery, and pruned stale project manifests from the
account-mirror cache. This plan proves whether Gemini conversation rows can now
be refreshed, classified, and materialized without cycling through non-editable
Gems or staying in deferred inventory.

## Current State

- `chatgpt/wsl-chrome-3` is no longer metadata-only and has live
  checksum-bearing artifact proof from Plan 0086.
- Gemini project/Gem discovery is clean:
  - `/home/ecochran76/.local/bin/auracall --profile auracall-gemini-pro projects --target gemini --refresh --operation-timeout 30`
    returned `[]`.
  - the active Gemini live-follow operation
    `acctmirror_completion_3c4a84b7-15b2-4db8-8814-b83164302580` completed a
    post-install refresh with `metadataCounts.projects=0`,
    `retainedFromCache.projects=0`, and `remainingDetailSurfaces.projects=0`.
  - direct account-mirror catalog readback for `kind=projects` returned
    `projectManifestCount=0` and `projectIds=[]`.
- Gemini live follow still reports retained cached conversations and deferred
  asset inventory:
  - `metadataCounts.conversations=71`;
  - `retainedFromCache.conversations=71`;
  - `remainingDetailSurfaces.conversations=71`;
  - asset inventory is `deferred` because no conversation detail surface was
    scanned in the latest pass.
- The last bounded Gemini materialization handoff
  `hmj_b54ef2af39384caaa7748b9a0871b8bc` reached terminal `skipped` after
  refreshing one routeable conversation with no downloadable assets.
- Older Gemini history-materialization jobs prove the provider can materialize
  real assets when the selected conversation contains fetchable surfaces, but
  the current active follower needs a bounded confidence pass before broad
  retrieval is trusted.

## Root Cause Summary

Gemini is no longer blocked by project/Gem pollution, but its current
account-mirror posture is still conversation-cache heavy. Recent refreshes
retained cached conversations without scanning conversation detail, so the
system cannot distinguish no-assets, downloadable assets, unsupported assets,
or routeability failures for the remaining 71 conversations. Full retrieval can
only be trusted after a bounded detail pass turns deferred inventory into
concrete per-conversation evidence.

## Scope

- Build a fresh Gemini baseline from installed API/CLI readback:
  - active completion status;
  - account-mirror catalog metrics;
  - recovery-candidate counts;
  - history-materialization job state;
  - provider guard state.
- Select a small, deterministic Gemini conversation batch from cached
  conversations or recovery candidates.
- Run bounded reconciliation/materialization with:
  - `provider=gemini`;
  - `runtimeProfile=auracall-gemini-pro`;
  - `refreshSnapshot=true`;
  - `assetKinds=[all]`;
  - conservative `maxItems` such as `1` to `3`;
  - no direct project/Gem targets.
- Record routeability, detail refresh, asset counts, skip reasons, failure
  reasons, manifest paths, local paths, checksums, and archive/search readback.
- Update operator docs/readback if a gap is found in how Gemini detail
  confidence or terminal skip/failure states are surfaced.

## Non-Goals

- Do not recreate or edit Gemini Gems.
- Do not use Google-made or third-party Gem URLs as project/history targets.
- Do not mutate provider conversations or submit prompts.
- Do not run an unbounded Gemini materialization campaign in this slice.
- Do not bypass provider guard, CAPTCHA, Google `sorry`, account chooser,
  cooldown, browser-operation queue, or foreground-yield rules.
- Do not change the retired frontend.
- Do not broaden to other providers unless needed for readback comparison.

## Architecture Boundaries

- Project/Gem discovery remains provider-adapter owned and editability scoped.
- Project manifest pruning remains account-mirror refresh owned and only treats
  non-truncated project scans as authoritative.
- Conversation detail and materialization stay in the account-mirror
  completion/reconciliation/history-materialization path.
- Browser work must use the configured `auracall-gemini-pro` runtime and
  `gemini-stealthcdp` browser binding.
- Cache-only catalog/search reads must remain browser-free; provider work must
  be explicit through completion or materialization jobs.

## Implementation Tracks

### Track 1 | Baseline And Candidate Selection

Status: completed.

- Read active Gemini completion status and confirm:
  - no project/Gem rows remain;
  - provider guard is clear;
  - no conflicting Gemini history-materialization job is already active.
- Read account-mirror catalog and recovery candidates for Gemini.
- Identify one to three candidate conversation ids with the highest retrieval
  value:
  - known or suspected asset evidence first;
  - otherwise oldest deferred detail rows first;
  - avoid duplicate-title media ambiguity unless the run is explicitly proving
    duplicate skip behavior.

### Track 2 | Bounded Detail Refresh

Status: completed.

- Queue one explicit history-materialization reconciliation or selected
  conversation batch with `refreshSnapshot=true` and a small `maxItems`.
- Prefer rail/app route reuse paths and avoid repeated direct `/app/<id>`
  navigation unless route validation is explicitly needed.
- Stop immediately on Google `sorry`, CAPTCHA, account chooser, or
  human-verification evidence.
- Poll the job to terminal state and capture per-conversation
  `snapshotRefreshes`.

### Track 3 | Retrieval And Evidence Reconciliation

Status: completed.

- For each attempted conversation, classify the outcome:
  - materialized;
  - routeable but no downloadable assets;
  - route miss/bare `/app`;
  - provider guard;
  - unsupported surface;
  - duplicate/ambiguous media evidence;
  - fetch failure.
- Verify any successful materialization through:
  - manifest path existence;
  - archive item readback;
  - search row asset availability;
  - local path;
  - checksum/cache key.
- Verify skipped or failed targets are visible as terminal evidence, not hidden
  as deferred inventory.

### Track 4 | Operator Readback And Next Gate

Status: completed.

- Confirm CLI/API/MCP/console readback expose the same Gemini posture:
  - remaining deferred conversations;
  - attempted/terminalized conversations;
  - materialized/skipped/failed counts;
  - provider guard state.
- If readback cannot explain the outcome without raw log spelunking, open a
  narrow implementation follow-up before expanding the run.
- Define the next safe scale gate for Gemini:
  - a second bounded batch;
  - a full-retrieval policy change;
  - or a provider-specific hardening slice.

## Acceptance Criteria

- [x] Plan 0087 is wired into `ROADMAP.md` and `RUNBOOK.md`.
- [x] Installed baseline proves Gemini project manifests remain empty before
  retrieval starts.
- [x] A bounded Gemini detail/materialization run reaches terminal state without
  cycling through `chess-champ`, `brainstormer`, `storybook`, or any other
  Google/third-party Gem.
- [x] At least one selected Gemini conversation receives terminal
  conversation-detail evidence.
- [x] If downloadable assets exist in the selected batch, at least one asset is
  materialized with local path and checksum evidence; if no assets exist, the
  job records clear terminal skip/no-asset evidence.
- [x] Account-mirror status no longer treats attempted conversations as unknown
  deferred inventory without explanation. Search/archive readback now exposes
  the materialized artifact with `assetFreshness.status=succeeded`; the
  remaining live-follow conversation rollup still needs a follow-up to fold
  successful history materialization back into conversation-level deferred
  inventory language.
- [x] Provider guard, cooldown, or browser queue blockers are surfaced explicitly
  if they prevent execution.

## Validation Plan

- `pnpm run plans:audit -- --keep 87`
- `git diff --check`
- Read-only installed baseline:
  - `auracall api mirror-completion-status <active-gemini-completion> --json`
  - account-mirror catalog readback for `kind=projects` and `kind=conversations`
  - `auracall api mirror-recovery-candidates --provider gemini --runtime-profile auracall-gemini-pro --json`
- Bounded execution:
  - `auracall api history-materialization-create --provider gemini --runtime-profile auracall-gemini-pro --reconcile --refresh-snapshot --asset-kind all --max-items 1 --json`
    or selected `--conversation-ids` if candidate selection is stronger.
  - `auracall api history-materialization-status <job-id> --json`
- Post-run proof:
  - archive/search readback for any materialized assets;
  - completion status readback for materialization outcome;
  - provider guard/readiness status.

## Definition Of Done

- The bounded Gemini run has terminal evidence and no non-editable Gem cycling.
- Results are recorded in this plan, `ROADMAP.md`, `RUNBOOK.md`, and
  `docs/dev/dev-journal.md`.
- Any code changes required by the run are tested, installed, and validated
  against the user-scoped runtime before closeout.
- If execution is blocked, the blocker has an exact provider/browser/runtime
  unblocker and no additional automated retries are queued.

## Execution Closeout | 2026-05-31

Baseline readback used the installed runtime for
`gemini/auracall-gemini-pro`. The active completion
`acctmirror_completion_3c4a84b7-15b2-4db8-8814-b83164302580` was
`idle_waiting` in `backfill_history` with provider guard `clear`,
`metadataCounts.projects=0`, `retainedFromCache.projects=0`, and
`remainingDetailSurfaces.projects=0`. Direct project-catalog readback returned
`projectManifestCount=0` and no project ids. Conversation catalog readback
still returned cached conversation rows, including some malformed
`accounts.google.com/ServiceLogin` rows and static Gemini app routes; those
rows were not selected for materialization.

The bounded selected-conversation run used:

```bash
/home/ecochran76/.local/bin/auracall api history-materialization-create \
  --provider gemini \
  --runtime-profile auracall-gemini-pro \
  --conversation-id 8e8e58b57ae544ea \
  --provider-conversation-url https://gemini.google.com/app/8e8e58b57ae544ea \
  --refresh-snapshot \
  --asset-kind all \
  --max-items 1 \
  --json \
  --timeout-ms 10000
```

The API-created job id was `hmj_19f26f2121ff40a285642beb2bfc96b5`. It stayed
queued after creation and after a bounded wait, so the same persisted job was
run once through the compiled history-materialization service. The terminal
job readback then reported:

- `status=succeeded`, `attemptCount=1`, `startedAt=2026-05-31T01:32:50.683Z`,
  `completedAt=2026-05-31T01:33:26.823Z`.
- snapshot refresh `status=refreshed`, `routeabilityState=routeable`,
  `messageCount=2`, `artifactCount=1`, `fileCount=0`, `sourceCount=0`.
- result `status=materialized`, `metrics.conversations=1`,
  `metrics.materialized=1`, `metrics.skipped=0`, `metrics.failed=0`.
- artifact `Before The Tide Returns` materialized by direct remote fetch:
  - local path:
    `/home/ecochran76/.auracall/cache/providers/gemini/ecochran76@gmail.com/conversation-attachments/8e8e58b57ae544ea/files/gemini-artifact-8e8e58b57ae544ea-1-0/before_the_tide_returns.mp4`
  - checksum:
    `8ef8f814f7d17908d8186048b3dc8021fae211f4cc1f4aa340059e19cdfdc544`
  - MIME/type/size: `video/mp4`, `2841216` bytes.
  - archive item:
    `history-generated-artifact:gemini:auracall-gemini-pro:8e8e58b57ae544ea:gemini-artifact_8e8e58b57ae544ea_1_0`
  - asset route:
    `/v1/archive/items/b64/aGlzdG9yeS1nZW5lcmF0ZWQtYXJ0aWZhY3Q6Z2VtaW5pOmF1cmFjYWxsLWdlbWluaS1wcm86OGU4ZTU4YjU3YWU1NDRlYTpnZW1pbmktYXJ0aWZhY3RfOGU4ZTU4YjU3YWU1NDRlYV8xXzA/asset`

Archive readback for `kind=generated_artifact` returned the same item with
`fileAvailable=true`, `cacheKey=sha256:8ef8f814...`, and the same local path.
Search readback returned an artifact row with `assetAvailability=available`,
`materializationStatus=succeeded`, and
`assetFreshness.materializationJobId=hmj_19f26f2121ff40a285642beb2bfc96b5`.

No project/Gem target was used during the run, and there was no cycling through
Google catalog Gems such as `chess-champ`, `brainstormer`, or `storybook`.

Follow-up concerns from the run:

- The API job dispatcher did not advance the created job until the persisted
  job was run directly through the compiled materialization service. This
  needs a narrow dispatcher/background-work audit before trusting queued
  history materialization as an unattended operator path.
- Gemini conversation catalog readback still includes malformed
  `accounts.google.com/ServiceLogin` rows and static app routes. Candidate
  selection must filter those until a catalog-cleanup slice removes them at
  source.
- Successful history materialization is visible in archive/search readback,
  but the live-follow conversation rollup can still use deferred-inventory
  language for cached conversation rows. The next slice should reconcile
  materialization freshness back into conversation-level account-mirror
  readback.
