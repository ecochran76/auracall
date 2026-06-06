# Complete ChatGPT Materialization Plan | 0097-2026-06-01

State: CLOSED
Lane: P01

## Purpose

Make ChatGPT materialization complete, truthful, and scalable for
`chatgpt/wsl-chrome-3` before any broader catch-up. Plans 0091 through 0096
proved the major retrieval paths but also exposed the remaining correctness
gaps: duplicate artifact families can still spend budget, some terminal
materialized entries can lack durable archive linkage, recovery counts can stay
inflated after successful downloads, and scale decisions need stronger
preflight classification than a flat missing-local count.

## Current State

- Latest completed plan:
  `docs/dev/plans/0096-2026-06-01-chatgpt-raised-cap-catch-up-pass.md`.
- Current execution evidence from the installed user runtime:
  - selected-conversation proof job
    `hmj_b723f1ae9961480aa62216e03f5a8863` succeeded for
    `chatgpt/wsl-chrome-3`, bound identity `eric.cochran@soylei.com`,
    conversation `6a0fa901-77d0-83ea-80e0-fbaaa4eca529`, `maxItems=5`,
    `force=false`, and snapshot refresh enabled;
  - the job materialized four assets: two Mason generated-artifact PDFs and
    two conversation file PDFs;
  - every terminal materialized entry had an archive item id and asset route;
  - generated artifacts preserved `materializationMethod:
    captured-anchor-fetch`;
  - file rows preserved `materializationMethod:
    chatgpt-file-tile-default-action`;
  - the duplicate Mason base alias did not spend a budget slot in the
    installed proof.
- Completed execution evidence:
  - recovery readback now separates the flat missing-local count into
    actionable classes; after the cap-10 passes it reported `115`
    remote-known missing local assets split into `90` retrievable missing
    local assets, `3` unsupported metadata-only file rows, `3` static
    false-positive artifact rows, and `19` terminal failed rows;
  - the `maxItems=5` reconciliation proof produced one terminal file failure,
    `ChatGPT conversation file fetch failed: tile_not_found`, and installed
    readback now projects that class under `failedTerminal`;
  - duplicate aliases are represented in the recovery contract and tests, but
    the latest installed readback has `0` currently outstanding duplicate
    aliases because the Mason base-name alias no longer spends budget.
  - under explicit operator instruction, two installed `maxItems=10`
    reconciliation passes were run after the original Plan 0097 cap policy;
    both succeeded with `10` materialized assets, `0` failures, and active
    jobs returning to `0`.
  - those cap-10 passes exposed a remaining budget-selection defect: stale
    catalog rows could still cause already archived file/artifact families to
    be reselected. The runtime now seeds reconciliation family skip sets from
    archive-backed materialized assets, reads top-level catalog `source`
    fields, parses source tokens from provider ids such as
    `:download:sandbox:`, and skips refresh-only zero-asset conversations in
    automatic materialization reconciliation.
  - final installed observation after those fixes showed no repeated downloads
    and no browser churn for empty refresh-only rows: job
    `hmj_bfcf83058fd94c59bee86940474761e1` skipped immediately with
    `conversations=0`, `materialized=0`, `failed=0`, and `entries=0`.
    However recovery still reported `84` retrievable missing local assets
    while search projection returned `0` unavailable artifact rows and `0`
    unavailable upload rows, so the status-level recovery count is still too
    coarse to authorize full autonomous catch-up.
  - the proof server then created unexpected unbound job
    `hmj_5211f07520f84a8dbe4466e6166cbe47` with `maxItems=3`; it stayed
    `running` with no entries or snapshot output and could not be cancelled
    after provider work began. The server was stopped to avoid leaving the
    browser job alive.
  - final recovery-truth fix classified account-level `chatgpt-library`
    artifact/file rows as unsupported metadata-only for the current
    history-materialization lane and capped classification buckets to the raw
    missing-local inventory.
  - installed proof on proof server `18092` reported
    `remoteKnownMissingLocal.total=109`, `retrievableMissingLocal.total=0`,
    `unsupportedMetadataOnly.total=87`, `staticFalsePositive.total=3`,
    `failedTerminal.total=19`, `createRequest=null`, and active
    history-materialization jobs `0`.
