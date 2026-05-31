# Gemini Materialization Health Plan | 0088-2026-05-31

State: OPEN
Lane: P01

## Purpose

Make Gemini conversation-level artifact retrieval safe to run unattended before
expanding beyond bounded proof jobs. Plan 0087 proved that a selected Gemini
conversation can refresh routeably and materialize a checksum-bearing local
asset, but it also exposed three separate health gaps: API-created
history-materialization jobs can stay queued, Gemini conversation catalog
readback can include malformed sign-in/static app rows, and conversation-level
live-follow rollups can still describe materialized conversations as deferred.

This plan closes those health gaps without starting a broad Gemini catch-up
campaign.

## Current State

- `gemini/auracall-gemini-pro` project/Gem discovery is clean:
  - installed readback shows no project manifests;
  - Google/third-party catalog Gems such as `chess-champ`, `brainstormer`, and
    `storybook` are no longer returned as editable project targets.
- Plan 0087 materialized one selected Gemini conversation asset:
  - job `hmj_19f26f2121ff40a285642beb2bfc96b5`;
  - conversation `8e8e58b57ae544ea`;
  - artifact `Before The Tide Returns`;
  - local MP4 path and SHA-256 checksum recorded in archive/search readback.
- That job did not advance automatically after API creation; it only reached
  terminal state after the persisted job was run once through the compiled
  history-materialization service.
- Gemini conversation catalog readback still contains invalid candidates such
  as `accounts.google.com/ServiceLogin` redirect rows and static Gemini app
  routes.
- Archive/search readback exposes the materialized artifact freshness, but
  account-mirror conversation rollups can still use deferred-inventory wording
  for cached conversation rows.

## Root Cause Summary

Gemini retrieval is no longer blocked by project/Gem pollution or by absence of
provider materialization capability. The remaining risk is orchestration and
readback truthfulness: queued jobs need reliable background pickup, candidate
selection must reject non-conversation URLs before browser work starts, and
operator-facing conversation rollups must reflect successful materialization
instead of leaving users in a metadata/deferred-only mental model.

## Scope

- Diagnose and fix why API-created history-materialization jobs can remain
  `queued` instead of being claimed by background work.
- Add Gemini conversation candidate hygiene so catalog/search/recovery paths do
  not surface Google sign-in redirect rows, static app routes, downloads pages,
  or malformed ids as retrievable conversations.
- Reconcile archive/search materialization freshness into conversation-level
  account-mirror readback so successfully materialized conversations no longer
  look purely deferred.
- Prove the repaired path with one bounded Gemini job created through the
  installed API/CLI and allowed to complete through the normal dispatcher path.
- Keep execution bounded to one to three selected Gemini conversations with
  `refreshSnapshot=true`, `assetKinds=[all]`, and conservative `maxItems`.

## Non-Goals

- Do not run a broad Gemini catch-up campaign.
- Do not target Gemini project/Gem URLs.
- Do not recreate, edit, or mutate Gemini Gems or conversations.
- Do not cycle through Google-made or third-party Gems.
- Do not bypass provider guard, browser queue ownership, CAPTCHA, Google
  `sorry`, account chooser, or cooldown rules.
- Do not change the retired frontend.
- Do not broaden to ChatGPT, Grok, or other providers except for regression
  tests around shared history-materialization job dispatch.

## Architecture Boundaries

- Job dispatch reliability belongs to the HTTP/runtime
  history-materialization service and background-work ownership path.
- Gemini URL/id validation belongs at the provider/catalog boundary that
  creates or accepts conversation candidates, with shared defensive validation
  before materialization starts.
- Materialization freshness reconciliation belongs in account-mirror/search
  readback projection, not in provider scraping.
- Cache-only catalog/search reads must remain browser-free.
- Provider/browser work must remain explicit through bounded
  history-materialization jobs or live-follow completion work.

## Implementation Tracks

### Track 1 | Queued Job Pickup

Status: planned.

- Reproduce the queued-job state with a bounded test or local API harness.
- Trace API route creation through `createHistoryMaterializationService()`,
  foreground/background scheduling, and persisted job state.
