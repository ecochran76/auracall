# Live-Follow Artifact Materialization Recovery Plan | 0085-2026-05-30

State: CLOSED
Lane: P01

## Purpose

Make live-follow artifact recovery truthful and operator-actionable. Live follow
should not imply that all retrievable artifacts will materialize when configured
targets are still running `materializationPolicy: metadata_only`; this plan
defines the bounded recovery lane that classifies missing assets, upgrades the
right targets or jobs to materialization-capable policy, and proves local file
and checksum evidence across API, CLI, MCP, and the greenfield console.

This plan follows Plan 0084. The status/readback substrate is now stable enough
to report materialization state without unbounded completion hydration or stale
runner growth, so the next critical gap is artifact recovery itself.

## Current State

- Plan 0084 is closed:
  - default `/status.accountMirrorCompletions` preserves exact metrics while
    hydrating only current active rows and the bounded recent window;
  - stale runner retention is capped to the newest `100` stale records;
  - installed port `18095` reports bounded runner topology and healthy
    live-follow target posture.
- The roadmap still records the materialization gap:
  - several ChatGPT tenants report `remoteKnownMissingLocal` assets;
  - live-follow completions currently run `materializationPolicy:
    metadata_only`;
  - durable materialization queues are idle;
  - protected `/v1/*` materialization routes can require API-key-backed or
    CLI/MCP readback.
- Prior closed plans established important mechanics:
  - Plan 0069 added durable history-backed materialization jobs and
    API/CLI/MCP surfaces;
  - Plan 0073 proved that metadata inventory and materialization outcomes must
    be read together, and that provider detail scans can find assets even when
    metadata-only passes report deferred or zero artifact counts.
- Existing policies include `metadata_only`, `recent_missing_assets`, and
  `full_missing_assets`, but the current installed live-follow posture should
  be treated as metadata mirroring until a target, proof, campaign, or
  materialization job explicitly opts into artifact recovery.

## Key Answer

Do not expect live follow to catch up with all retrievable artifacts by itself
while configured completions stay metadata-only. Expected catch-up requires an
explicit recovery path that:

- identifies remote-known missing local assets;
- separates retrievable, deferred, unknown, unsupported, and terminal-missing
  cases;
- creates bounded materialization work for eligible assets;
- records local path, checksum, manifest, archive/search projection, and
  completion/campaign readback evidence.

## Scope

- Audit current installed account-mirror and archive/search state for
  recoverable missing artifacts without launching broad provider work.
- Build or tighten a recovery planner for `remoteKnownMissingLocal` assets that
  can classify:
  - retrievable with current provider evidence;
  - needs provider detail refresh first;
  - needs a scoped full/recent materialization policy pass;
  - unavailable or terminal;
  - unsupported by provider adapter.
- Wire bounded recovery execution through existing materialization-capable
  surfaces:
  - account-mirror completion with `recent_missing_assets` or
    `full_missing_assets`;
  - reconciliation campaigns that attach or upgrade child completions;
  - history materialization jobs;
  - archive materialization jobs where archive rows already own provider
    evidence.
- Preserve cache-only status/catalog/search reads. Browser work must remain an
  explicit job, proof, campaign, or operator-approved control.
- Expose recovery posture clearly in API, CLI, MCP, and greenfield console
  readback.
- Verify installed-runtime behavior on port `18095` with before/after counts.

## Non-Goals

- Do not make ordinary metadata-only live follow launch browser downloads.
- Do not submit prompts, create provider conversations, or mutate provider
  projects while recovering historical artifacts.
- Do not treat cached metadata, provider snippets, or conversation titles as
  local materialization proof.
- Do not hide terminal failures by retrying the same unavailable asset forever.
- Do not change tenant binding semantics or browser-profile selection rules.
- Do not add broad launch/retry, Search/archive product expansion, API Access,
  or new console control families.
- Do not run broad multi-tenant provider automation until the planner can prove
  bounded candidate counts and safe provider/account scope.

## Architecture Boundaries

- Tenant truth remains provider plus bound identity.
- Runtime profile, browser profile, managed browser profile, and service
  account are execution binding and provenance.
- Account-mirror catalog/search/archive reads remain cache-first and
  browser-free.
- Materialization is an explicit write/work operation with durable job or
  completion ownership.
- `/status` remains the operator posture route; detailed recovery manifests
  belong in materialization job, completion, campaign, archive, and CLI/MCP
  detail readback.
- The greenfield `/console` may expose recovery posture and bounded controls,
  but must consume backend readiness instead of duplicating state rules.

