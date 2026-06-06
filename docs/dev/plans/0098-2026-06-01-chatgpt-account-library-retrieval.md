# ChatGPT Account-Library Retrieval Plan | 0098-2026-06-01

State: CLOSED
Lane: P01

## Purpose

Make account-level ChatGPT `chatgpt-library` artifacts and files retrievable
without reopening the history-materialization lane. Plan 0097 proved that
conversation-history materialization is truthful for `chatgpt/wsl-chrome-3`:
there is no remaining retrievable missing-local backlog there, and the
remaining `chatgpt-library` rows are now explicit unsupported metadata-only
rows. This plan defines the separate retrieval lane needed if those account
library rows must become downloadable artifacts.

## Current State

- Latest completed plan:
  `docs/dev/plans/0097-2026-06-01-complete-chatgpt-materialization.md`.
- Installed Plan 0097 proof for `chatgpt/wsl-chrome-3` reported:
  - `remoteKnownMissingLocal.total=109`;
  - `retrievableMissingLocal.total=0`;
  - `unsupportedMetadataOnly.total=87`;
  - `staticFalsePositive.total=3`;
  - `failedTerminal.total=19`;
  - `createRequest=null`;
  - active history-materialization jobs `0`.
- The `unsupportedMetadataOnly.total=87` bucket is dominated by account-level
  `chatgpt-library` rows that are not conversation-history candidates.
- Account-library rows can represent assets visible in ChatGPT's account
  library surfaces rather than assets reachable from a specific conversation
  transcript, project chat, or provider-file tile.
- Current recovery behavior is intentionally conservative: it keeps those rows
  visible as unsupported metadata-only and does not create history
  materialization jobs for them.
- Follow-on bounded implementation:
  `docs/dev/plans/0099-2026-06-01-chatgpt-account-library-reconciliation.md`
  owns the explicit capped account-library reconciliation request/job lane,
  installed `maxItems=1` and `maxItems=3` proofs, and the live-follow
  operating-mode decision.

## Scope

- Define a first-class ChatGPT account-library retrieval lane for
  `chatgpt-library` artifact/file rows.
- Preserve the Plan 0097 history-materialization contract:
  `retrievableMissingLocal.total=0` for the current history lane must not be
  inflated by library rows.
- Add explicit account-library candidate identity, routing, and result states
  so operators can distinguish:
  - retrievable account-library rows;
  - unsupported library rows that have no current download affordance;
  - already materialized library rows;
  - duplicate library aliases;
  - terminal provider failures;
  - stale metadata rows requiring a library refresh.
- Prove the new lane with bounded installed runs before any live-follow
  automatic catch-up or cap increase.

## Non-Goals

- Do not route account-library rows through conversation-history
  materialization.
- Do not loosen Plan 0097 duplicate, archive-linkage, or static false-positive
  guards.
- Do not run broad multi-tenant catch-up.
- Do not make live-follow automatically download account-library assets until
  this plan proves bounded recovery and idempotence.
- Do not touch the retired frontend.
- Do not change Gemini, Grok, or non-ChatGPT provider behavior except for
  shared recovery/result types that remain backward-compatible.

## Architecture Boundaries

- Account-library discovery belongs in the ChatGPT provider adapter and
  account-mirror catalog surfaces, not in live-follow scheduling.
- Account-library retrieval should produce the same durable archive/search
  guarantees as history materialization:
  terminal `materialized` rows must have archive item ids and asset routes, or
  be classified as duplicate aliases of a durable item.
- Recovery planning must keep history and account-library eligibility as
  separate lanes. A history candidate cannot silently include account-library
  work.
- Live follow should consume an explicit account-library recovery signal only
  after this plan proves it is truthful and idempotent.

## Work Tracks

### Track 1 | Inventory And Authority Model

Status: read-only recovery inventory contract implemented; installed readback
proof passed.

- Identify the exact catalog shapes for account-level `chatgpt-library`
  artifacts and files:
  - top-level `source`;
  - nested `metadata.source`;
  - provider ids;
  - URLs or library object ids;
  - title, MIME type, size, checksum, and created/updated timestamps.
