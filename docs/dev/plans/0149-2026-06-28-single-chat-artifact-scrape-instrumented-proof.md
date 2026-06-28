# Single-Chat Artifact Scrape Instrumented Proof | 0149-2026-06-28

State: CLOSED
Lane: P01

## Purpose

Prove and harden the actual single-conversation ChatGPT artifact scrape path
end to end. The target state is not "rate-limit guards are quieter"; it is
"one artifact-rich chat can be loaded once, parsed from DOM/app state, and
materialized with bounded, inspectable browser traffic."

## Current State

- `chatgpt/wsl-chrome-3` live-follow is paused at
  `acctmirror_completion_3f89a264-db31-44ce-afc4-aed30bc3c33e` after repeated
  provider-guard blocks with `passCount=0` and unchanged `90` detail surfaces.
- Plan 0148 fixed a narrow priority bug: steady-follow frontier-selected
  conversation detail no longer burns the pass on account-library/project
  inventory first.
- Plan 0148 did not prove a live single-chat scrape, did not instrument exact
  CDP traffic, and did not prove the level of LLM service/provider interaction.
- The existing single-conversation execution path is
  `api history-materialization-create --conversation-id ...`, which flows
  through `materializeConversationTarget` into
  `llmService.materializeConversationArtifacts` and
  `llmService.materializeConversationFiles`.

## Problem Statement

If AuraCall cannot enrich one known artifact-rich ChatGPT conversation without
triggering provider rate limits, the scrape algorithm is still wrong or
unproven. Once a target conversation is loaded, artifact discovery should rely
on bounded DOM/React/payload inspection and authenticated file/artifact
download calls. It should not perform account-library scans, project inventory,
root-history reads, broad conversation-list sweeps, or active model requests.

The next work must plan and verify the whole path, not drift through more
isolated micropolish.

## End-To-End Requirements

1. **Explicit target path**
   - Provide an operator path for one known ChatGPT conversation id or provider
     URL.
   - Keep live-follow paused unless explicitly resumed later.
2. **Traffic instrumentation**
   - Count CDP calls by domain/method for the scrape operation, at minimum:
     `Page.navigate`, target attach/reopen events when available,
     `Runtime.evaluate`, and network/download-related calls visible through the
     provider path.
   - Count LLM service/provider interactions by action, at minimum:
     `getConversationContext`, `materializeConversationArtifacts`,
     `materializeConversationFiles`, `listAccountFiles`, `listProjectFiles`,
     `listConversationFiles`, and conversation/history list reads.
   - Persist the counters in the materialization job readback/result and in the
     artifact/file manifests or adjacent telemetry file.
3. **Algorithm constraints**
   - For a direct single-conversation scrape, do not call account-library or
     project inventory surfaces.
   - Avoid conversation-list/root-history reads unless resolving a non-id
     selector; direct ids must not need broad history lookup.
   - Load/reopen the target conversation once unless reattach/recovery is
     needed, and record any reopen count.
   - Extract candidates from DOM/app state before trying downloads.
4. **Download/materialization proof**
   - Materialize at least one artifact or file from an artifact-rich target chat,
     or return a structured "no materializable candidates" proof with the
     candidate counts and reasons.
   - Record local file paths, manifest path, candidate counts, downloaded
     counts, skipped counts, and failed counts.
5. **Acceptance gates**
   - Unit tests prove telemetry counts for the direct path and that broad
     surfaces remain zero.
   - A focused live/manual-safe proof against `chatgpt/wsl-chrome-3` shows the
     direct path behavior with live-follow still paused.
   - Runtime proof is not accepted if it only shows provider guard/backoff or
     scheduler state; it must include scrape telemetry.

## Phased Execution

### Phase 1 | Contract And Telemetry Model

- Define a `scrapeTelemetry` result object shared by history materialization,
  LLM service, and ChatGPT provider code.
- Add counters for provider actions and CDP method calls without changing
  public API shape unnecessarily.
- Add fixture-level tests for telemetry aggregation and serialization.

### Phase 2 | Direct Single-Conversation Path

- Make `history-materialization-create --conversation-id ...` use direct target
  materialization without account-library/project/root-history discovery.
- Thread scrape telemetry through `materializeConversationTarget`,
  `LlmService.materializeConversationArtifacts`, and
  `LlmService.materializeConversationFiles`.
