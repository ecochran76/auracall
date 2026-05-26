# Full Multi-Tenant Reconciliation

State: CLOSED
Date: 2026-05-24
Lane: P01

## Context

Plans 0069 and 0070 closed the single-target mechanics:

- account-mirror history materialization can fetch provider artifacts through
  durable jobs and persist cache/archive/search evidence
- conversation reconciliation can refresh one cached provider conversation,
  classify deleted/unavailable Gemini ids, and materialize newly discovered
  assets
- live-follow completion policy can run full sweeps or steady-follow passes for
  one provider/runtime-profile target
- Search and Account Mirror rows expose explicit reconciliation controls while
  cache/catalog/search reads stay read-only

The remaining operational gap is fleet orchestration. AuraCall can have many
configured account-bearing runtime profiles across ChatGPT, Gemini, Grok, and
future providers. A one-target full sweep is useful for proof, but operators
need a campaign-level operation that reconciles every eligible tenant toward the
current online state, reports aggregate progress, survives restarts, and still
respects per-provider politeness and browser-profile ownership.

This plan owns the full multi-tenant reconciliation layer.

## Current State

Available now:

- `/status.liveFollow.targets.accounts[]` projects configured desired state,
  current activity, effective wake time, identity evidence, and target posture.
- `runtimeProfiles.<name>.services.<provider>.liveFollow` is the durable
  source of desired live-follow intent.
- `api serve` reconciles enabled configured accounts into durable
  account-mirror completion operations without duplicating active work.
- `POST /v1/account-mirrors/completions` can start one target with
  `sweepMode = full_sweep` or `steady_follow` and materialization policy.
- `POST /v1/account-mirrors/materializations` can reconcile selected
  conversation ids, catalog items, or bounded account-mirror targets with
  `refreshSnapshot` and asset-kind filters.
- Account-mirror status entries carry mirror completeness, metadata counts,
  metadata evidence, failure/backoff state, and provider-guard posture.
- Browser work is routed through the browser operation dispatcher and provider
  politeness guards.

Closed with follow-up backlog:

- No autonomous background campaign timer yet advances deferred eligible
  targets without API/MCP startup, campaign status/list readback, or explicit
  operator `run-next-pass` control.
- Deeper search/catalog row links remain open in the React Health dashboard.
- Gemini/default full-sweep proof is blocked by a Google account chooser on
  direct conversation reconciliation in the current managed browser profile;
  do not retry that profile until a human clears the provider state.
- ChatGPT full-sweep metadata collection can still time out on some targets
  with large account history; campaigns now isolate that failure while other
  targets materialize assets.

Progress checkpoint, 2026-05-24:

- dry-run campaign records now persist under the account-mirror cache
  reconciliation store.
- dry-run target discovery reads account-mirror status plus active completion
  records, classifies target eligibility, applies selection budgets, and
  records full-sweep materialization policy without browser work.
- API, CLI, and MCP expose dry-run create/list/status/control readback for the
  shared campaign object.
- non-dry-run campaign creation starts selected eligible targets as bounded
  full-sweep completion children and attaches already-active completions
  without duplicating them.
- campaign status readback hydrates child completion/materialization state and
  pause/resume/cancel controls propagate to child completions.
- deferred targets remain selected campaign work, and `run-next-pass`,
  API/MCP startup recovery, and campaign read/list hydration can start the next
  eligible target when provider/browser/active-target capacity is available.
- the React operator Health dashboard has a reconciliation campaign launcher,
  campaign list, selected campaign target detail table, child operation links,
  and pause/resume/cancel/next controls.
- campaign execution now upgrades non-matching active live-follow children in
  place to bounded full-sweep/materialization policy instead of merely
  attaching metadata-only work.
- campaign readback now hydrates history-materialization job results into
  aggregate counts, per-target materialization metrics, asset checksum
  evidence, and terminal routeability evidence.