- Determine whether each row has enough authority to fetch directly, requires
  navigation to a library detail page, or is metadata-only.
- Produce a current installed inventory split for `chatgpt/wsl-chrome-3`:
  - total account-library rows;
  - rows with stable provider/library ids;
  - rows with direct or signed download affordances;
  - rows requiring browser detail navigation;
  - rows that are currently unsupported.
- Acceptance evidence:
  an installed read-only inventory command or API query that reports these
  buckets without creating materialization jobs.
- Implementation note:
  recovery readback now exposes account-library inventory authority buckets
  under `accountLibrary.inventory`:
  - `total`;
  - `stableIdentity`;
  - `directDownload`;
  - `needsBrowserDetail`;
  - `unsupportedNoAuthority`.
  This is read-only recovery evidence and does not enqueue browser work.
- Installed proof:
  proof server `18097` for `chatgpt/wsl-chrome-3` reported
  `accountLibrary.inventory.total=152`, `stableIdentity=152`,
  `directDownload=0`, `needsBrowserDetail=152`,
  `unsupportedNoAuthority=0`, `accountLibrary.remoteKnownMissingLocal=120`,
  `accountLibrary.retrievableMissingLocal=0`, and `createRequest=null`.
  Active history-materialization jobs remained `0`.

### Track 2 | Candidate Identity And Recovery Contract

Status: recovery contract implemented and installed readback proof passed for
read-only account-library lane; job-lane candidate identity remains open.

- Add an account-library-specific candidate identity that does not depend on
  conversation id.
- Define a stable family key using the best available evidence:
  - library object id;
  - provider file id;
  - normalized account-library URL;
  - title plus MIME type plus size;
  - checksum when a local/archive proof exists.
- Extend recovery readback with explicit account-library counts, for example:
  - `accountLibrary.remoteKnownMissingLocal`;
  - `accountLibrary.retrievableMissingLocal`;
  - `accountLibrary.unsupportedMetadataOnly`;
  - `accountLibrary.duplicateAliases`;
  - `accountLibrary.failedTerminal`.
- Preserve the existing history counts unchanged for conversation-backed
  materialization.
- Acceptance evidence:
  unit coverage that account-library rows no longer inflate the history lane
  while still appearing in the account-library lane.
- Implementation note:
  recovery candidates and aggregate metrics now expose an `accountLibrary`
  bucket with `remoteKnownMissingLocal`, `retrievableMissingLocal`,
  `unsupportedMetadataOnly`, `duplicateAliases`, `failedTerminal`, and
  `inventory` counts. The existing history-lane `retrievableMissingLocal`
  remains separate and account-library rows continue to produce
  `createRequest=null` until Track 4 adds an explicit account-library job mode.
- Installed proof:
  proof server `18097` preserved history-lane
  `retrievableMissingLocal.total=0` while showing
  `accountLibrary.remoteKnownMissingLocal.total=120` and
  `accountLibrary.inventory.needsBrowserDetail.total=152`. This proves the
  remaining rows are visible in the account-library lane without being
  authorized as history materialization work.

### Track 3 | Retrieval Surface Discovery

Status: route-kind and row-id contracts implemented; selected browser-detail
retrieval proof passed through installed CLI.

- Map ChatGPT account-library UI/API surfaces for one bounded browser profile:
  `chatgpt/wsl-chrome-3`.
- Prefer read-only inspection first:
  - no model selector interactions;
  - no feature-signature probing;
  - no conversation refresh unless a library item explicitly routes to a
    conversation-backed source.
- Determine the lowest-churn retrieval route for each supported library row:
  - direct authenticated browser response capture;
  - signed `download_url` body fetch;
  - library detail page download affordance;
  - provider-file tile fallback only when the library row proves a provider
    file id.
- Route-kind contract:
  fresh account-library inventory now records `metadata.libraryRouteKind` and
  `metadata.libraryRouteUrl`, and recovery readback aggregates these under
  `accountLibrary.inventory.detailRoutes`:
  - `libraryFileDetail` for `/library/files/*`;
  - `libraryArtifactDetail` for `/library/artifacts/*`;
  - `libraryCanvasDetail` for `/library/canvas/*`;
  - `conversationDetail` for `/c/*`;
  - `externalOrInlineAsset` for non-ChatGPT, `blob:`, or `data:` sources;
  - `unknown` when no route is available.
