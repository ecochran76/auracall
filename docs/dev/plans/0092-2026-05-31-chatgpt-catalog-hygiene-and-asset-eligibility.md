# ChatGPT Catalog Hygiene And Asset Eligibility Plan | 0092-2026-05-31

State: CLOSED
Lane: P01

## Purpose

Make the remaining `chatgpt/wsl-chrome-3` materialization backlog safe to
process by separating real retrievable assets from stale catalog duplicates,
static-image false positives, and unsupported ChatGPT conversation-file rows.

Plan 0091 proved the immediate duplicate-download and model-selector bugs are
fixed, but the latest bounded smoke still selected a favicon/static-image row
as a generated-image artifact. Broad catch-up should stay paused until the
catalog and eligibility layers stop presenting these rows as equally
actionable missing assets.

## Current State

- Latest completed plan:
  `docs/dev/plans/0091-2026-05-31-chatgpt-wsl-chrome-3-bounded-materialization-catch-up.md`.
- Installed proof job `hmj_6dee6359cc264789a495047d27c167ca` ran after the
  Plan 0091 fixes with:
  - `provider=chatgpt`;
  - `runtimeProfile=wsl-chrome-3`;
  - `boundIdentityKey=eric.cochran@soylei.com`;
  - `assetKinds=[artifacts]`;
  - `maxItems=1`.
- That proof reached terminal `skipped`, left active jobs at `0`, wrote no new
  `SoyFuze Chemical Composition Dossier` files, and produced no model-selector
  or feature-signature log hits after the pre-run service-log offset.
- Recovery readback for `chatgpt/wsl-chrome-3` still reports:
  - `132` remote-known missing local assets;
  - `26` local materialized assets;
  - `0` unknown or deferred assets;
  - split as `50` missing artifacts and `82` missing files.
- Remaining high-risk classes:
  - stale or duplicate ChatGPT conversation/catalog rows that refer to the same
    logical Deep Research report family;
  - DOM image rows that are favicons, static site icons, or citation chrome but
    are currently projected as generated-image artifacts;
  - ChatGPT conversation-file rows that are visible in metadata but not
    currently retrievable through the ChatGPT adapter.

## Backlog Classification Evidence

Read-only `chatgpt/wsl-chrome-3` catalog/recovery evidence collected on
2026-05-31 shows one eligible target with `132` remote-known missing local
assets and `26` local materialized assets. The catalog entry contained `30`
conversations, `76` artifact rows, and `82` file rows before archive overlay.

| Class | Count | Evidence shape | Eligibility | Operator meaning |
| --- | ---: | --- | --- | --- |
| Account-library files mirrored as files | 69 | `metadata.source=chatgpt-library`; `63` downloads, `4` images, `2` documents | `account_library_not_conversation_reconciliation` | Visible account-library inventory, but not a conversation-history reconciliation target. |
| Account-library files mirrored as artifact rows | 69 | `metadata.source=chatgpt-library`; same `63/4/2` split | `account_library_not_conversation_reconciliation` | Explains most artifact/file count inflation; keep visible, do not spend conversation materialization budget. |
| Static DOM image false positives | 3 | `image-dom:*`, `metadata.extraction=dom-imagegen-image`, title `Generated image 1`, URI is Google favicon service | `static_image_false_positive` | These are source favicons/site icons projected as generated images. They must not open provider/browser work. |
| Duplicate Deep Research family rows | 3 | `deep-research:*:0:markdown`, title `SoyFuze Chemical Composition Dossier`, `artifactKind=deep-research-report` | first logical family only; repeated rows `duplicate_family` | Plan 0091 family dedupe remains required so the same report cannot consume budget repeatedly. |
| ChatGPT conversation upload/file rows | 13 | id shape `<conversationId>:<turnId>:<index>:<filename>`, no retrievable URL/file id | `unsupported_conversation_file` | Visible metadata-only file rows. Keep visible with explicit unsupported reason until ChatGPT file retrieval exists. |
| Conversation download artifact | 1 | `bd8a65...:download:sandbox:/mnt/data/...`, URI `sandbox:/mnt/data/...` | `retrievable` | A real conversation-scoped downloadable artifact candidate. |