- CLI summaries and the React Health campaign detail view show aggregate
  materialized/checksum counts.
- live provider campaign proof now records two checksummed ChatGPT artifacts
  across distinct runtime profiles with provider conversation ids and bound
  identities.

Closeout checkpoint, 2026-05-24:

- campaign materialization target selection skips static Gemini routes such as
  `/app/download` and prioritizes rows with missing/partial asset evidence
  before refresh-only rows.
- bounded operator reconciliation bypasses only the routine minimum-interval
  wait while preserving identity mismatches, provider guards, hard stops,
  failure backoff, and browser-operation locks.
- persisted bounded reconciliation children clear stale `nextAttemptAt` on
  resume and immediately re-evaluate the real target state.
- history-materialization jobs now have a default 10 minute job timeout rather
  than remaining `running` indefinitely.
- campaign readback keeps campaigns active while selected materialization jobs
  are still active.
- campaign materialized-asset evidence now enriches entries from matching
  archive items so artifact hashes are reported with provider conversation ids
  even when the history-materialization result target is `null`.
- Gemini rail discovery filters bogus static `/app/download` conversation ids;
  a later Gemini job selected real conversation `23340d1698de29b8`, but the
  managed browser profile landed on a Google account chooser for
  `https://gemini.google.com/app/23340d1698de29b8`, so Gemini live retries
  stopped under the repo browser-work rules.
- installed campaign `acctmirror_reconciliation_87fbb97c-88ce-4294-92b2-a471df9c9279`
  recorded aggregate materialization metrics:
  `jobs=2`, `terminalJobs=2`, `conversations=2`, `materialized=2`,
  `archiveItems=2`, `checksummedAssets=2`.
- the selected ChatGPT target `chatgpt:wsl-chrome-4` materialized artifact
  `canvas:68e64580d6988191bbab7e4b006ceed2` from conversation
  `68e6442e-e7d4-832e-b4f6-6db6cd5a7c3f` for
  `ecochran76@gmail.com`, checksum
  `329d9d0fef7a3215b8ff78eac8360584cf2d042ad45f1ca0d360186baac8184b`.
- the already-active claimed ChatGPT target `chatgpt:wsl-chrome-3`
  materialized artifact
  `bd8a65b0-4d5-41b5-a49b-ab8fe39629b6:download:sandbox:/mnt/data/Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_clean_2page.pdf`
  from conversation `6a0fa901-77d0-83ea-80e0-fbaaa4eca529` for
  `eric.cochran@soylei.com`, checksum
  `7275c5d08508b22855a8ad36bc06d7cc6e3476f5ab84620814381b09b037e767`.
- selected ChatGPT target `chatgpt:wsl-chrome-2` failed independently with
  `Account mirror metadata collector timed out for chatgpt/wsl-chrome-2`;
  the campaign closed `completed_with_skips` after preserving the successful
  target evidence.

Validation checkpoint, 2026-05-24:

- deterministic coverage now includes dry-run target classification, bounded
  execution starts, already-active attachment, deferred `run_next_pass`
  advancement, startup/readback hydration, child control propagation, persisted
  dry-run records, HTTP/CLI/MCP parity, local API auth retry, and reattaching
  a replacement active child after an older attached child fails.
- additional deterministic coverage includes policy-upgrading an idle
  live-follow completion into bounded full-sweep materialization, suppressing
  duplicate live-follow startup while a bounded campaign child is active, and
  hydrating persisted materialization job asset/checksum/routeability evidence
  into campaign metrics.
- installed user runtime and `auracall-api.service` were reinstalled from this
  worktree.
- authenticated `/status` on `127.0.0.1:18095` exposed
  `/v1/account-mirrors/reconciliations` and reported live-follow healthy with
  six enabled active targets.
- installed CLI dry-run campaign
  `acctmirror_reconciliation_144abd13-3842-47c2-b33f-16f8b1ee5bfa` enumerated
  ten targets without browser work: six already active and four unconfigured.
