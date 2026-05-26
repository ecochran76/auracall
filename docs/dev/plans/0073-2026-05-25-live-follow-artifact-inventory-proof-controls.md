# Live-Follow Artifact Inventory And Proof Controls

State: CLOSED
Date: 2026-05-25
Lane: P01

## Context

Plans 0069, 0070, 0071, and 0072 closed the core mechanics for history-backed
artifact materialization, conversation refresh, multi-tenant reconciliation, and
tenant/binding separation. The next gap is narrower: live-follow must make
artifact inventory completeness true during ordinary provider sweeps, and
operators need a clean scoped proof mode that does not accidentally wake the
whole tenant fleet while testing one account.

The installed Gemini proof on 2026-05-25 established both sides of the current
state:

- bounded Gemini completion
  `acctmirror_completion_aa103492-0111-4d28-8fc1-cec2b350fe29` completed one
  pass for `gemini:auracall-gemini-pro`
- the pass verified identity `ecochran76@gmail.com`, found 12 Gems/projects,
  and returned 71 conversations after persisted-catalog merge
- the pass still reported `artifacts=0`, `files=0`, and `media=0`
- its materialization handoff `hmj_0d7f222208fd4e6eb97fdd1f43c2828e` then
  succeeded and materialized 4 assets from 5 Gemini conversations
- verified materialized assets included two MP4s and two PNGs with SHA-256
  evidence under the provider identity-scoped cache
- after the bounded proof, installed live-follow reconciliation resumed the
  broader configured target set, including ChatGPT and Grok accounts

That means provider materialization works and the tenant/browser binding is
correct. What remains is correctness and operator control around how live-follow
collects, reports, and tests missing artifacts.

## Current State

Available now:

- Gemini has a dedicated `auracall-gemini-pro` AuraCall runtime profile bound
  to browser profile `gemini-stealthcdp` and managed browser profile
  `~/.auracall/browser-profiles/gemini-stealthcdp/gemini`.
- The Gemini browser family is pinned to local display `:0.0` for visible
  operator inspection on this workstation.
- `profile identity-smoke --target gemini` can verify the active bound account
  before provider work.
- Account-mirror completion can run bounded or unbounded passes and can hand
  off materialization policy into history-materialization jobs.
- History materialization can refresh Gemini conversation snapshots through the
  rail surface and materialize image/video artifacts into
  `~/.auracall/cache/providers/gemini/<identity>/conversation-attachments/`.
- Account-mirror catalog/search/archive can expose materialized files and
  checksums once materialization writes the cache/archive evidence.
- Full multi-tenant reconciliation campaigns can attach, upgrade, and monitor
  child completions and materialization jobs.
- The tenant/cache boundary is explicit: tenant content is provider plus bound
  identity; runtime/browser profile fields are execution binding and
  provenance.

Observed gaps:

- A Gemini completion can report nonzero conversation counts because persisted
  catalog rows were merged in, while the current provider pass did not actually
  observe conversation ids in `metadataEvidence.conversationSampleIds`.
- Gemini metadata inventory can report zero artifacts/files/media when no
  conversation detail surfaces were scanned in that pass. That zero is not the
  same as "the tenant has no artifacts."
- The attachment inventory cursor in the proof showed project surfaces scanned
  and conversation detail surfaces untouched, even though the materialization
  job later found conversation assets.
- Completion readback records the materialization handoff cursor, but the
  completion itself does not currently project the terminal materialization
  outcome as first-class pass evidence.
- Starting or restarting the installed API service with live-follow execution
  enabled can resume/recreate the broader fleet while an operator is trying to
  prove one provider/runtime target.
- Operator surfaces do not yet make the distinction clear enough between
  observed-this-pass counts, retained cached counts, and materialized local
  asset counts.

## Goal

Make live-follow artifact reconciliation trustworthy for operators:

- a scoped proof can run against one provider/runtime profile without waking
  unrelated enabled live-follow targets
- Gemini metadata refresh distinguishes live-observed counts from retained
  cached counts after merge
- artifact/file/media inventory states use `unknown`, `deferred`, or
  `in_progress` when no detail surface was scanned instead of presenting a
  false zero
- Gemini full sweeps and steady-follow passes prioritize conversation detail
  surfaces when materialization policy needs assets