- Proven retrieval surfaces:
  - generated artifact DOM download-button / captured-anchor fetch;
  - ChatGPT Deep Research export after active-page iframe scoping;
  - ChatGPT conversation file tile fetch through provider file id and
    authenticated browser response capture;
  - cached provider-file salvage where the current provider detail row proves
    the cached local file still belongs to the row.
- Proven guardrails:
  - history materialization skips ChatGPT feature-signature/model-selector
    probing;
  - static favicon/generated-image false positives are skipped before provider
    fetch;
  - stale SoyFuze / Chemical Composition Dossier Deep Research duplicate
    families are guarded by active-page iframe scoping and family skip sets;
  - unsupported metadata-only file rows remain visible and explicit skips;
  - file-fetch avoids `/simple` JSON metadata stubs and follows signed
    `download_url` bodies.
- Plan 0096 raised the cap from `3` to `5` for one installed pass. The pass
  completed without provider-interaction regressions but exposed a correctness
  blocker:
  - `Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_clean_2page.pdf`
    and `Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut.pdf`
    resolved to the same remote content and SHA-256
    `7275c5d08508b22855a8ad36bc06d7cc6e3476f5ab84620814381b09b037e767`;
  - both spent materialization budget;
  - only one received a durable archive item and asset route;
  - post-pass recovery moved only from `121` to `120` missing local assets,
    with artifacts still at `50` missing.

## Scope

- Build a complete ChatGPT materialization contract for `chatgpt/wsl-chrome-3`
  across artifacts, files, and media-like rows currently projected through
  artifacts.
- Fix same-source/same-checksum duplicate artifact aliasing before candidate
  budget is consumed.
- Require durable archive/search linkage for terminal materialized entries, or
  classify the entry as a duplicate of a durable item rather than as a
  standalone materialization.
- Make recovery counts distinguish:
  - retrievable missing local assets;
  - already materialized local assets;
  - duplicate aliases of a materialized asset;
  - unsupported metadata-only rows;
  - static false positives;
  - provider-route/download failures;
  - rows needing detail refresh.
- Preserve the existing conservative live-follow policy until the new
  correctness gates are proven under capped installed runs.

## Non-Goals

- Do not run broad multi-tenant catch-up.
- Do not raise the catch-up cap again until this plan closes.
- Do not force-refresh already healthy local assets as a substitute for
  duplicate classification.
- Do not change Gemini, Grok, or non-ChatGPT materialization behavior except
  for shared archive invariants that are explicitly safe and tested.
- Do not touch the retired frontend.

## Architecture Boundaries

- Provider retrieval belongs in provider adapters and `LlmService` retrieval
  paths.
- Candidate prioritization, duplicate budgeting, and recovery classification
  belong in account-mirror/history-materialization planning surfaces.
- Archive/search linkage is a runtime invariant: a terminal materialized entry
  must either have durable archive linkage or be explicitly classified as a
  duplicate/alias of a durable item.
- Live-follow scheduling remains policy orchestration only. It should consume
  truthful recovery/materialization outcomes rather than repair provider or
  archive semantics itself.

## Work Tracks

### Track 1 | Installed Inventory And Recovery Truth

Status: implemented, installed readback proof passed.

- Capture the current `chatgpt/wsl-chrome-3` installed baseline:
  - live-follow status and active completion;
  - history-materialization jobs;
  - recovery candidates;
  - archive/search availability counts;
  - catalog item detail for recently materialized conversations.
- Produce a current classification table for the remaining missing-local
  backlog:
  - artifact rows;
  - conversation file rows;
  - static false-positive rows;
  - duplicate aliases;
  - unsupported metadata-only rows;
  - rows with provider-route/download failures.
- Verify whether the current `121` then `120` missing-local count is still a
  target-level stale number, a true retrievable queue, or a mix of both.
- Execution note: the initial installed baseline showed active
  history-materialization jobs at `0` before selected proof and recovery still
  reporting `120` remote-known missing local assets. Final readback after the
  proof ladder reported `118` remote-known missing local assets. After the
  recovery classification fix, installed readback on proof server `18084`
  separated that into `retrievableMissingLocal.total=93`,
  `unsupportedMetadataOnly.total=3`, `staticFalsePositive.total=3`, and
  `failedTerminal.total=19`; active jobs were `0`.