## Implementation Tracks

### Track 1 | Installed Recovery Baseline

Status: complete.

Evidence, 2026-05-30:

- Installed `auracall-api.service` on port `18095` was active before changes.
- Baseline `/status` reported live-follow severity `attention-needed`, `3`
  active completions, and all observed live-follow materialization policies as
  `metadata_only` or absent.
- Baseline account-mirror inventory showed ChatGPT remote-known missing local
  assets across multiple runtime profiles:
  - `wsl-chrome-3`: `71` artifacts and `76` files;
  - `wsl-chrome-2`: `64` artifacts and `73` files;
  - `wsl-chrome-4`: `45` artifacts and `36` files;
  - `default`: `40` artifacts and `31` files.
- Gemini targets remained deferred/unknown for asset inventory confidence.
- Direct unauthenticated protected `/v1/*` materialization/search routes
  returned `401`; installed CLI readback was required for operator proof.

- Capture current installed counts from port `18095`:
  - live-follow target materialization policies;
  - `remoteKnownMissingLocal`, `localMaterialized`, `unknownOrDeferred`, and
    terminal/failed counts by provider/runtime profile where available;
  - active and terminal materialization jobs;
  - unavailable artifact/search/archive facets;
  - current protected-route versus CLI/MCP readback posture.
- Record a redacted baseline in the dev journal without raw provider content or
  private transcript paths.
- Identify the smallest ChatGPT tenant subset that has remote-known missing
  local assets and enough provider evidence to recover without broad fleet work.

### Track 2 | Recovery Candidate Planner

Status: implemented and installed for readback.

Evidence, 2026-05-30:

- Added a cache-first, browser-free planner that reads account-mirror status
  plus optional unavailable search-projection rows and emits bounded recovery
  candidates.
- Added installed API/CLI/MCP readback:
  - `GET /v1/account-mirrors/recovery-candidates`;
  - `auracall api mirror-recovery-candidates`;
  - MCP `account_mirror_recovery_candidates`.
- Installed CLI proof on port `18095` returned `8` recovery candidates with
  `436` remote-known missing local assets and `6` unknown/deferred assets:
  `4` candidates need `queue_history_materialization`, `2` need detail refresh,
  and `2` are blocked/no-op.

- Add or tighten a planner that reads cache/search/archive/completion evidence
  and emits bounded recovery candidates.
- Candidate rows should include:
  - provider;
  - tenant key or bound identity;
  - AuraCall runtime profile;
  - provider conversation id or catalog item id when known;
  - asset kind;
  - local availability state;
  - routeability/evidence confidence;
  - required recovery action;
  - skip or terminal reason.
- The planner must cap default candidate output and report omitted counts.
- The planner must not launch browser work.

### Track 3 | Bounded Recovery Execution

Status: complete for the bounded proof slice.

- Route eligible candidates into existing explicit work surfaces:
  - history materialization jobs for catalog/conversation rows;
  - archive materialization jobs for archive-owned provider evidence;
  - scoped account-mirror completions with `recent_missing_assets` or
    `full_missing_assets`;
  - reconciliation campaigns when multiple targets need attach/upgrade logic.
- Ensure the executor preserves provider guard policy, foreground-yield policy,
  browser operation ownership, and tenant/binding boundaries.
- Add backoff or terminal classification so unavailable assets do not loop.
- Keep default live follow metadata-only unless the target config or operator
  request explicitly asks for materialization.

Evidence, 2026-05-30:

- Queued a bounded installed history-materialization job for the smallest
  explicit proof slice available from the top ChatGPT recovery candidate:
  `hmj_27003a79e9a6416381aa8d37666e215a`.
- Request was scoped to `provider=chatgpt`,
  `runtimeProfile=wsl-chrome-3`, `boundIdentityKey=eric.cochran@soylei.com`,
  `reconcile=true`, `assetKinds=[artifacts, files, media]`, and `maxItems=3`.
- The job succeeded: `3` assets materialized from `3` conversations, with `3`
  manifest paths, `3` materialized entries, `4` failed entries, and `1`
  skipped entry.
- Successful entries included local cache paths and SHA-256 checksums; failed
  image entries reported `ChatGPT artifact binary fetch failed`.
- Recovery-candidate readback now reconciles run-archive availability evidence
  back into missing-local counts. After reinstalling and restarting
  `auracall-api.service`, `chatgpt/wsl-chrome-3` dropped from `147` to `145`
  remote-known missing local assets and reported `2` locally materialized
  assets. The global installed recovery posture dropped from `436` to `434`
  remote-known missing local assets.