- completion status shows the terminal materialization result, not only the
  queued handoff id
- API, CLI, MCP, and dashboard readback let an operator understand what was
  observed, what was retained from cache, what was refreshed, and what was
  materialized locally

## Non-Goals

- Do not change tenant cache ownership. Provider plus bound identity remains
  the tenant key; runtime/browser profile remains binding/provenance.
- Do not make cache-only status, catalog, search, or catalog-item reads launch
  browsers.
- Do not weaken provider guard policy. Gemini `google.com/sorry`, CAPTCHA,
  reCAPTCHA, account chooser, and visible sign-in/account mismatch states still
  stop automation until cleared by a human.
- Do not submit prompts, create new provider conversations, or click Gemini
  composer actions as part of live-follow or proof controls.
- Do not delete cached conversations merely because a proof pass did not
  observe them.
- Do not build a Gemini-only orchestration stack when the generic completion,
  materialization, campaign, dispatcher, and status services can own the common
  semantics.

## Architecture Boundaries

### Tenant And Binding

- Tenant content:
  - provider
  - bound identity
  - cached conversations, manifests, artifacts, files, media, archive rows,
    checksums, and search projections
- Binding/provenance:
  - AuraCall runtime profile
  - browser profile
  - managed browser profile path
  - browser family, executable, display, debug port, and dispatcher lock
  - live-follow policy, backoff, provider guard, and current operation ids

### Observed Versus Retained Counts

Future status and evidence must separate:

- `observedThisPass`: entities scraped from the provider in the current refresh
- `retainedFromCache`: entities carried forward from the existing tenant cache
- `mergedTotal`: the operator-visible tenant catalog count after merge
- `detailScannedThisPass`: conversation/project detail surfaces actually
  opened or read during this refresh
- `localMaterialized`: assets with local file/checksum evidence
- `remoteKnownMissingLocal`: assets known remotely but not locally cached
- `unknownOrDeferred`: assets not yet knowable because the relevant detail
  surface was not scanned

### Browser Work Ownership

All live provider work must remain under:

- provider politeness decision
- provider guard state
- browser operation dispatcher
- foreground work yield
- explicit operator proof/campaign/completion ownership

Direct raw CDP inspection remains debug-only and must not be required for the
normal proof path.

## Implementation Slices

### 1. Scoped Proof Control

Add an operator-safe way to run one bounded target proof without broad
live-follow side effects.

Required behavior:

- CLI/API/MCP can request a scoped proof for one provider/runtime profile.
- Scoped proof suppresses startup reconciliation and scheduler execution for
  unrelated targets for the lifetime of that proof server or operation.
- Existing broad enabled live-follow operations are not cancelled implicitly.
  The proof mode should either:
  - run on an isolated proof server with completions-on-start disabled, or
  - acquire an explicit maintenance scope that prevents new unrelated
    completions from being reconciled while the scoped proof runs.
- Readback identifies the scope:
  - provider
  - runtime profile
  - tenant key
  - binding key
  - browser operation key
  - whether global live-follow reconciliation was suppressed
- The documented manual fallback remains:
  `api serve --no-account-mirror-completions-on-start
  --account-mirror-scheduler-interval-ms 0
  --background-drain-interval-ms 0` on a non-installed port.

Acceptance criteria:

- A deterministic service test proves scoped proof startup does not create
  live-follow completions for unrelated enabled targets.
- A CLI smoke can start a Gemini-only bounded proof and list zero unrelated
  active completions from that proof server.
- Installed-service documentation tells operators when to use isolated proof
  server versus the long-lived service.

### 2. Refresh Evidence Model

Split metadata counts into observed, retained, and merged counts.

Required behavior:

- `AccountMirrorMetadataCollectorResult` or refresh merge output records
  pre-merge and post-merge counts.
- Evidence includes live-observed conversation sample ids when current-provider
  discovery found them.
- Evidence can say `observedThisPass.conversations = 0` while
  `mergedTotal.conversations = 71` without implying discovery failure or tenant
  data loss.
- Mirror completeness uses detail cursor and observed/retained counts to avoid
  false `complete` or false zero asset states.

Acceptance criteria:

- Tests cover a collector result with zero observed conversations merged with
  persisted conversations.
- Status/catalog readback exposes the difference without launching browser
  work.