### Track 2 | Candidate Identity And Duplicate Normalization

Status: implemented, installed proof passed for the Mason pair;
archive-backed family skip and refresh-only zero-asset skip are installed.

- Define a canonical `materializationFamilyKey` for ChatGPT assets before
  budget selection.
- Include stable evidence in the key when available:
  - provider conversation id;
  - provider file id;
  - signed-content URL family stripped of volatile signature/query fields;
  - sandbox path;
  - title-normalized source path;
  - expected MIME type;
  - known checksum when a local/proven archive row already exists.
- Treat same-source aliases as one budget item before `maxItems` is applied.
- Prefer the best durable representative for duplicate groups:
  - row with provider file id over title-only;
  - row with DOM download affordance over inert sandbox alias;
  - row with existing archive linkage over unlinked alias;
  - row with clearer title/file name when checksums match.
- Add tests covering the Plan 0096 Mason duplicate pair.
- Execution note: ChatGPT artifact materialization now groups same-source
  sandbox aliases before budget selection and prefers the durable
  `_clean_2page` representative over the base-name alias for the Plan 0096
  Mason pair. Focused unit coverage was added in
  `tests/browser/llmServiceFiles.test.ts`. Follow-up cap-10 observation showed
  stale catalog rows could still reselect already archived families, so
  reconciliation now seeds attempted family signatures from run-archive
  materialized assets before candidate selection. Follow-up diagnosis found
  ChatGPT artifact rows can carry their actionable source only inside the
  provider id token, for example `:download:sandbox:`, and that automatic
  reconciliation could spend browser work on refresh-only zero-asset
  conversations after all archive-backed asset families were skipped. Both are
  now covered by unit regression.

### Track 3 | Archive Linkage Invariant

Status: implemented, selected installed proof passed.

- Enforce this invariant for history-materialization results:
  - `status=materialized` plus `localPath` must yield an archive item and asset
    route; or
  - the entry must be terminally reclassified as `duplicate` /
    `already_materialized_alias` with a pointer to the durable archive item.
- Ensure archive upsert returns alias/linkage information for duplicate
  materialization attempts instead of silently dropping the second item.
- Ensure result metrics separate:
  - newly materialized;
  - already materialized;
  - duplicate aliases;
  - skipped unsupported;
  - failed.
- Add tests so a materialized entry without archive linkage fails the result
  invariant before live installed proof.
- Execution note: history materialization now refuses to leave an entry as
  terminal `materialized` unless archive linkage is present, or reclassifies a
  checksum-only match as a `duplicate` alias with a durable archive target.
  Selected installed proof showed four terminal materialized entries and four
  archive-backed asset routes.

### Track 4 | Retrieval Surface Health

Status: verified through cap-10 installed observation, with log-tail gap.

- Preserve all proven retrieval paths:
  - ChatGPT file tile default action;
  - ChatGPT generated artifact DOM download;
  - Deep Research iframe-scoped export;
  - cached provider-file salvage.
- Re-test that:
  - `/simple` metadata responses are not saved as files;
  - JSON `download_url` responses are followed to signed content;
  - virtualized file tiles are found by scrolling/searching;
  - static favicon rows are filtered before browser work;
  - model-selector/feature-signature probes remain suppressed.
- Add any missing regression tests for these proven paths while keeping the
  implementation scoped.
- Execution note: selected installed proof preserved generated-artifact DOM
  download and file-tile retrieval methods. The proof API log-tail file was not
  present for port `18083`, so regression evidence is currently from job
  result/readback and server stream rather than a structured proof-log scan.
  Two explicit cap-10 passes, `hmj_409703ca757843c6830e46f60989db68` and
  `hmj_7dbcf7f1cb8c495eb5ae25e221a1ee49`, each materialized `10` assets with
  `0` failures and preserved `chatgpt-file-tile-default-action` plus
  `captured-anchor-fetch` methods.

### Track 5 | Recovery Count And Catalog Readback Semantics

Status: implemented, installed recovery-truth proof passed.

- Project duplicate/alias status into catalog and recovery readback so
  operators can distinguish real missing assets from non-actionable aliases.