The failed Plan 0091 smoke selected
`image-dom:1a9a7dd0-3211-4c90-8b98-bd7306932b84:0` from conversation
`6a170520-131c-83ea-93b7-4a6b6c70d4b4`; its URI was
`https://www.google.com/s2/favicons?domain=https://www.imagemappro.com&sz=32`.
That proves the next broad pass was still starting with a static-image false
positive, not a generated-image binary.

## Scope

- Build a read-only classification of the remaining
  `chatgpt/wsl-chrome-3` missing-local backlog by asset family and eligibility.
- Define durable eligibility states for ChatGPT history materialization, for
  example:
  - `retrievable`;
  - `already_materialized_family`;
  - `duplicate_family`;
  - `static_image_false_positive`;
  - `unsupported_conversation_file`;
  - `needs_detail_refresh`;
  - `provider_guarded`.
- Tighten catalog/search/recovery projection so false positives and unsupported
  rows do not consume materialization budget as actionable assets.
- Preserve real Deep Research, canvas/textdoc, generated-image, and
  downloadable binary artifact paths that already have provider-backed fetch
  support.
- Add focused regression coverage for the known classes from Plan 0091:
  SoyFuze duplicate-family rows, favicon/static-image rows, and unsupported
  ChatGPT file rows.
- Run one small installed smoke only after classification proves the next
  candidate is not a known false-positive or unsupported row.

## Non-Goals

- Do not run broad `chatgpt/wsl-chrome-3` catch-up.
- Do not touch `chatgpt/wsl-chrome-2` while its tenant binding is
  identity-mismatched.
- Do not change tenant, browser profile, or AuraCall runtime profile selection
  semantics.
- Do not treat unsupported ChatGPT conversation files as successfully
  materialized.
- Do not reopen the retired frontend.
- Do not loosen Deep Research OOPIF scoping or re-enable interactive
  feature-signature probes during history materialization.

## Architecture Boundaries

- Catalog hygiene belongs at the account-mirror/search/recovery projection
  boundary and in provider-specific artifact classification helpers, not in
  operator UI filtering alone.
- Materialization execution must continue through installed API/runtime paths.
- Eligibility must be visible in durable readback so operators can distinguish
  missing-but-retrievable assets from terminally unsupported or filtered rows.
- Provider-specific heuristics for ChatGPT DOM images and Deep Research rows
  should stay in ChatGPT-owned adapter/metadata code unless a repeated pattern
  appears across providers.
- Archive/search rows must keep explicit terminal reasons rather than silently
  dropping risky rows from all readback.

## Implementation Tracks

### Track 1 | Backlog Classification

Status: completed.

- Read the current `chatgpt/wsl-chrome-3` recovery, catalog, search, and
  history-materialization job surfaces.
- Produce a bounded classification table for missing-local assets:
  - asset kind;
  - provider id / artifact id shape;
  - title or file name;
  - conversation id;
  - duplicate-family signature;
  - proposed eligibility state;
  - terminal reason when not retrievable.
- Confirm whether the current `132` missing-local count is mostly true
  retrievable backlog, unsupported file backlog, false-positive image backlog,
  or duplicate-family backlog.
  - Result: most flat missing-local count pressure comes from account-library
    file/artifact duplication and unsupported conversation-file rows; the next
    actionable conversation-history target pool must exclude static image
    false positives and unsupported conversation-file rows before browser work.

### Track 2 | Eligibility Semantics

Status: completed.

- Define the exact readback fields that expose eligibility without changing
  existing archive/search contracts unnecessarily.
  - Implemented catalog readback metadata for non-actionable ChatGPT rows:
    `metadata.materializationEligibility.state` and `.reason`.
- Ensure generated-image artifact candidates exclude obvious static chrome:
  favicons, site icons, citation/source icons, and tiny remote images that are
  not ChatGPT-generated outputs.
  - Implemented for ChatGPT `image-dom:*` / `dom-imagegen-image` rows whose
    location is missing or points at favicon/static chrome URLs.