- installed CLI execution campaign
  `acctmirror_reconciliation_d10f53c4-7683-45c0-89ea-57983b150deb` selected
  five already-active targets and attached their existing child completions;
  this proved duplicate avoidance and installed auth/readback, but did not
  prove new full-sweep materialization because all enabled targets were already
  occupied by live-follow completions.
- installed campaign `acctmirror_reconciliation_c3215fb5-c3f6-4df5-a013-674d9b689f71`
  later claimed/upgraded the Gemini `default` child, completed a full-sweep
  pass, and queued history-materialization job
  `hmj_09f57e2164b04a5da2fdd5bb5b7d43cf`.
- that Gemini materialization job reached terminal `skipped` with routeability
  evidence against bogus conversation id `download`; campaign readback exposed
  the terminal job metrics and evidence, but no asset checksum was produced.
- a subsequent API reinstall interrupted replacement materialization job
  `hmj_a03151837b4a4464a03ed2eeffb001d4`; the campaign reattached the newer
  Gemini child without retaining stale asset rows from the older child.

## Goal

An operator should be able to start one durable full multi-tenant
reconciliation campaign that:

- enumerates every configured account-bearing provider/runtime-profile target
- preflights identity, account binding, provider guard state, and browser
  profile ownership before browser work
- runs a bounded full sweep for eligible targets, progressively refreshing
  history/detail/manifests and materializing missing assets according to policy
- records terminal, delayed, disabled, unsupported, identity-mismatch, and
  provider-guard outcomes per target without blocking the whole campaign
- exposes aggregate campaign status through API, CLI, MCP, and the operator UI
- survives API service restarts and resumes or reports unfinished target work
  without duplicating active completions

## Non-Goals

- Do not submit prompts as part of reconciliation.
- Do not make `/status`, `/v1/search`, account-mirror catalog, or catalog item
  reads launch browsers.
- Do not bypass provider guard hard stops, CAPTCHA/human-verification policy,
  browser dispatcher ownership, live-follow politeness, or foreground-work
  yield rules.
- Do not assume projects, files, or prompts are synchronized across tenants.
  Project divergence remains reported evidence, not an error to hide.
- Do not delete cached rows merely because one bounded campaign did not observe
  them. Tombstone/terminal evidence still requires provider validation.
- Do not build provider-specific campaign engines when the existing
  completion/materialization services can be composed.

## Tenant Identity Model

Closed-plan note, 2026-05-25: this section describes campaign execution
binding fields, not mirror cache ownership. Plan 0072 owns the stricter
tenant/cache boundary:

- tenant cache identity is provider service plus bound identity key
- AuraCall runtime profile, browser profile, managed browser profile path, and
  launch evidence are binding/provenance fields
- moving a tenant between browser bindings should not require account-mirror
  catalog/cache migration

The campaign execution binding must still be explicit and stable:

- provider: `chatgpt`, `gemini`, `grok`, or later provider id
- AuraCall runtime profile
- browser profile
- managed browser profile path or browser-profile key
- bound identity key and observed identity evidence
- optional account level / account plan type
- optional project scope when a target is intentionally project-bound

The campaign should treat two targets as distinct when any of these fields can
change provider state, browser state, quota lane, or cache namespace.

## Campaign Algorithm

### 1. Discover Targets

Use existing status/config projections rather than scraping:

1. read configured live-follow desired state
2. read account-mirror status for cache and failure/backoff evidence
3. merge active/recent completion records for in-progress target ownership
4. classify each target as:
   - `eligible`
   - `disabled`
   - `unconfigured`
   - `unsupported_provider`
   - `missing_identity`
   - `identity_mismatch`
   - `provider_guard`
   - `cooldown_wait`
   - `foreground_backpressure`
   - `already_active`

Discovery is cache/config/status-only. It must not acquire a browser lock.