- Guardrail:
  ChatGPT `/library/*` and `/c/*` routes are detail/navigation evidence. They
  must not be counted as direct-download authority and must not enqueue
  history-materialization jobs.
- Acceptance evidence:
  a small fixture or recorded selector/API contract for each supported route,
  plus explicit unsupported states for rows without a route.
- Current verification:
  focused tests prove the route-kind split for the browser collector and
  recovery planner, including the `/c/*` no-direct-download guard. Installed
  proof server `18102` reported history-lane
  `retrievableMissingLocal.total=0`, active history-materialization jobs `0`,
  `accountLibrary.remoteKnownMissingLocal.total=122`,
  `accountLibrary.inventory.total=154`, `directDownload=0`,
  `needsBrowserDetail=154`, `detailRoutes.conversationDetail=10`,
  `detailRoutes.unknown=144`, and `createRequest=null`. A fresh read-only
  library inventory pass is still required to populate route kinds for older
  cached rows currently reported as `unknown`.
- Selected browser-detail proof:
  live ChatGPT Library inspection on `wsl-chrome-3` showed the table root
  `data-testid="artifacts-surface-page-table-root"` and row-level provider
  file ids such as
  `artifact-checkbox-bridge-file_00000000fa5871fbaa5ba6f3e05d99f6`. Clicking
  the matching Library row title, not the row action menu and not the model
  selector, produced authenticated app requests for
  `/backend-api/files/library/files/libfile_ea646b8add488191959d6333f4a6ef9b/versions`,
  `/backend-api/files/download/file_00000000fa5871fbaa5ba6f3e05d99f6?inline=true`,
  and a signed `/backend-api/estuary/content` body. Raw page-context fetches
  to `/backend-api/files/.../simple` and `/backend-api/files/download/...`
  without the app-triggered path returned 401/403, so retrieval must use the
  app-authenticated row-click flow.
- Installed inventory proof:
  after row-container extraction was fixed, installed
  `/home/ecochran76/.local/bin/auracall --profile wsl-chrome-3 files list
  --target chatgpt` wrote 50 account-library rows with
  `providerFileId=50`, `remoteUrl=chatgpt://file/...` on all 50 rows, and
  `materializationSurface=chatgpt-library-file-row-click`. The command still
  timed out after writing complete JSON, which is now tracked as a separate
  CLI lifecycle issue.

### Track 4 | Account-Library Materialization Job Lane

Status: selected catalog-item and capped reconciliation paths implemented;
installed proofs passed.

- Add a bounded job mode or request shape for account-library retrieval that is
  separate from history reconciliation.
- Require explicit operator intent for installed proofs:
  - provider `chatgpt`;
  - runtime profile `wsl-chrome-3`;
  - asset source `account-library`;
  - conservative `maxItems`;
  - `force=false` by default.
- Preserve idempotence:
  - already archived families do not spend budget;
  - duplicate aliases do not trigger re-downloads;
  - terminal unsupported rows are counted, not retried indefinitely.
- Acceptance evidence:
  focused tests for request validation, budget selection, duplicate skip, and
  archive linkage.
- Current implementation:
  the ChatGPT provider now exposes `downloadAccountFile`, and the CLI exposes
  `auracall files download <fileId> --out <path>`. The provider resolves
  Library row metadata, clicks the matching account-library row title, follows
  the app-authenticated JSON `download_url`, and writes the signed content
  body. The LLM service now has a `materializeAccountFiles` primitive that
  writes account-library files, SHA-256 checksums, cache rows, and a
  file-fetch manifest. The history-materialization service now recognizes an
  explicit ChatGPT account-library file catalog item with a `chatgpt://file/...`
  handle, downloads the selected file through the account-library primitive,
  and upserts the result through the run archive with archive item ids and
  asset routes. Plan 0099 adds the explicit broad account-library
  reconciliation request lane through `assetSource=account-library`,
  `reconcile=true`, `assetKinds=[files]`, and bounded `maxItems`.