- Make recovery counts show at least:
  - `remoteKnownMissingLocal`;
  - `retrievableMissingLocal`;
  - `duplicateAliases`;
  - `unsupportedMetadataOnly`;
  - `staticFalsePositive`;
  - `materializedLocal`;
  - `failedTerminal`.
- Ensure a successful materialization updates the right class:
  - file rows reduce missing file count;
  - generated artifacts reduce missing artifact count;
  - duplicate aliases do not remain as retrievable missing local work.
- Add readback tests for the Plan 0096 behavior where materialized entries did
  not reduce artifact recovery counts.
- Execution note: recovery candidates still report the raw
  `remoteKnownMissingLocal.total=118`, but now also expose the actionable
  split: `retrievableMissingLocal.total=93`, `unsupportedMetadataOnly.total=3`,
  `staticFalsePositive.total=3`, `failedTerminal.total=19`, and
  `duplicateAliases.total=0`. Focused tests cover unsupported/static catalog
  rows plus duplicate/failed terminal history-materialization rows. After the
  first cap-10 pass, readback moved to `remoteKnownMissingLocal.total=115` and
  `retrievableMissingLocal.total=90`, but only three net rows dropped despite
  ten materialized entries; the mismatch exposed that stale catalog rows could
  spend budget on already archived families. Selection now consults archive
  materialized family signatures before browser work. The final installed
  observation showed the opposite mismatch: recovery still reported
  `retrievableMissingLocal.total=84` while search projection returned `0`
  unavailable artifact/upload rows and automatic reconciliation immediately
  skipped with no candidates. Final recovery-truth fix classified account-level
  `chatgpt-library` artifact/file rows as unsupported metadata-only for the
  current history-materialization lane and capped classification buckets to the
  raw missing-local inventory. Installed readback on proof server `18092`
  reported `retrievableMissingLocal.total=0`,
  `unsupportedMetadataOnly.total=87`, `staticFalsePositive.total=3`,
  `failedTerminal.total=19`, and no create request, with active jobs `0`.

### Track 6 | Bounded Installed Proof Ladder

Status: completed; cap-10 installed observations passed retrieval health and
the final installed readback proved no remaining retrievable catch-up work.

- Use a strict proof ladder after local tests pass:
  - selected-conversation proof for the Plan 0096 duplicate conversation
    `6a0fa901-77d0-83ea-80e0-fbaaa4eca529`;
  - one reconciliation pass with `maxItems=3`, `force=false`;
  - one reconciliation pass with `maxItems=5`, `force=false` only if the
    `maxItems=3` pass is clean;
  - no higher cap in this plan.
- Each proof must capture:
  - job id;
  - request;
  - terminal metrics;
  - per-entry classification;
  - archive item id and asset route for materialized entries;
  - alias target for duplicate entries;
  - before/after recovery counts.
- Stop on the first regression and record a follow-up blocker rather than
  continuing scale-up.
- Execution note: selected-conversation proof passed as
  `hmj_b723f1ae9961480aa62216e03f5a8863`. The next ladder step,
  reconciliation proof `hmj_244032853e0343e9a933049e8e1c401e` with
  `maxItems=3`, succeeded with `conversations=3`, `materialized=1`,
  `failed=0`. The allowed `maxItems=5` proof
  `hmj_c9426dc2d9684dada145cdb50a84a009` then succeeded with
  `conversations=2`, `materialized=4`, `failed=1`, where the failed entry was
  a ChatGPT file tile lookup returning `tile_not_found`. Active jobs returned
  to `0` after the ladder. The operator then explicitly requested raising the
  cap and running another pass. Job `hmj_409703ca757843c6830e46f60989db68`
  ran with `maxItems=10`, `force=false`, and snapshot refresh; it succeeded
  with `conversations=3`, `materialized=10`, `failed=0`, and active jobs `0`.
  After installing the archive-backed family skip, job
  `hmj_7dbcf7f1cb8c495eb5ae25e221a1ee49` also succeeded with
  `conversations=3`, `materialized=10`, `failed=0`, and active jobs `0`, but
  it confirmed one more signature defect for top-level catalog `source`
  fields. Job `hmj_e4d0267242c543289bfbbd6f6fdc3427` then reselected
  archive-backed TTP ZIP artifacts, proving source fallback also had to parse
  `:download:` from provider ids. After installing the id-source fallback and
  refresh-only zero-asset skip, job
  `hmj_bfcf83058fd94c59bee86940474761e1` skipped immediately with no
  materialization candidates, proving the selector no longer spends budget on
  already archive-backed families or empty refresh-only rows. That run did not
  close the plan because recovery still advertised `84` retrievable assets
  while search projection advertised zero unavailable artifact/upload rows.
  Final proof on server `18092` closed that gap by moving account-level
  `chatgpt-library` rows to unsupported metadata-only classification and
  reporting `retrievableMissingLocal.total=0` with no recovery create request.