- Ensure direct ids do not require selector/history resolution.

### Phase 3 | ChatGPT DOM/App-State Scrape Proof

- Instrument the ChatGPT `readConversationContext` and artifact/file
  materializers so the result shows:
  - navigation/reopen counts;
  - `Runtime.evaluate` counts;
  - candidate extraction counts by source (`payload`, `dom-download`,
    `dom-image`, `canvas`, `deep-research`, `file-tile`);
  - download attempts/success/skips/failures.
- Add focused tests around ChatGPT provider fixtures where feasible.

### Phase 4 | Live Bounded Proof

- Keep live-follow paused.
- Pick one known artifact-rich conversation id from cached evidence or an
  operator-provided id.
- Run one direct materialization command with small `--max-items` and bounded
  provider timeout.
- Capture job readback, manifests, local files, and telemetry counters.
- Do not accept proof if account-library/project/root-history counters are
  nonzero for a direct id.

### Phase 5 | Integration And Resumption Gate

- Update README/operator docs with the direct proof command and expected
  telemetry.
- Commit and push only after targeted validation passes.
- Install/restart runtime only after the committed code and docs are coherent.
- Leave live-follow paused until the single-chat proof passes; resume broader
  live-follow only under a separate operator decision.

## Non-Goals

- Do not tune provider guard thresholds as a substitute for scrape proof.
- Do not resume live-follow automatically.
- Do not broaden account-library automatic mode.
- Do not implement a new UI dashboard before the CLI/API proof exists.
- Do not claim completion from unit tests alone.

## Acceptance

- [x] Plan 0149 is wired into `ROADMAP.md` and `RUNBOOK.md`.
- [x] Direct single-conversation materialization emits scrape telemetry in job
  readback.
- [x] Telemetry includes CDP method counts and LLM/provider action counts.
- [x] Focused tests prove direct id materialization does not call
  account-library, project inventory, or broad history/list surfaces.
- [x] One live proof against `chatgpt/wsl-chrome-3` completes or returns a
  structured no-candidate result with scrape telemetry.
- [x] The live proof keeps live-follow paused and records exact command,
  completion/job id, manifest paths, local files, and counters.
- [x] Docs and dev logs record the command and proof gate.

## Progress Evidence

### 2026-06-28 | Instrumented Direct Path

- Added `scrapeTelemetry` to direct history materialization job results and
  artifact/file sidecar manifests.
- Added provider-action counters in `LlmService` and ChatGPT provider counters
  for target attach/open, domain enables, `Runtime.evaluate`, visible DOM
  probes, download behavior, and actual provider/browser download attempts.
- Focused regression coverage:
  - `pnpm vitest run tests/browser/llmServiceFiles.test.ts`
  - `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm exec biome check <touched files>`
  - `pnpm run plans:audit -- --keep 149`

### 2026-06-28 | Live Proof Against Paused `wsl-chrome-3`

- Kept live-follow paused; used an isolated repo-local proof server on
  `127.0.0.1:18149`.
- Heavy artifact-rich target
  `6a0fa901-77d0-83ea-80e0-fbaaa4eca529` with `--asset-kind all --max-items 3
  --provider-work-timeout-ms 120000` failed at the running stale threshold
  before a result was persisted. This remains open evidence that the full
  artifact-heavy case is still too slow or blocked before result telemetry.
- Smaller artifact target `6a066c34-5664-83ea-99c1-94f44d0428ea` completed as
  `hmj_0740b08ee2364bac85ef6247327b64bc`; it scraped one artifact candidate
  and returned structured no-downloadable-asset telemetry:
  `providerActions={llmService.materializeConversationArtifacts:1,
  llmService.getConversationContext:1, chatgpt.connectExistingTarget:4,
  chatgpt.readConversationMessages:3, chatgpt.readVisibleConversationFiles:1,
  chatgpt.readVisibleDownloadArtifactProbes:1,
  chatgpt.readVisibleImageArtifactProbes:1,
  chatgpt.readVisibleCanvasProbes:1}`,
  `cdpCalls={Target.attachToTarget:4, Page.enable:4, Runtime.enable:4,
  Runtime.evaluate:7, Browser.setDownloadBehavior:1}`.