- Stale catalog resolver:
  explicit selected account-library file catalog items may still be cached as
  stable-hash rows without a `providerFileId` or `chatgpt://file/...` handle.
  The selected materializer now resolves those stale catalog rows against the
  current ChatGPT account-file inventory by stable name before it downloads,
  preserving the account-library lane without marking stale rows as
  history-retrievable.
- CLI lifecycle fix:
  successful `files list` and `files download` paths now explicitly exit after
  stdout is written, with `AURACALL_DISABLE_BROWSER_FILE_FORCE_EXIT=1` as the
  opt-out. This addresses the observed post-success hang where selected
  retrieval completed but the process stayed alive until the timeout wrapper
  returned code `124`.
- Local proof:
  focused tests cover manifest/cache writes, preselected account-file
  materialization without a live list refresh, selected catalog-item archive
  linkage, stale selected catalog rows, and archive asset-route propagation.
- Installed proof:
  installed job `hmj_e3a49eca13f64788a4065f9adeaf9b9a` materialized stale
  account-library catalog file item
  `325dcf29-906e-55c2-a5e3-797c5c50e2e0` for `chatgpt/wsl-chrome-3`. The job
  resolved the current account-file row
  `c3584433-36a3-5919-a347-bfea83f07343`, downloaded one PDF, and wrote run
  archive item
  `history-file:chatgpt:eric.cochran_soylei.com:account-library:c3584433-36a3-5919-a347-bfea83f07343`
  with an asset route. Readback metrics were `conversations=0`,
  `materialized=1`, `skipped=0`, `failed=0`, and `duplicateAliases=0`.
  The asset route returned HTTP `200`, `492700` bytes, PDF prefix `%PDF-1.7`,
  and SHA-256
  `6629baf1bbfcb550b0e94e6338688e312fd7a99e2c09172c29f05c893955a25e`.
  Active `chatgpt/wsl-chrome-3` history materialization jobs returned to `0`.
- Capped reconciliation proof:
  Plan 0099 installed job `hmj_ccaea15cb28242feb56ae4c9b52424ff`
  materialized one account-library file with archive linkage, and installed
  job `hmj_cf164b2171d34df79bd625fe7e2b45d8` materialized three additional
  account-library files with archive linkage. Both jobs used
  `chatgpt/wsl-chrome-3`, `assetSource=account-library`, `assetKinds=[files]`,
  and `force=false`; active history materialization jobs returned to `0`.

### Track 5 | Installed Proof Ladder

Status: selected-item, archive-linked, and capped account-library
reconciliation proofs passed.

- Start with a read-only installed inventory proof.
- Run one selected-item proof for a single account-library row that has a clear
  retrieval route.
- Run one capped reconciliation proof with `maxItems=1`.
- Only after the first proof is clean, run a capped proof with `maxItems=3`.
- For each proof, record:
  - job id;
  - target provider/runtime profile;
  - number of candidates considered;
  - materialized, skipped, duplicate, unsupported, and failed counts;
  - archive item ids and asset routes for every materialized row;
  - active job count returning to `0`;
  - evidence that no model selector or unrelated provider interaction occurred.
- Acceptance evidence:
  installed API/CLI readback showing routeable archive entries and unchanged
  history-lane recovery truth.
- Selected proof:
  installed command
  `/home/ecochran76/.local/bin/auracall --profile wsl-chrome-3 files download
  file_00000000fa5871fbaa5ba6f3e05d99f6 --target chatgpt --out
  /tmp/auracall-chatgpt-library-proof.pdf` wrote a 492,700 byte, 10-page PDF
  with SHA-256
  `6629baf1bbfcb550b0e94e6338688e312fd7a99e2c09172c29f05c893955a25e`.
  The command printed success but then stayed alive until the timeout wrapper
  returned code `124`; the file was already present and verified. That
  post-success hang is now fixed in the installed user runtime. Rerun command
  `/home/ecochran76/.local/bin/auracall --profile wsl-chrome-3 files download
  file_00000000fa5871fbaa5ba6f3e05d99f6 --target chatgpt --out
  /tmp/auracall-chatgpt-library-proof-rerun.pdf` exited `0`, wrote a
  492,700 byte, 10-page PDF, and produced the same SHA-256
  `6629baf1bbfcb550b0e94e6338688e312fd7a99e2c09172c29f05c893955a25e`.