- Full fleet catch-up remains explicit bounded work; this plan proves the
  planning, execution, and readback contract rather than launching every
  remaining provider materialization task.

### Track 4 | Readback And Operator Parity

Status: complete.

- Extend readback so API, CLI, MCP, and `/console` can answer:
  - how many assets are remote-known but missing locally;
  - how many are eligible for recovery now;
  - how many require detail refresh;
  - how many are terminal, unsupported, or deferred;
  - what materialization jobs or completion outcomes changed local state.
- Ensure protected direct `/v1/*` routes have equivalent authenticated CLI/MCP
  or installed-operator paths.
- Show materialization policy and terminal materialization outcome in the same
  operator surfaces that show live-follow health, so `healthy` is not confused
  with "all artifacts local."

Evidence, 2026-05-30:

- API, CLI, and MCP can now read the same bounded recovery-candidate posture.
- `/status` endpoint metadata now advertises the recovery-candidates route.
- Greenfield `/console?view=runs` now fetches the backend
  `/v1/account-mirrors/recovery-candidates` route and shows Artifact Recovery
  readback for remote-known missing assets, unknown/deferred assets,
  candidate counts, queueable candidates, and top bounded candidate actions.
- Installed console proof served `/console?view=runs` from port `18095` with
  bundle `index-BkDhtdX3.js`, and that bundle contains the recovery route and
  Artifact Recovery panel strings.

### Track 5 | Installed Proof And Closeout

Status: complete.

- Run one bounded recovery proof against the smallest eligible ChatGPT target
  set before any broader campaign.
- Prove success with:
  - materialization job or completion ids;
  - manifest paths;
  - local paths;
  - checksums;
  - archive/search projection updates;
  - before/after missing-local counts.
- If no asset is retrievable, record concrete terminal/unsupported/deferred
  reasons and leave roadmap state honest.
- Update roadmap, runbook, dev journal, and durable fixes log with the final
  evidence.

## Acceptance Criteria

- Plan 0085 is wired into `ROADMAP.md` and `RUNBOOK.md` as the active bounded
  plan.
- Operators can see that metadata-only live follow does not guarantee artifact
  catch-up.
- A bounded planner identifies recoverable missing artifacts without launching
  browser work.
- Eligible recovery work runs only through explicit completion, campaign, or
  materialization job ownership.
- Materialization readback records local file paths, checksums, manifest
  entries, archive/search projection updates, and terminal skip/failure
  reasons.
- CLI/MCP/console readback can inspect the same recovery posture when direct
  protected `/v1/*` routes are not available from curl.
- Installed-runtime proof on port `18095` records before/after counts for at
  least one bounded provider/runtime target, preferably the smallest eligible
  ChatGPT target set with `remoteKnownMissingLocal` assets.

## Validation Plan

- Focused unit tests for recovery candidate planning and default caps.
- Focused service tests for routing candidates into the correct existing job or
  completion surface.
- HTTP tests for readback shape, omitted counts, and protected-route parity.
- CLI/MCP tests for recovery planner/materialization readback.
- Console build and focused UI tests if `/console` exposes recovery posture or
  controls.
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run lint`
- `pnpm run plans:audit -- --keep 85`
- `git diff --check`
- Installed runtime:
  - `pnpm run install:user-runtime-service`
  - `systemctl --user restart auracall-api.service`
  - bounded `/status` and recovery readback checks against
    `http://127.0.0.1:18095`
- one bounded materialization proof or terminal-classification proof.

Installed proof:

- Installed candidate readback is proven.
- Installed durable job queueing and one bounded materialization success are
  proven.
- Run-archive materialization evidence now reconciles into recovery-candidate
  counts: `chatgpt/wsl-chrome-3` dropped from `147` to `145` remote-known
  missing local assets, and global installed readback dropped from `436` to
  `434`.
- Full catch-up remains intentionally unclaimed. The remaining `434`
  remote-known missing local assets and `6` unknown/deferred assets require
  future explicit bounded recovery/detail-refresh work.

## Definition Of Done

- The roadmap no longer leaves artifact catch-up as an implicit expectation of
  metadata-only live follow.
- Recovery candidate planning is bounded, test-covered, and browser-free.
- At least one explicit recovery path is proven against installed runtime, or
  the plan records why all current candidates are terminal/deferred.
- Operator readback distinguishes live-follow health, metadata freshness,
  remote-known missing local assets, and local materialization evidence.
- Plan 0085 is updated with final evidence and closed.