- Ensure duplicate Deep Research families are counted once as actionable and
  subsequent stale rows are classified as duplicate-family or
  already-materialized-family.
  - Preserved Plan 0091 family-signature dedupe and made eligibility filtering
    run before family-signature budgeting.
  - Added cross-run protection by seeding the reconciliation family-skip set
    from already-complete catalog rows before candidate selection, so stale
    duplicate rows cannot spend budget after one logical family is complete.
- Ensure ChatGPT conversation files remain visible but are marked unsupported
  until the adapter has a real retrieval method.
  - Implemented for conversation-bound ChatGPT file rows without retrievable
    URL, cache key, or provider file id.

### Track 3 | Implementation And Tests

Status: completed.

- Add the narrow classifier/projection changes identified in Track 2.
  - Implemented in `src/accountMirror/catalogService.ts` and
    `src/runtime/historyMaterializationService.ts`.
- Add tests for:
  - SoyFuze-like duplicate Deep Research families;
  - favicon/static-image false positives;
  - unsupported ChatGPT conversation files;
  - preservation of legitimate retrievable artifacts.
  - Existing SoyFuze family-budget test remains in place.
  - Added cross-run duplicate-family coverage proving a stale SoyFuze-like row
    is skipped when a later catalog row already proves the same logical family
    complete.
  - Added static-image and unsupported-file reconciliation tests.
  - Added catalog readback eligibility annotation coverage.
- Keep the change scoped to catalog/search/recovery/materialization planning
  unless classification reveals a direct provider fetch bug.

### Track 4 | Installed Smoke

Status: completed.

- Rebuild, reinstall, and restart the user-scoped runtime if code changes are
  required.
  - Completed with `pnpm run build`, `pnpm run install:user-runtime-service`,
    and `systemctl --user restart auracall-api.service`.
- Confirm active `chatgpt/wsl-chrome-3` history-materialization jobs are `0`.
  - Confirmed before and after the final installed proof.
- Run one capped installed smoke only when the next selected candidate is
  classified as retrievable.
  - Final proof job `hmj_596774a0d81b4d82bf2bef831c232990` ran with
    `assetKinds=[artifacts]`, `maxItems=1`, `reconcile=true`, and
    `refreshSnapshot=true`.
  - It skipped the known favicon/static-image rows and selected
    `deep-research:6a09ccc6-6d2c-83ea-82c1-ed33c2150935:0:markdown`, a
    provider-backed `chatgpt://conversation/.../deep-research/0/markdown`
    artifact.
- Acceptance proof should report:
  - terminal job id;
    - `hmj_596774a0d81b4d82bf2bef831c232990`, terminal `succeeded`.
  - attempted candidate;
    - `SoyFuze Chemical Composition Dossier` markdown Deep Research artifact
      for conversation `6a09ccc6-6d2c-83ea-82c1-ed33c2150935`.
  - eligibility state;
    - retrievable Deep Research document; static image false positives remain
      annotated separately and were not selected.
  - local path/checksum when materialized, or terminal reason when skipped;
    - local path:
      `/home/ecochran76/.auracall/cache/providers/chatgpt/eric.cochran@soylei.com/conversation-attachments/6a09ccc6-6d2c-83ea-82c1-ed33c2150935/files/deep-research-6a09ccc6-6d2c-83ea-82c1-ed33c2150935-0-markdown/SoyFuze Chemical Composition Dossier.md`;
    - SHA-256:
      `76cc6e2faf9a4157e778544a4becdb1056baf5c52e299935e23da5157d0378c8`.
  - no new duplicate SoyFuze files;
    - exactly one markdown file was written by the proof; it is the first
      logical-family materialization selected after the favicon rows were
      skipped, not a repeated PDF/DOCX loop.
  - no model-selector/feature-signature log hits.
  - service-log scan from byte offset `1149188` found no
      `feature-signature`, model selector/control/picker, `chatgpt.model`,
      `SoyFuze`, or Deep Research log hits.
