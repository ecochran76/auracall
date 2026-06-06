# ChatGPT Account-Library Reconciliation Plan | 0099-2026-06-01

State: CLOSED
Lane: P01

## Purpose

Finish the remaining Plan 0098 work by adding an explicit, capped ChatGPT
account-library reconciliation lane. Selected account-library materialization
now works and can create archive item ids plus asset routes, including for
stale account-mirror catalog rows. What is still missing is a broad but bounded
operator workflow that can select eligible account-library files, materialize
them without re-downloading already archived families, and prove whether
live-follow can safely consume the lane.

## Current State

- Active parent lane:
  `docs/dev/plans/0098-2026-06-01-chatgpt-account-library-retrieval.md`.
- Latest completed ChatGPT history baseline:
  `docs/dev/plans/0097-2026-06-01-complete-chatgpt-materialization.md`.
- Plan 0098 proved selected account-library retrieval for
  `chatgpt/wsl-chrome-3`:
  - installed CLI download exits cleanly after success;
  - selected file proof wrote a 492,700 byte, 10-page PDF with SHA-256
    `6629baf1bbfcb550b0e94e6338688e312fd7a99e2c09172c29f05c893955a25e`;
  - installed archive-linked job
    `hmj_e3a49eca13f64788a4065f9adeaf9b9a` materialized stale catalog item
    `325dcf29-906e-55c2-a5e3-797c5c50e2e0`;
  - the job resolved current account-file row
    `c3584433-36a3-5919-a347-bfea83f07343`;
  - archive item
    `history-file:chatgpt:eric.cochran_soylei.com:account-library:c3584433-36a3-5919-a347-bfea83f07343`
    returned HTTP `200`, `492700` bytes, PDF prefix, and the expected checksum;
  - active jobs returned to `0`.
- Recovery readback remains intentionally conservative:
  - history-lane `retrievableMissingLocal.total=0`;
  - history-lane `createRequest=null`;
  - account-library rows remain outside automatic history recovery;
  - account-library inventory can expose routeable rows, but there is no
    explicit reconciliation request shape yet.

## Scope

- Add an explicit account-library reconciliation request mode separate from
  history reconciliation.
- Select eligible account-library file rows from the current account-library
  inventory and account-mirror catalog.
- Materialize only rows with current download authority:
  - current provider file id;
  - `chatgpt://file/<providerFileId>` handle;
  - or a stale catalog item that resolves to one current account-file row.
- Preserve history-lane recovery truth:
  account-library rows must not make the history recovery candidate appear
  retrievable.
- Prove installed capped reconciliation for `chatgpt/wsl-chrome-3` with
  `maxItems=1`, then `maxItems=3`.
- Decide whether the lane remains manual/operator-only, preview-only, or
  live-follow eligible.

## Non-Goals

- Do not route account-library rows through conversation-history
  materialization.
- Do not increase live-follow caps or enable account-library live-follow
  catch-up before installed idempotence proof.
- Do not run broad multi-tenant catch-up.
- Do not touch the retired frontend.
- Do not make model-selector, feature-signature, or unrelated provider
  interactions during read-only or retrieval passes.
- Do not retry unsupported or terminal account-library rows indefinitely.

## Work Tracks

### Track 1 | Request Contract

Status: implemented; local and installed request-shape proof passed.

- Add an explicit request shape for account-library reconciliation. It must
  require:
  - provider `chatgpt`;
  - runtime profile, initially `wsl-chrome-3`;
  - source `account-library`;
  - asset kind `files`;
  - bounded `maxItems`;
  - `force=false` by default.
- Keep the existing selected catalog-item path available for one-off operator
  retrieval.
- Reject ambiguous requests that could be interpreted as history
  reconciliation.
- Acceptance evidence:
  focused request-validation tests and CLI/API readback showing the generated
  job is labeled as account-library work.
- Implementation:
  `HistoryMaterializationCreateRequest` now accepts
  `assetSource=account-library` only with `reconcile=true`,
  `provider=chatgpt`, and `assetKinds=[files]`. The job source is
  `account_library_reconciliation`, distinct from history reconciliation.
  HTTP, CLI, and MCP schemas expose the same source flag/source type.