- Files-only target `6a0b63f7-cc4c-83ea-b37a-4f094762838d` completed as
  `hmj_22812c8aa8b6447683d36d3e4bab2c9e`; it materialized
  `10-Full Proposal Preview.pdf` to
  `/home/ecochran76/.auracall/cache/providers/chatgpt/eric.cochran@soylei.com/conversation-attachments/6a0b63f7-cc4c-83ea-b37a-4f094762838d/files/6a0b63f7-cc4c-83ea-b37a-4f094762838d-7dabf656-8378-45c0-9baf-37abc502ada1-0-10-Full Proposal Preview.pdf/10-Full Proposal Preview.pdf`.
  Manifest:
  `/home/ecochran76/.auracall/cache/providers/chatgpt/eric.cochran@soylei.com/conversation-attachments/6a0b63f7-cc4c-83ea-b37a-4f094762838d/file-fetch-manifest.json`.
  Telemetry:
  `providerActions={llmService.materializeConversationFiles:1,
  llmService.listConversationFiles:1, provider.listConversationFiles:1,
  chatgpt.connectExistingTarget:4, chatgpt.readVisibleConversationFiles:1,
  chatgpt.downloadConversationFile:1}`,
  `cdpCalls={Target.attachToTarget:4, Page.enable:4, Runtime.enable:4,
  Runtime.evaluate:2}`, `downloads={attempted:1, succeeded:1, failed:0}`.
- Direct-id proof showed zero `llmService.listAccountFiles`,
  `provider.listAccountFiles`, `llmService.listProjectFiles`, and
  `provider.listProjectFiles` counters. Remaining open issue: four target
  attaches/domain-enables per run and 130-140s completion latency are too high
  for a clean "load once, parse once" scrape.

### 2026-06-28 | Scoped Target Reuse And Timeout Telemetry

- Added opt-in scoped provider sessions for direct materialization so
  ChatGPT list/context/download steps can reuse the same CDP target attachment
  across one `history-materialization-create --conversation-id ...` job.
- Added stale-timeout progress telemetry sidecars at
  `~/.auracall/runtime/archive/history-materialization-jobs/<job>-scrape-telemetry.json`;
  stale recovery now attaches the latest snapshot to failed job readback.
- Fixed the first scoped-session live bug: retained ChatGPT sessions must not
  be closed by intermediate provider-method `finally` blocks, or the next
  download step reuses a closed WebSocket.
- Files-only live proof
  `hmj_97829e859adf4cf6bd2607a53187f988` against paused `wsl-chrome-3`
  materialized `10-Full Proposal Preview.pdf` from
  `6a0b63f7-cc4c-83ea-b37a-4f094762838d` with:
  `providerActions={llmService.materializeConversationFiles:1,
  llmService.listConversationFiles:1, provider.listConversationFiles:1,
  chatgpt.connectExistingTarget:1, chatgpt.retainScopedTarget:1,
  chatgpt.readVisibleConversationFiles:1, chatgpt.reuseScopedTarget:3,
  chatgpt.downloadConversationFile:1}`,
  `cdpCalls={Target.attachToTarget:1, Page.enable:1, Runtime.enable:1,
  Runtime.evaluate:2}`, `downloads={attempted:1, succeeded:1, failed:0}`.
  Manifest:
  `/home/ecochran76/.auracall/cache/providers/chatgpt/eric.cochran@soylei.com/conversation-attachments/6a0b63f7-cc4c-83ea-b37a-4f094762838d/file-fetch-manifest.json`.
- Heavy artifact-rich `all` target
  `hmj_0ed6ee6b8c4a4937b014d17f1782f094` still failed at the 180s running
  stale threshold, but failed-job readback preserved scrape telemetry:
  `payloadArtifacts=3`, `domDownloadArtifacts=3`, `visibleFiles=2`,
  `llmService.materializeConversationArtifacts.artifacts=2`,
  `chatgpt.clickArtifactDownload=1`, `chatgpt.fetchBinary=1`,
  `cdpCalls={Target.attachToTarget:2, Page.enable:2, Runtime.enable:2,
  Runtime.evaluate:9, Browser.setDownloadBehavior:1}`.
- Remaining open issue: direct artifact-heavy materialization is now isolated
  to artifact click/fetch/download waiting after candidate extraction, not
  broad account-library/project/history fanout and not repeated four-attach
  target churn.

### 2026-06-28 | Accepted Artifact-Rich Single-Chat Proof