### 2. Plan Work

Create one campaign plan with:

- target ordering:
  - operator-selected targets first
  - targets with known missing assets
  - stale/partial mirrors
  - incomplete full-sweep cursors
  - least recently refreshed eligible mirrors
- target budgets:
  - max targets per campaign pass
  - max active browser profiles
  - max active target completions per provider
  - per-target materialization max items
  - optional stop-after no-new-assets / no-stale-targets thresholds
- policy fields:
  - `sweepMode = full_sweep` by default for this campaign type
  - `materializationPolicy = full_missing_assets` by default
  - asset kinds default to all fetchable provider asset classes
  - provider-specific collector timeouts reused from Plan 0070

### 3. Execute Targets

For each eligible target:

1. reserve the target in the campaign record
2. start or attach to one account-mirror completion for that target
3. run identity preflight and provider guard checks through existing paths
4. run full-sweep refresh with persisted cursors
5. hand off missing assets to the history-materialization service
6. persist target status and latest child ids:
   - completion id
   - materialization job id
   - pass count
   - refresh snapshot counts
   - materialized count
   - skipped/failed/terminal count
   - remaining detail surfaces
   - remaining missing assets
   - next eligible wake

Target failure is isolated. A Gemini `google.com/sorry` guard, a ChatGPT account
challenge, a Grok unsupported history materialization path, or one identity
mismatch should mark only that target/campaign row and continue other targets.

### 4. Resume And Reconcile

On API startup or campaign status read:

- hydrate campaign records from user-scoped state
- attach to active child completions/materialization jobs when present
- classify missing child ids as interrupted and recover using the existing
  completion/materialization recovery contracts
- continue queued target work only when the operator requested a running
  campaign and the target is eligible under current politeness/backoff rules
- never duplicate an active live-follow completion for the same target

### 5. Report Status

Campaign status should be explicit enough for operators and agents:

- aggregate state:
  - `queued`, `running`, `idle_waiting`, `blocked`, `completed`,
    `completed_with_skips`, `cancelled`, `failed`
- counts by provider and target state
- total known conversations, stale conversations, missing local assets,
  materialized assets, terminal unavailable rows, and provider guards
- per-target row summaries with linked child operation ids
- next wake/retry time and reason
- recommended operator action for blocked targets
- bounded recent events and validation evidence

## Public Surface

Prefer a small campaign surface under the account-mirror namespace.

API:

- `POST /v1/account-mirrors/reconciliations`
- `GET /v1/account-mirrors/reconciliations`
- `GET /v1/account-mirrors/reconciliations/{campaign_id}`
- `POST /v1/account-mirrors/reconciliations/{campaign_id}` for cancel, pause,
  resume, and run-next-pass controls

CLI:

- `auracall api mirror-reconcile-all --port <port> --json`
- filters:
  - `--provider`
  - `--runtime-profile`
  - `--identity`
  - `--include-disabled`
  - `--max-targets`
  - `--max-active-targets`
  - `--materialization-policy`
  - `--materialization-max-items`
  - `--dry-run`
- status:
  - `auracall api mirror-reconciliation-status <campaign_id> --json`
- control:
  - `auracall api mirror-reconciliation-control <campaign_id> pause|resume|cancel|run-next-pass --json`

MCP:

- `account_mirror_reconciliation_create`
- `account_mirror_reconciliation_status`
- `account_mirror_reconciliation_control`

Operator UI:

- Health dashboard action: "Reconcile all eligible tenants"
- campaign detail view:
  - provider/runtime/identity target table
  - target progress and child operation links
  - guard/identity/cooldown attention queue
  - campaign pause/resume/cancel/run-next-pass controls
  - aggregate materialized artifact/hash counts
  - open detail gap: direct catalog/search row links

## Implementation Slices