- Installed proof:
  `/home/ecochran76/.local/bin/auracall api history-materialization-create
  --provider chatgpt --runtime-profile wsl-chrome-3 --reconcile
  --asset-source account-library --asset-kind files --max-items 1 --json`
  created job `hmj_667837d8f947468494b7587e31d21e0c` with source
  `account_library_reconciliation`, proving the installed API/CLI contract.
  That first proof intentionally remained open as a failure finding for
  Track 2 because the broad selector still chose a stale unresolved row.

### Track 2 | Candidate Selection And Idempotence

Status: implemented and installed proof passed.

- Build a selector that considers only account-library file rows with current
  route authority.
- Normalize candidate family identity before budget is spent:
  - provider file id;
  - account-library catalog item id;
  - account-library catalog file id;
  - archive item id;
  - normalized title plus MIME type plus size when no stronger id exists.
- Exclude already archived families before applying `maxItems`.
- Treat duplicate aliases as skipped or duplicate, not as fresh downloads.
- Count unsupported, stale-unresolved, and terminal rows without spending
  browser work.
- Acceptance evidence:
  focused tests proving archived rows and duplicate aliases do not spend
  budget, and unsupported rows do not trigger provider interaction.
- Implementation:
  broad account-library reconciliation now selects ChatGPT account-library
  file catalog rows with current route authority (`providerFileId` or
  `chatgpt://file/<providerFileId>`). If a catalog row is stale and only has a
  stable account-library identity, broad reconciliation performs one current
  ChatGPT Library inventory read per account scope and resolves the stale row
  to a current provider file id before selecting it. Rows that still cannot
  resolve are skipped before download work, and archive-backed provider-file
  families are skipped before applying `maxItems`.
- Failure finding and fix:
  installed job `hmj_667837d8f947468494b7587e31d21e0c` failed because the
  initial broad selector picked stale catalog item
  `e112c9ba-ec50-5ae6-81a7-bfbb77f324bd`, which had no current ChatGPT
  provider file id in account-file inventory. The fix is to resolve stale
  catalog rows against the current account-file inventory before selection,
  and to skip only rows that remain unresolved.
- Local proof:
  focused runtime coverage now proves route-authorized broad reconciliation,
  archived-family skip before budget, stale-row resolution from current
  account-file inventory, stale-unresolved-row skip before download work, and
  request validation.

### Track 3 | Materialization Execution

Status: implemented and installed proof passed.

- Reuse the proven `materializeAccountFiles` primitive for selected account
  files.
- For stale catalog rows, resolve against current account-file inventory before
  download using the Plan 0098 resolver behavior.
- Upsert every successful row through the run archive.
- Require terminal `materialized` entries to carry:
  - archive item id;
  - asset route;
  - checksum;
  - local path or cache reference;
  - source metadata identifying `chatgpt-library`.
- Acceptance evidence:
  focused runtime tests and installed job readback for archive item ids and
  asset routes.
- Implementation:
  broad account-library reconciliation reuses the Plan 0098
  `materializeAccountFiles` path for every selected route-authorized or
  stale-resolved file. Installed capped proofs now show fresh broad
  account-library materialization with archive item ids, asset routes,
  checksums, local paths, and `chatgpt-library` metadata.

### Track 4 | Installed Proof Ladder

Status: installed `maxItems=1` and `maxItems=3` proofs passed.

- Rebuild and install the user runtime after source changes.
- Run one installed `maxItems=1` account-library reconciliation proof for
  `chatgpt/wsl-chrome-3`.
- Confirm:
  - job id;
  - materialized, skipped, duplicate, unsupported, and failed counts;
  - archive item ids and asset routes for materialized rows;
  - active jobs return to `0`;
  - recovery keeps history-lane `retrievableMissingLocal.total=0` and
    `createRequest=null`.
- If clean, run one installed `maxItems=3` proof.
- Confirm no repeated download loop by comparing selected families, archive
  item ids, checksums, and active job state before and after the second proof.
- Acceptance evidence:
  installed API/CLI readbacks and asset-route byte/checksum checks for every
  newly materialized row.
