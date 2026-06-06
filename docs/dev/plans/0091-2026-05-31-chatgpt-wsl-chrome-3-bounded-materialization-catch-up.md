# ChatGPT WSL Chrome 3 Bounded Materialization Catch-Up Plan | 0091-2026-05-31

State: CLOSED
Lane: P01

## Purpose

Run the next bounded artifact-materialization milestone against the largest
clean actionable backlog: `chatgpt/wsl-chrome-3` bound to
`eric.cochran@soylei.com`. Recent Gemini work proved that selected artifact
recovery can produce file-available archive/search rows with checksums, but
fleet materialization is still incomplete. The current recovery readback shows
`422` remote-known missing local assets across all targets, and
`chatgpt/wsl-chrome-3` accounts for `133` of the clean eligible assets.

This plan keeps the work incremental: one capped installed-runtime catch-up
batch, before/after counts, and terminal evidence for every attempted item.

## Current State

- Latest completed plan:
  `docs/dev/plans/0090-2026-05-31-gemini-cached-uploaded-file-salvage.md`.
- Installed recovery-candidate readback currently reports:
  - `8` targets returned;
  - `3` eligible;
  - `2` needing detail refresh;
  - `3` blocked;
  - `422` remote-known missing local assets;
  - `6` unknown or deferred assets.
- `chatgpt/wsl-chrome-3` is eligible with high confidence and:
  - action `start_materialization_policy_completion`;
  - `133` remote-known missing local assets;
  - `25` local materialized assets;
  - `0` unknown or deferred assets;
  - materialization policy `full_missing_assets`.
- `chatgpt/wsl-chrome-4` and `chatgpt/default` are also eligible, but both are
  lower-priority for this slice because they require queued history
  materialization and have smaller missing-local counts.
- `chatgpt/wsl-chrome-2` has a large backlog, but is blocked by identity
  mismatch and must remain out of materialization execution until a separate
  identity plan fixes the binding.
- Broad `auracall api status --json` currently aborts with a DOM
  `AbortError`, so this plan must use dedicated recovery, job, archive, and
  search readback surfaces for proof.

## Scope

- Baseline the installed `chatgpt/wsl-chrome-3` target with dedicated
  recovery-candidate, archive/search, and history-materialization-job readback.
- Start one bounded installed-runtime materialization batch for
  `chatgpt/wsl-chrome-3`.
- Use a conservative cap, initially `maxItems=25` or smaller if live browser
  conditions suggest more caution.
- Materialize all supported asset kinds for remote-known missing local assets.
- Poll to a terminal job/completion state and record:
  - conversations attempted;
  - assets materialized;
  - skipped entries;
  - failed entries;
  - local paths;
  - SHA-256 checksums;
  - archive/search item ids where available.
- Compare before/after recovery counts for the target and global backlog.
- Leave no active history-materialization jobs behind.

## Non-Goals

- Do not run broad fleet catch-up.
- Do not touch `chatgpt/wsl-chrome-2` while it is identity-mismatched.
- Do not change tenant/browser/runtime-profile selection semantics.
- Do not treat metadata-only live follow as sufficient artifact recovery.
- Do not fix the broad `/status --json` abort in this slice.
- Do not change the retired frontend.
- Do not broaden Gemini recovery beyond readback checks already needed for
  fleet health context.

## Architecture Boundaries

- Recovery-candidate readback chooses the target; provider browser work must
  remain identity-gated by the configured binding.
- Materialization execution must go through installed API/runtime paths, not
  direct service internals.
- Archive/search rows are the durable proof for file availability, local path,
  checksum, and materialization freshness.
- Failures must remain explicit and terminal enough for follow-up triage; do
  not hide failed downloads behind optimistic missing-local count language.
- Dedicated readback surfaces remain the authority while default `/status`
  readback is aborting.

## Implementation Tracks

### Track 1 | Baseline And Guardrails

Status: completed.

Closeout:
- Installed recovery baseline showed `chatgpt/wsl-chrome-3` eligible with
  high confidence, `133` remote-known missing local assets, `25` local
  materialized assets, and `0` unknown/deferred assets.
- Installed archive baseline showed `25` file-available generated artifacts.
- Installed history-materialization baseline showed `78` terminal jobs and
  `0` active jobs.
- Broad `/status --json` remained unsuitable for this proof, so all evidence
  came from dedicated recovery, archive, and job readback.

### Track 2 | Bounded Execution

Status: completed with safety fix.

Closeout:
- The first installed attempt used the intended scoped request:
  `hmj_232d2976d4c847838f5e7d46d04d9b29`, `reconcile=true`,
  `assetKinds=[artifacts,files,media]`, `refreshSnapshot=true`,
  `maxItems=25`.