- Installed archive-linked proof:
  selected account-library catalog-item materialization now produces installed
  history materialization entries with archive item ids and asset routes.
  Proof job `hmj_e3a49eca13f64788a4065f9adeaf9b9a` succeeded for
  `chatgpt/wsl-chrome-3`; its asset route readback returned HTTP `200`,
  492,700 bytes, PDF prefix `%PDF-1.7`, and the expected SHA-256. Recovery
  readback after the proof still preserved history-lane truth:
  `retrievableMissingLocal.total=0`, active jobs `0`, and account-library
  rows remained outside automatic history recovery.
- Capped reconciliation proof:
  Plan 0099 installed `maxItems=1` job
  `hmj_ccaea15cb28242feb56ae4c9b52424ff` succeeded with `materialized=1`,
  `duplicateAliases=0`, `skipped=0`, and `failed=0`. Installed `maxItems=3`
  job `hmj_cf164b2171d34df79bd625fe7e2b45d8` succeeded with
  `materialized=3`, `duplicateAliases=0`, `skipped=0`, and `failed=0`. Every
  materialized row carried an archive item id, asset route, local path, and
  checksum; active jobs returned to `0`.

### Track 6 | Live-Follow Integration Decision

Status: manual/operator-only.

- Decide whether account-library retrieval should remain manual/operator
  driven or become a live-follow catch-up capability.
- If live-follow integration is approved, add a separate cap and eligibility
  gate for account-library rows.
- Keep account-library catch-up disabled by default until installed proofs
  show no repeat-download loops and no browser churn on unsupported rows.
- Decision:
  account-library retrieval remains manual/operator-driven. Live follow must
  not automatically enqueue account-library catch-up until a separate
  account-library cap, retry policy, provider-work timeout posture, and
  scheduler guard are implemented and proven.
- Acceptance evidence:
  Plan 0099, roadmap, runbook, and dev journal record manual/operator-only as
  the selected operating mode.

## Critical Path

1. Inventory the account-library row shapes and authority evidence.
2. Split the recovery contract so history and account-library counts are both
   visible but not conflated.
3. Discover and implement the lowest-churn supported retrieval route.
4. Prove selected-item materialization with archive linkage.
5. Prove capped reconciliation and idempotence.
6. Decide whether live-follow can consume the new lane.

## Parallelizable Work

- Catalog fixture collection and row-shape classification can proceed in
  parallel with recovery-contract type/test design.
- Browser surface discovery can proceed in read-only mode while unit tests are
  added for candidate identity.
- Docs/runbook updates can proceed alongside implementation as long as
  installed proof values are added only after they exist.

## Acceptance Criteria

- Account-library rows no longer appear only as generic unsupported
  metadata-only rows; they have an explicit recovery lane and state model.
- History recovery for `chatgpt/wsl-chrome-3` remains truthful and does not
  regain false retrievable backlog from account-library rows.
- At least one account-library item is materialized in an installed proof with
  durable archive item id and asset route, or the plan records that all current
  account-library rows lack a supported retrieval route.
- Unsupported account-library rows are terminally classified and do not cause
  repeated browser interaction.
- Duplicate account-library aliases do not spend budget or re-download.
- Focused tests, typecheck/build, user-runtime install, installed readback, and
  plan audit pass before closure.

## Definition Of Done

- The account-library recovery lane is implemented or explicitly closed as
  unsupported with installed evidence.
- `ROADMAP.md`, `RUNBOOK.md`, `docs/dev/dev-journal.md`, and
  `docs/dev-fixes-log.md` describe the final account-library behavior.
- `pnpm run plans:audit -- --keep 98` passes.
- `git diff --check` passes.
- Relevant focused tests pass.
- If runtime code changes, `pnpm run typecheck`, `pnpm run build`, and
  `pnpm run install:user-runtime` pass.
- Installed proof confirms either successful bounded account-library
  materialization or a truthful no-route unsupported classification.