### Track 7 | Live-Follow Policy Readiness

Status: completed for Plan 0097. Retrieval and recovery-truth gates are green;
autonomous cap increases are not needed because there is no current
retrievable missing-local backlog.

- Confirm live-follow can consume the corrected materialization outcomes
  without treating aliases as failed or still-missing retrievable work.
- Keep current policy caps until proof ladder completes.
- After the proof ladder, decide whether to recommend:
  - remain at current cap;
  - use `maxItems=5` for more observation windows;
  - open a separate plan for broader ChatGPT catch-up;
  - open a separate plan for multi-tenant catch-up.
- Final recommendation: do not raise live-follow defaults as a catch-up
  reaction. The next bounded plan should be a separate ChatGPT account-library
  retrieval design if those `chatgpt-library` rows must become downloadable
  rather than metadata-only.

## Acceptance Criteria

- Plan 0097 is wired into `ROADMAP.md`, `RUNBOOK.md`, and
  `docs/dev/dev-journal.md`.
- Plan 0096's Mason duplicate pair is covered by tests and no longer spends
  two budget slots as independent materializations.
- A terminal `materialized` history-materialization entry cannot lack archive
  item and asset route linkage unless it is explicitly classified as a
  duplicate alias with a durable target.
- Recovery readback separates true retrievable missing assets from duplicate
  aliases, unsupported metadata-only rows, static false positives, and terminal
  failures.
- Installed proof shows the duplicate pair is either:
  - represented by one durable materialized asset plus one duplicate alias; or
  - skipped as already materialized with a pointer to the durable item.
- Active history-materialization jobs return to `0` after every proof.
- Regression scans show no SoyFuze duplicate loop, no model-selector /
  feature-signature interaction, no static favicon fetch, no `/simple` JSON
  stub save, and no `download_url` JSON body saved as a final file.
- Any catch-up cap above `5` used while this plan is open is explicitly
  operator-requested, recorded with job evidence, and must not become the
  autonomous/live-follow default until the stale-catalog archive-family skip is
  proven in installed runtime.

## Validation Plan

- Focused unit tests:
  - candidate family key normalization;
  - same-source/same-checksum alias grouping;
  - Plan 0096 Mason duplicate pair;
  - archive linkage invariant;
  - recovery count classification;
  - ChatGPT file tile and generated artifact regression cases.
- Static validation:
  - `pnpm exec biome lint` on touched code/tests;
  - `pnpm run typecheck`;
  - `pnpm run build`.
- Installed proof:
  - rebuild/reinstall/restart user runtime if code changes touch installed
    runtime paths;
  - selected-conversation proof for
    `6a0fa901-77d0-83ea-80e0-fbaaa4eca529`;
  - capped reconciliation proof at `maxItems=3`;
  - capped reconciliation proof at `maxItems=5` only after the smaller proof
    passes.
- Documentation gates:
  - update `ROADMAP.md`, `RUNBOOK.md`, `docs/dev/dev-journal.md`, and
    `docs/dev-fixes-log.md` with the final evidence;
  - `pnpm run plans:audit -- --keep 97`;
  - `git diff --check`.

## Definition Of Done

- ChatGPT materialization has a truthful end-to-end contract for candidate
  selection, retrieval, archive linkage, recovery readback, and live-follow
  consumption.
- The Plan 0096 duplicate/archive-linkage bug is fixed and proven in installed
  runtime.
- The next scale recommendation is based on corrected counts and bounded
  installed proof, not on a flat missing-local backlog.