- Fixed the remaining single-chat blockers found by live telemetry:
  - ChatGPT artifact materialization now tries the browser download first and
    bounds captured-anchor binary fetch fallback.
  - Scoped artifact/file transfer phases skip redundant interaction-governor
    waits and post-commit quiet waits after the initial conversation read.
  - Scoped cache resolution disables provider identity detection and feature
    signature probes during post-scrape transfer setup.
  - Conversation-file listing is bounded at the service layer; if optional file
    enumeration wedges after artifacts materialize, the job records
    `llmService.materializeConversationFiles.listTimedOut` and completes with a
    skipped file entry instead of aging into stale-running failure.
- Accepted live proof:
  `hmj_3e6e8bc40a9b49cb9c99e761dfbfc8be` on isolated repo-local server
  `127.0.0.1:18149`, target conversation
  `6a0fa901-77d0-83ea-80e0-fbaaa4eca529`, command shape:
  `pnpm tsx bin/auracall.ts api history-materialization-create --port 18149 --provider chatgpt --runtime-profile wsl-chrome-3 --bound-identity-key eric.cochran@soylei.com --conversation-id 6a0fa901-77d0-83ea-80e0-fbaaa4eca529 --asset-kind all --max-items 3 --provider-work-timeout-ms 180000 --force --json`.
- Result: job succeeded in about 42s, materialized two generated-artifact PDFs,
  and left live-follow paused with no installed service restart.
- Materialized files:
  - `Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_clean_2page.pdf`,
    size `154914`, sha256
    `7275c5d08508b22855a8ad36bc06d7cc6e3476f5ab84620814381b09b037e767`.
  - `Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_revised_MYAP.pdf`,
    size `240115`, sha256
    `2af143990726fe561aa02a36756f180738c2bc706c466361943801cb9a1f4221`.
- Manifest:
  `/home/ecochran76/.auracall/cache/providers/chatgpt/eric.cochran@soylei.com/conversation-attachments/6a0fa901-77d0-83ea-80e0-fbaaa4eca529/artifact-fetch-manifest.json`.
- Scrape telemetry:
  `providerActions={llmService.materializeConversationArtifacts:1,
  llmService.getConversationContext:1, chatgpt.connectExistingTarget:3,
  chatgpt.retainScopedTarget:3, chatgpt.readConversationMessages:3,
  chatgpt.readVisibleConversationFiles:2,
  chatgpt.readVisibleDownloadArtifactProbes:1,
  chatgpt.readVisibleImageArtifactProbes:1,
  chatgpt.readVisibleCanvasProbes:1,
  llmService.materializeConversationArtifacts.invokeProvider:2,
  chatgpt.materializeArtifact.start:2, chatgpt.clickArtifactDownload:2,
  llmService.materializeConversationFiles.listTimedOut:1}`.
  `cdpCalls={Target.attachToTarget:3, Page.enable:3, Runtime.enable:3,
  Runtime.evaluate:10, Browser.setDownloadBehavior:2}`.
  `candidates={payloadArtifacts:3, domDownloadArtifacts:3, visibleFiles:2,
  materializableArtifacts:2, materializableFiles:0}`.
  `downloads={attempted:2, succeeded:2, failed:0}`.
- Direct-id proof retained zero account-library/project/root-history fanout
  counters for the materialization run. The optional file-list timeout is now
  explicit telemetry, not a hidden stale-running failure.

## Validation Plan

- `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts`
- `pnpm vitest run tests/runtime.historyMaterializationService.test.ts -t "single|conversation|materialization|telemetry|artifact"`
- `pnpm vitest run tests/browser/chatgptAdapter.test.ts -t "artifact|conversation|telemetry"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check <touched files>`
- `pnpm run plans:audit -- --keep 149`
- Live/manual-safe proof:
  `auracall api history-materialization-create --port 18095 --provider chatgpt --runtime-profile wsl-chrome-3 --conversation-id <id> --asset-kind all --max-items 3 --provider-work-timeout-ms 120000 --json`

## Definition Of Done

Plan 0149 closed on `2026-06-28` after the direct single-chat scrape path was
instrumented, tested, and proven live with exact traffic counters. The accepted
proof materialized two artifact assets from a direct artifact-rich ChatGPT
conversation while avoiding broad account-library/project/history fanout.