- Follow-up duplicate-family proof after the completion audit:
  - rebuilt, reinstalled, and restarted `auracall-api.service` after adding the
    complete-family preselection guard.
  - targeted regression suite passed with `43` tests.
  - installed proof job `hmj_323fbf35352044799e28989e08400313` ran with
    `assetKinds=[artifacts]`, `maxItems=1`, `reconcile=true`, and
    `refreshSnapshot=true`.
  - it did not select stale SoyFuze duplicate conversations
    `6a0632eb-65b4-83ea-ad6d-a5fb4cf9dd10` or
    `6a06302d-21bc-83ea-800c-eeea27d6f38f`; instead it refreshed
    `6a092419-33c0-83ea-bca8-27c694312842` and skipped one non-downloadable
    sandbox DOCX artifact.
  - active history-materialization jobs returned to `0`.
  - no new `SoyFuze` / `Chemical Composition Dossier` files were written after
    `2026-05-31T20:22:20-05:00`.
  - service-log scan after byte offset `1151339` found no
    `feature-signature`, model selector/control/picker, `SoyFuze`, or Deep
    Research hits.

## Acceptance Criteria

- Plan 0092 is wired into `ROADMAP.md`, `RUNBOOK.md`, and
  `docs/dev/dev-journal.md`.
- `chatgpt/wsl-chrome-3` missing-local backlog is classified into actionable
  and non-actionable categories with durable evidence.
- Favicon/static-image rows no longer present as actionable generated-image
  materialization targets.
- Duplicate Deep Research family rows no longer spend repeated
  materialization budget after one logical family is materialized or
  terminally classified.
- Unsupported ChatGPT conversation-file rows remain visible with explicit
  unsupported reasons instead of being treated as retrievable.
- A small installed smoke proves the next eligible candidate selection no
  longer starts with the known false-positive classes, or records a precise
  blocker before provider work starts.

## Closure Evidence

- Local validation:
  - `pnpm vitest run tests/runtime.historyMaterializationService.test.ts tests/accountMirror/catalogService.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceIdentity.test.ts --maxWorkers 1`
  - `pnpm run typecheck`
  - `pnpm exec biome lint src/accountMirror/catalogService.ts src/runtime/historyMaterializationService.ts tests/accountMirror/catalogService.test.ts tests/runtime.historyMaterializationService.test.ts`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 92`
  - `git diff --check`
- Installed validation:
  - catalog readback showed `3` annotated `static_image_false_positive`
    artifact rows and `13` annotated `unsupported_conversation_file` rows.
  - active history-materialization jobs for `chatgpt/wsl-chrome-3` were `0`
    before and after the final proof.
  - final proof job `hmj_596774a0d81b4d82bf2bef831c232990` materialized one
    retrievable Deep Research markdown artifact and did not start with the
    favicon/static-image class.
  - follow-up proof job `hmj_323fbf35352044799e28989e08400313` did not reselect
    stale SoyFuze duplicate-family rows after the complete-family preselection
    guard was installed; it skipped one non-downloadable sandbox DOCX artifact
    and left active jobs at `0`.

## Validation Plan

- Read-only baseline:
  - recovery candidates for `chatgpt/wsl-chrome-3`;
  - catalog/search rows for the same target;
  - history-materialization jobs active/terminal counts.
- Targeted tests for classification and eligibility behavior.
- Static gates for touched code:
  - `pnpm run typecheck`;
  - targeted `biome lint` for touched files.
- Plan/doc gates:
  - `pnpm run plans:audit -- --keep 92`;
  - `git diff --check`.
- Installed proof if runtime behavior changes:
  - `pnpm run build`;
  - `pnpm run install:user-runtime-service`;
  - `systemctl --user restart auracall-api.service`;
  - bounded installed history-materialization smoke;
  - post-run active-job, SoyFuze-file, and service-log checks.

## Definition Of Done

- The remaining ChatGPT backlog is no longer a flat “132 missing assets”
  bucket; it is split into retrievable, duplicate, false-positive, and
  unsupported classes.
- Materialization planning skips or terminally classifies non-actionable rows
  before provider/browser work.
- Broad ChatGPT catch-up remains paused until a small installed smoke proves
  candidate eligibility is selecting real retrievable assets.