- Installed proof:
  after the stale-row live-inventory resolution fix was built, installed, and
  `auracall-api.service` restarted, `maxItems=1` job
  `hmj_ccaea15cb28242feb56ae4c9b52424ff` succeeded with
  `materialized=1`, `duplicateAliases=0`, `skipped=0`, and `failed=0`.
  It materialized provider id `d4670fc4-15d9-5ca7-b48f-026a8e33f87a` from
  `chatgpt://file/file_00000000730071fbaf48666ad6bf5ca3`, wrote SHA-256
  `2af143990726fe561aa02a36756f180738c2bc706c466361943801cb9a1f4221`,
  and created archive item
  `history-file:chatgpt:eric.cochran_soylei.com:account-library:d4670fc4-15d9-5ca7-b48f-026a8e33f87a`
  with an asset route.

  Follow-up `maxItems=3` job `hmj_cf164b2171d34df79bd625fe7e2b45d8`
  succeeded with `materialized=3`, `duplicateAliases=0`, `skipped=0`, and
  `failed=0`. It materialized provider ids
  `b585b566-c610-5e9e-b0de-13d3566a3f52`,
  `d87086b9-191e-5dce-8d16-e064dfb02418`, and
  `d88b0307-62e7-52cd-8f18-5a4d0364cae8`, each with archive item ids, asset
  routes, local paths, and checksums. Active `chatgpt/wsl-chrome-3` history
  materialization jobs returned to `0`.
- Recovery readback:
  post-proof recovery before the fresh materialization pass preserved
  history-lane truth:
  `retrievableMissingLocal.total=0`, `createRequest=null`, action `none`, and
  active jobs `0`. Account-library inventory still reports
  `accountLibrary.remoteKnownMissingLocal.total=166`,
  `accountLibrary.inventory.total=202`, `directDownload.total=48`,
  `needsBrowserDetail.total=154`, and `detailRoutes.unknown.total=144`.
  Those rows are not broad-selected unless they have a current
  `chatgpt://file` provider-file handle.

### Track 5 | Live-Follow Decision

Status: manual/operator-only.

- After capped proof, choose one explicit operating mode:
  - `manual`: only selected or operator-triggered account-library jobs run;
  - `preview-only`: live-follow can report account-library candidates but
    cannot enqueue materialization;
  - `eligible`: live-follow can enqueue capped account-library catch-up under
    a separate account-library cap.
- The default should remain manual unless capped installed proof shows:
  - no duplicate re-downloads;
  - no unsupported-row browser churn;
  - no model-selector interactions;
  - active jobs return to `0`;
  - archive/search readback is durable.
- Acceptance evidence:
  roadmap, runbook, and dev journal state the selected mode and the exact
  proof behind it.
- Decision:
  account-library reconciliation is manual/operator-only. Live follow may not
  enqueue account-library catch-up yet even though capped installed
  materialization now works, because automatic scheduling still needs a
  separate account-library cap, retry policy, and provider-work timeout
  posture. Selected catalog-item materialization and explicit
  `assetSource=account-library` reconciliation remain available for operator
  retrieval.

## Critical Path

1. Add the account-library reconciliation request contract.
2. Add route-authorized candidate selection with archive-backed idempotence.
3. Wire execution through the proven account-file materializer.
4. Prove installed `maxItems=1`.
5. Prove installed `maxItems=3`.
6. Decide the live-follow operating mode.

## Parallelizable Work

- Request validation and CLI/API shape tests can be built alongside selector
  fixture tests.
- Archive idempotence tests can be added while the installed proof harness is
  prepared.
- Documentation can be updated in parallel, but installed proof values must be
  recorded only after they exist.

## Acceptance Criteria

- Account-library reconciliation has an explicit request/job identity and is
  not confused with history materialization.
- Broad account-library retrieval can materialize capped routeable rows with
  archive item ids and asset routes.
- Already archived account-library families are skipped before budget is
  applied.
- Duplicate aliases do not re-download the same bytes.
- Unsupported and stale-unresolved rows are counted without repeated browser
  interaction.
- Installed `maxItems=1` and `maxItems=3` proofs pass for
  `chatgpt/wsl-chrome-3`.
- History-lane recovery remains truthful with `retrievableMissingLocal.total=0`
  and `createRequest=null`.
- Live-follow status is explicitly documented as manual, preview-only, or
  eligible.

## Definition Of Done

- `ROADMAP.md`, `RUNBOOK.md`, `docs/dev/dev-journal.md`, and this plan reflect
  final behavior and proof.
- Focused unit tests for request validation, candidate selection, idempotence,
  and archive linkage pass.
- `pnpm exec tsc --noEmit` passes.
- Relevant focused lint passes.
- `pnpm run build` and `pnpm run install:user-runtime` pass if runtime code
  changes.
- Installed account-library reconciliation proofs pass for `maxItems=1` and
  `maxItems=3`.
- `pnpm run plans:audit -- --keep 99` passes.
- `git diff --check` passes.