- Fix the smallest ownership gap that prevents queued jobs from being claimed.
- Add regression coverage proving an API-created job advances from `queued` to
  `running` or terminal state without a manual `runJob()` call.
- Preserve cancellation, provider guard, cooldown, and browser-operation queue
  behavior.

### Track 2 | Gemini Conversation Candidate Hygiene

Status: planned.

- Identify the catalog/search/recovery path that admits Gemini sign-in redirect
  rows and static app routes.
- Require canonical Gemini conversation candidates before materialization:
  - same-origin `https://gemini.google.com/app/<conversation-id>`;
  - non-static app id;
  - no query/fragment-contaminated ids;
  - no Google sign-in, download, settings, Gem, or catalog URLs.
- Keep valid direct Gemini conversation ids accepted for selected operator
  runs.
- Add regression coverage for the malformed rows observed during Plan 0087.

### Track 3 | Conversation Rollup Freshness

Status: planned.

- Inspect how search/archive `assetFreshness` is computed for materialized
  history artifacts.
- Project materialized archive/search freshness into conversation-level
  account-mirror readback when provider, runtime profile, conversation id, and
  artifact identity match.
- Ensure remaining truly unscanned conversations still show deferred/unknown
  inventory honestly.
- Add tests for:
  - materialized conversation asset suppressing stale deferred-only wording;
  - still-deferred conversation with no materialized asset retaining deferred
    inventory language;
  - terminal skip/failure evidence remaining visible.

### Track 4 | Installed Runtime Proof

Status: planned.

- Build, install, and restart the user-scoped runtime if code changes are
  required.
- Create one bounded Gemini history-materialization job through the installed
  API/CLI and verify it advances without direct service invocation.
- Poll the job to terminal state.
- Verify archive/search readback and conversation-level catalog/search readback
  agree on the materialization outcome.
- Confirm no malformed Gemini catalog rows are selected as candidates and no
  non-editable Gem URLs are visited.

## Acceptance Criteria

- API-created history-materialization jobs no longer remain indefinitely
  `queued` when the service is healthy and background work is enabled.
- A regression test proves queued job pickup through the API/runtime scheduling
  path.
- Gemini conversation candidates reject malformed sign-in redirect rows, static
  app routes, download pages, and query/fragment-contaminated ids before
  provider browser work starts.
- A regression test covers the observed malformed Gemini rows.
- Conversation-level account-mirror/search readback reflects successful
  materialization freshness for a conversation with a materialized asset.
- Deferred inventory language remains for conversations that have not received
  terminal detail/materialization evidence.
- Installed runtime proof creates and completes one bounded Gemini job through
  the normal API path, with local path/checksum or terminal no-asset/skip/fail
  evidence.
- The run does not visit `chess-champ`, `brainstormer`, `storybook`, or other
  Google/third-party Gem URLs.

## Validation Plan

- Targeted tests:
  - history-materialization service/API job scheduling coverage;
  - Gemini candidate canonicalization/filtering coverage;
  - account-mirror/search freshness projection coverage.
- Static gates:
  - `pnpm run typecheck`
  - targeted `biome lint` for touched files
  - `pnpm run plans:audit -- --keep 88`
  - `git diff --check`
- Installed proof if runtime code changes:
  - `pnpm run build`
  - `pnpm run install:user-runtime-service`
  - `systemctl --user restart auracall-api.service`
  - `systemctl --user is-active auracall-api.service`
  - bounded installed Gemini `history-materialization-create` followed by
    normal polling to terminal state
  - archive/search/catalog readback for the attempted conversation

## Definition Of Done

- Plan 0088 is wired into `ROADMAP.md`, `RUNBOOK.md`, and
  `docs/dev/dev-journal.md`.
- The queued-job pickup defect is fixed or has a precise runtime blocker with
  no hidden queued work left behind.
- Gemini catalog/candidate hygiene prevents malformed rows from entering
  unattended retrieval.
- Conversation rollups and archive/search agree on materialized asset
  freshness for the bounded proof target.
- Code changes are tested, installed, and validated against the user-scoped
  runtime before closing the plan.
- If any provider guard, CAPTCHA, account chooser, or Google `sorry` page
  blocks the live proof, the plan records the exact unblocker and stops
  automated retries.