- That attempt exposed two coupled safety bugs:
  - reconciliation treated `maxItems` as a conversation budget, so
    `maxItems=25` allowed up to 25 target conversations and each target could
    receive its own artifact cap instead of sharing one remaining asset
    budget;
  - ChatGPT Deep Research discovery listed every DevTools `iframe` target on
    the managed browser port and then stamped the visible report with the
    requested conversation id. A stale Deep Research OOPIF from another
    conversation could therefore become
    `deep-research:<current-target-conversation>:0:*`, making the same
    `SoyFuze Chemical Composition Dossier` look like a new missing artifact
    for each stale/duplicate row.
- The job cancel endpoint returned HTTP 409 after provider work started, so
  the API service was stopped to halt the loop. Startup recovery then marked
  the interrupted job `failed`.
- The implementation now deduplicates repeated reconciliation asset-family
  signatures within a job and carries a remaining asset budget into each
  target, preserving the existing rule that terminal route misses do not spend
  the next target.
- The ChatGPT adapter now scopes Deep Research OOPIF harvesting to iframe URLs
  embedded in the active conversation page and requires the captured iframe
  identity before clicking DOCX/PDF export controls.
- The observed model-control clicks during SoyFuze downloads came from a third
  issue: `LlmService.resolveCacheIdentity()` invoked the ChatGPT
  feature-signature probe, and that probe opens the model control to enumerate
  visible model/depth options. History materialization now sets
  `skipFeatureSignature=true` so artifact fetches preserve identity preflight
  without opening the model picker.
- A guarded installed proof job,
  `hmj_7305d6ad022249ceaf8016ec920df832`, ran with `maxItems=4` and reached
  terminal `skipped` without looping.

### Track 3 | Evidence Reconciliation

Status: completed.

Closeout:
- The interrupted `maxItems=25` run left no result entries because it was
  stopped at the service boundary, but archive/recovery readback showed one
  additional available generated artifact.
- Target recovery moved from `133` to `132` remote-known missing local assets
  and local materialized assets moved from `25` to `26`.
- The guarded proof job produced exactly four terminal entries:
  - three failed generated-image artifact fetches;
  - one skipped unsupported ChatGPT conversation-file fetch.
- No active history-materialization jobs remained after proof:
  `80` total jobs, `80` terminal, `0` active.
- No new `SoyFuze Chemical Composition Dossier` files were written in the
  post-fix five-minute check.

### Track 4 | Follow-Up Classification

Status: completed.

Closeout:
- Remaining `chatgpt/wsl-chrome-3` backlog is still large:
  `132` remote-known missing local assets, split as `50` artifacts and `82`
  files.
- Further scale should not continue as broad ChatGPT reconciliation until the
  next plan separates:
  - stale/duplicate ChatGPT conversation rows that point at the same Deep
    Research artifact family;
  - generated-image rows that are favicon/static-image false positives;
  - unsupported ChatGPT conversation-file fetches, which currently consume
    terminal proof entries but cannot materialize through the ChatGPT adapter.
- The next bounded plan should be ChatGPT catalog hygiene and asset-kind
  eligibility before another catch-up batch.

## Acceptance Criteria

- Plan 0091 is wired into `ROADMAP.md`, `RUNBOOK.md`, and
  `docs/dev/dev-journal.md`.
- Baseline evidence records the current `chatgpt/wsl-chrome-3` missing-local
  count before execution.
- Exactly one bounded installed-runtime catch-up operation is started for
  `chatgpt/wsl-chrome-3`.
- The operation reaches a terminal state or records a precise blocker without
  leaving hidden active jobs.
- New materialized assets, skips, and failures are all visible through
  durable job/archive/search readback.
- The closeout reports before/after missing-local counts and whether another
  capped batch is justified.

## Validation Plan

- Plan/doc gates:
  - `pnpm run plans:audit -- --keep 91`;
  - `git diff --check`.
- Installed readback gates:
  - recovery candidates for `chatgpt/wsl-chrome-3`;
  - archive/search counts for the same target;
  - history-materialization jobs before and after;
  - terminal operation status.
- Optional checksum gate:
  - `sha256sum` on newly materialized local paths when the paths are exposed
    and accessible.

## Definition Of Done

- The largest clean actionable ChatGPT backlog has one completed bounded
  catch-up pass or a precise live-runtime blocker.
- Materialization health is described in artifact terms: files, paths,
  checksums, archive/search rows, and reduced missing-local counts.
- Remaining backlog is classified into the next bounded plan instead of being
  treated as automatic live-follow catch-up.

Closeout:
- Done. Plan 0091 executed one scoped installed catch-up attempt, stopped and
  fixed the duplicate-download safety bug it exposed, then proved the patched
  path with a smaller terminal installed job.
- Do not resume broad `chatgpt/wsl-chrome-3` catch-up directly from this plan.
  Open a new bounded catalog-hygiene plan first.