- CLI and dashboard summaries stop presenting merged artifact zero as proof
  that the tenant has no artifacts when no detail surfaces were scanned.

### 3. Gemini Conversation Discovery Reliability

Make Gemini list discovery prove that it has visited the intended rail surface
before claiming live-observed conversation counts.

Required behavior:

- `listProjects` may use `/gems/view`, but root `listConversations` must
  settle on a usable Gemini rail surface (`/app` or an already loaded
  `/app/<conversationId>` with the rail open), not stay on the Gem catalog.
- Gem/project conversation reads should preserve the project/Gem context but
  still record whether conversation links were live-observed in that pass.
- If the rail cannot be opened because of account chooser, sign-in, precise
  location, CAPTCHA, or missing DOM, evidence should classify the state instead
  of falling through to merged persisted counts as if discovery succeeded.
- Gemini root rail should continue avoiding unnecessary page refreshes or
  direct conversation navigation.

Acceptance criteria:

- Unit tests cover target URL selection after a `/gems/view` project scrape.
- A DOM-fixture test covers `conversationSampleIds` populated from a live rail.
- A negative fixture covers `/gems/view` with no rail and records a tolerated
  discovery failure rather than a false live observation.

### 4. Detail Inventory Semantics

Make artifact inventory state reflect whether conversation detail was actually
scanned.

Required behavior:

- When artifact policy is `recent_missing_assets` or `full_missing_assets`,
  Gemini detail inventory prioritizes conversation detail surfaces before Gem
  project file surfaces unless the policy explicitly asks for project files.
- If no conversation detail surfaces are available in the current collector
  input, artifact/media counts become `unknown` or `deferred`, not zero.
- The attachment cursor records both project and conversation read positions,
  but readback names which detail class was scanned this pass.
- Full sweeps resume the deep cursor; steady-follow restarts at the current
  provider rail/project top.

Acceptance criteria:

- Tests cover Gemini inventory with persisted conversations but no live
  conversation detail scan.
- Tests cover Gemini inventory prioritizing conversation artifact detail when
  materialization policy includes assets.
- Status readback describes remaining detail surfaces by class and shows
  `unknown/deferred` asset state until a conversation detail pass runs.

### 5. Materialization Handoff Readback

Tie completion status to terminal materialization evidence.

Required behavior:

- Completion readback refreshes or hydrates the latest
  `materializationCursor.jobStatus`.
- Completion detail includes aggregate materialization outcome when the job is
  terminal:
  - conversations attempted
  - materialized count
  - skipped count
  - failed count
  - checksum count
  - manifest paths
  - terminal routeability counts
- Search/catalog/archive remain the source of item detail, but completion
  status should show enough evidence to decide whether the pass actually
  recovered assets.
- A materialization job that succeeds after a metadata pass reports back into
  live-follow health so the target does not look asset-empty.

Acceptance criteria:

- Tests cover completion status moving from `queued` handoff to terminal
  materialization evidence.
- CLI `mirror-completion-status` summary includes materialized/checksum counts.
- Dashboard active/recent completion rows show terminal materialization outcome
  without opening provider browser work.

### 6. Operator UI And API Language

Update operator surfaces so a human can tell where truth came from.

Required behavior:

- Account Mirror rows distinguish:
  - cached catalog count
  - live-observed this pass
  - detail scanned this pass
  - local asset completeness
  - materialization job status
- Live-follow target rows show scoped proof state versus ordinary live-follow
  state.
- The row-level reconciliation control should be the fastest way to refresh one
  conversation when an operator knows the online state changed.
- Batch/full sweep controls should show that they may open provider browser
  work and are subject to provider guard/backoff.

Acceptance criteria:

- React operator table labels use tenant/binding vocabulary from Plan 0072.
- The dashboard does not imply that `artifacts=0` means no assets exist unless
  detail inventory was scanned.
- CLI and MCP schemas expose the same fields as the API.

### 7. Backoff And Cadence For Practical Testing

Keep provider-protective defaults while making operator proof loops practical.

Required behavior:

- Explicit operator proof and bounded reconciliation bypass only the routine
  minimum interval.
- Identity mismatch, provider guard, hard stop, failure backoff, and browser
  lock decisions remain enforced.
- Gemini explicit-refresh and failure-backoff defaults stay short enough for
  proof loops, while routine live-follow cadence stays conservative.