1. Campaign data model and dry-run planner (implemented)
   - add a durable campaign store under account-mirror cache state
   - implement target discovery from config/status/completion records
   - add dry-run API/CLI/MCP readback with no browser work
   - deterministic tests for target classification and ordering

2. Campaign execution coordinator (implemented for bounded child starts and
   deferred pass advancement)
   - start or attach one completion per eligible target
   - enforce concurrency by provider and browser profile
   - persist child completion/materialization ids and target summaries
   - isolate per-target failures and continue remaining eligible targets

3. Resume/recovery semantics (implemented for child hydration/startup
   recovery; deeper interrupted-child reconstruction remains to prove live)
   - hydrate active campaign state on API startup
   - attach to active child jobs or mark interrupted children through existing
     recovery contracts
   - prove no duplicate live-follow completion is created for one target
   - prove cancellation boundaries for queued, running, and completed children

4. API/CLI/MCP parity (implemented for create/list/read/control and
   run-next-pass)
   - expose create/list/read/control surfaces
   - preserve consistent error types for missing campaigns, invalid controls,
     provider guards, and identity mismatches
   - add text and JSON summaries that include recommended operator actions

5. Operator UI campaign view (implemented for Health campaign launcher/list/
   detail/control and artifact aggregates; catalog/search target links remain)
   - add a campaign launcher gated behind explicit operator action
   - add campaign list/detail views in the React operator console
   - link target rows to account-mirror catalog/search rows and child job status
   - keep row open/read flows cache-only

6. Live dogfood and provider closeout
   - run dry-run against the installed service to verify target enumeration
     (proved)
   - run one bounded campaign across a small selected target set (proved for
     already-active attachment without duplicate child creation)
   - prove active-child campaign claim/upgrade (proved for Gemini/default)
   - then run a full eligible-target campaign with conservative concurrency
     (proved with ChatGPT materialization plus isolated target timeout)
   - record per-provider results:
     - ChatGPT history/file/artifact reconciliation (proved)
     - Gemini rail/project full-sweep reconciliation and terminal route misses
       (partial; static route filtered, current live retry blocked by account
       chooser)
     - Grok supported metadata plus explicit unsupported media/history evidence
       (deferred to provider-specific follow-up)

## Acceptance Criteria

- A dry-run campaign lists every configured live-follow target with provider,
  AuraCall runtime profile, browser profile, bound identity, desired state, and
  reasoned eligibility without browser mutations.
- Starting a campaign creates one durable campaign record and starts or attaches
  child operations without duplicating already-active target completions.
- Mixed target states are handled independently: one provider guard,
  identity mismatch, unsupported provider feature, or cooldown does not block
  eligible targets for other tenants.
- A bounded campaign can materialize missing assets for more than one tenant and
  report artifact hashes associated with provider conversation ids and bound
  identities. (proved for ChatGPT `wsl-chrome-4` and `wsl-chrome-3`)
- Campaign status survives API restart and reports accurate aggregate and
  per-target state after hydration.
- Cache-only reads remain cache-only and never acquire browser locks.
- Provider hard stops still require human clearance before retry.
- Operator UI, CLI, API, and MCP surfaces agree on campaign state and child
  operation links.

## Definition Of Done

- Plan 0071 is wired from `ROADMAP.md`, `RUNBOOK.md`, and the dev journal.
- Campaign dry-run, create/status/control, and startup hydration have targeted
  deterministic tests.
- API, CLI, MCP, and React operator surfaces expose the same campaign object.
- Installed-runtime dry-run proof records all configured targets without browser
  mutation.
- Installed-runtime bounded live proof reconciles at least two distinct
  provider/runtime-profile targets and records materialized or terminal
  evidence per target. (proved by campaign
  `acctmirror_reconciliation_87fbb97c-88ce-4294-92b2-a471df9c9279`)
- `pnpm run plans:audit -- --keep 70`, `git diff --check`, targeted tests,
  and `pnpm run build` pass before closeout.