- Readback says exactly which gate is delaying work and when it becomes
  eligible.

Acceptance criteria:

- Tests prove bounded proof does not wait behind routine minimum interval.
- Tests prove provider guard and identity mismatch still block bounded proof.
- CLI status names the delay reason and exact eligible time.

## Parallelizable Tracks

- Scoped proof controls can proceed independently from evidence-model changes.
- Gemini discovery fixture tests can proceed before UI wording.
- Completion/materialization readback can proceed once terminal job hydration
  helpers are available.
- Dashboard wording can proceed after API/CLI fields are named.

## Critical Path

1. Define the evidence model for observed/retained/merged counts.
2. Fix Gemini discovery evidence so live-observed conversation ids are honest.
3. Fix detail inventory semantics so unscanned artifact surfaces are
   `unknown/deferred`, not zero.
4. Hydrate terminal materialization evidence into completion readback.
5. Add scoped proof controls and document the isolated proof-server fallback.
6. Update CLI/MCP/dashboard language.
7. Prove with deterministic tests and one installed Gemini smoke.

## Implementation Progress

2026-05-26 closeout:

- implemented scoped proof mode for `api serve` with provider/runtime scope
  readback and suppression of startup completion resume, configured
  live-follow reconciliation, scheduler execution, and background drain.
- proof-mode servers no longer adopt unrelated persisted completion operations
  from the shared completion store, and `/status.liveFollow` is scoped to the
  requested provider/runtime target.
- account-mirror refresh evidence now separates `observedThisPass`,
  `retainedFromCache`, and `mergedTotal`, and carries
  `detailScannedThisPass` plus `assetInventory` evidence.
- Gemini cached conversation counts with zero conversation detail scans now
  report deferred/unknown asset inventory instead of treating
  `artifacts=0/files=0/media=0` as tenant truth.
- completion readback hydrates terminal history-materialization job outcomes
  into `materializationOutcome`, including attempted/materialized/skipped/
  failed/checksum/manifest/routeability evidence.
- CLI, MCP, `/status`, and the React dashboard expose the new scoped proof,
  asset inventory, count-evidence, tenant/binding, and materialization outcome
  fields.
- Gemini root rail discovery now targets `/app` after Gem/project routes
  instead of staying on `/gems/view`.

Deterministic implementation gates pass, the patched user runtime is installed,
and the final live Gemini proof completed after Plan 0074 closed the
guard-first/no-renavigation sub-slice:

- scoped proof completion
  `acctmirror_completion_17ccf29f-e4ee-479c-9d0c-3a71776126bc` completed one
  `gemini:auracall-gemini-pro` full-sweep pass with detected identity
  `ecochran76@gmail.com`.
- completion readback on the restored long-lived service hydrates terminal
  materialization job `hmj_112116b41db94ec5b9c3bb7c867e35e9` as
  `materializationOutcome`.
- the metadata refresh readback separates `observedThisPass`,
  `retainedFromCache`, and `mergedTotal`; it reports
  `assetInventory.state = deferred` because no conversation detail surface was
  scanned during the metadata pass, avoiding a false artifact zero.
- materialization terminal evidence reported ten conversations attempted,
  seven assets materialized, one skipped, zero failed, seven checksums, and
  six manifest paths.
- scheduler diagnostics for the same completion reported zero reload
  mutations and `duplicateSameRouteAttempts.total = 0`, proving the final proof
  did not regress into the navigation churn that caused the earlier
  provider-guard stop.

Materialized asset checksum evidence:

- `/home/ecochran76/.auracall/cache/providers/gemini/ecochran76@gmail.com/conversation-attachments/1ab8bb794846c491/files/gemini-artifact-1ab8bb794846c491-2-0/Generated image 1.png`
  - `81419e5398229ee1a517293e08f491c546eb5ee7fbbc0504381f7185470fdb91`
- `/home/ecochran76/.auracall/cache/providers/gemini/ecochran76@gmail.com/conversation-attachments/ab30a4a92e4b65a9/files/gemini-conversation-file-ab30a4a92e4b65a9-0-uploaded-image-1/uploaded-image-1`
  - `5bdce033c1e8aa4ab441bfce8fa6825e1e996ce5758a4246268fe0238a648fac`
- `/home/ecochran76/.auracall/cache/providers/gemini/ecochran76@gmail.com/conversation-attachments/ab30a4a92e4b65a9/files/gemini-conversation-file-ab30a4a92e4b65a9-0-AGENTS.md/AGENTS.md`
  - `913744155dc7310f2072ca4d2989f53dbed12e0b757e1d2e0c868b641142ede2`
- `/home/ecochran76/.auracall/cache/providers/gemini/ecochran76@gmail.com/conversation-attachments/23340d1698de29b8/files/gemini-artifact-23340d1698de29b8-1-0/video.mp4`
  - `b43b26926ac293c68b7eac2c0a370274bc6132dc0167ba2629e207a815052d1a`
- `/home/ecochran76/.auracall/cache/providers/gemini/ecochran76@gmail.com/conversation-attachments/8e8e58b57ae544ea/files/gemini-artifact-8e8e58b57ae544ea-1-0/before_the_tide_returns.mp4`
  - `8ef8f814f7d17908d8186048b3dc8021fae211f4cc1f4aa340059e19cdfdc544`
- `/home/ecochran76/.auracall/cache/providers/gemini/ecochran76@gmail.com/conversation-attachments/3525c884edae4fa4/files/gemini-artifact-3525c884edae4fa4-1-0/Generated image 1.png`
  - `734034c8f098017dc17598c5fe3199f1bad7a60dadea515bb975775046b4afac`
- `/home/ecochran76/.auracall/cache/providers/gemini/ecochran76@gmail.com/conversation-attachments/841b485bcb3819af/files/gemini-conversation-file-841b485bcb3819af-0-gemini-new-chat-upload-smoke.txt/gemini-new-chat-upload-smoke.txt`
  - `913744155dc7310f2072ca4d2989f53dbed12e0b757e1d2e0c868b641142ede2`

## Validation Plan

Deterministic tests:

- account-mirror refresh merge tests for observed versus retained counts
- Gemini adapter tests for rail target selection and no-refresh reuse
- metadata collector tests for unscanned detail inventory semantics
- completion service tests for materialization job status hydration
- HTTP/CLI/MCP tests for scoped proof fields and no unrelated target startup
- dashboard unit/fixture tests for new labels if the React surface changes

Static gates:

- `pnpm run typecheck`
- targeted Biome lint for touched source/test/UI files
- `pnpm run check`
- `git diff --check`
- `pnpm run plans:audit -- --keep 73`

Installed smoke:

1. start an isolated proof server or explicit scoped proof for
   `gemini:auracall-gemini-pro`
2. verify identity smoke passes for `ecochran76@gmail.com`
3. run one bounded full sweep with recent missing assets
4. confirm no unrelated live-follow targets start in the proof scope
5. confirm completion status reports observed/retained/merged counts
6. confirm materialization terminal readback reports recovered assets or
   explicit routeability/guard evidence
7. verify SHA-256 on any materialized local files
8. leave the managed browser visible for operator inspection only when the
   smoke requires it

## Acceptance Criteria

- Operators have a documented and tested Gemini-only proof path that does not
  start unrelated enabled live-follow targets.
- Account-mirror refresh evidence separates live-observed counts from retained
  cached counts after merge.
- Gemini metadata refresh cannot claim zero artifacts/files/media merely
  because conversation detail surfaces were not scanned.
- Completion status exposes terminal materialization evidence and checksum
  counts after handoff jobs finish.
- Dashboard/CLI/MCP readback uses tenant/binding wording and makes asset
  completeness source clear.
- Provider guard, identity mismatch, and browser operation ownership remain
  enforced in both ordinary live-follow and scoped proof paths.
- A live installed Gemini proof recovers at least one artifact or produces
  explicit terminal evidence that explains why no artifact was recoverable.

## Definition Of Done

- Plan 0073 implementation tests and static gates pass.
- `docs/testing.md` documents the scoped proof command path and expected
  readback.
- `README.md` or operator docs link the proof path from account mirror
  live-follow usage.
- `docs/dev-fixes-log.md` records any new provider-specific lesson found while
  implementing the plan.
- The installed runtime is updated with `pnpm run install:user-runtime` when
  code changes land.
- The final handoff includes exact completion id, materialization job id,
  asset paths, checksums, and whether broad live-follow was suppressed or
  intentionally resumed.
