# RUNBOOK

## Turn 70 | 2026-04-27

- Active plan:
  `docs/dev/plans/0062-2026-04-27-chatgpt-image-generation.md`
- Goal: add the first ChatGPT browser image generation path without repeating
  the Gemini/Grok post-submit re-navigation failure mode.
- Result:
  - added ChatGPT `completionMode = prompt_submitted` support to the existing
    browser runner so media runs return after trusted submit and retain the
    submitted tab target
  - added the ChatGPT browser media executor for image generation, active-tab
    artifact polling, and generated-image materialization through the existing
    artifact fetch path
  - expanded the CLI/API schema to accept `provider = chatgpt` for durable
    media-generation image requests
- Verification target:
  - `pnpm vitest run tests/mediaGenerationChatgptBrowserExecutor.test.ts tests/mediaBrowserExecutor.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit --pretty false`

## Turn 71 | 2026-04-27

- Active plan:
  `docs/dev/plans/0062-2026-04-27-chatgpt-image-generation.md`
- Goal: run the installed-runtime ChatGPT image smoke.
- Result:
  - fixed media record temp-file collisions exposed by async ChatGPT progress
    writes
  - fixed nested browser dispatch self-deadlock when ChatGPT media generation
    calls `runBrowserMode` while the media executor already owns the
    browser-operation lock
  - installed-runtime retry reached ChatGPT managed-profile auth wait but did
    not submit the image prompt because the default managed ChatGPT browser
    profile was not signed in
- Verification target:
  - `pnpm vitest run tests/mediaGeneration.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/mediaGenerationChatgptBrowserExecutor.test.ts tests/mediaGeneration.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run build`
  - `git diff --check`

## Turn 69 | 2026-04-27

- Active plan:
  `docs/dev/plans/0062-2026-04-27-chatgpt-image-generation.md`
- Goal: start the ChatGPT image-generation slice and audit ChatGPT readback for
  impatient post-submit navigation.
- Result:
  - opened Plan 0062 and wired it into the roadmap
  - confirmed ChatGPT generated-image artifact extraction is green for mature
    conversations, while first-class media generation remains unimplemented
  - changed ChatGPT payload readback and blocking-surface recovery so
    `preserveActiveTab` skips conversation reload/reopen recovery
  - added a targeted regression for the no-reload payload readback path
- Verification target:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/navigationPolicy.test.ts --maxWorkers 1`
  - `pnpm run plans:audit -- --keep 62`
  - `git diff --check`

## Turn 68 | 2026-04-25

- Active plan:
  `docs/dev/plans/0058-2026-04-25-browser-response-queued-dispatch.md`
- Goal: opt normal managed browser response/chat execution into queued
  browser-service dispatch.
- Result:
  - changed `acquireBrowserExecutionOperation(...)` to use
    `BrowserOperationDispatcher.acquireQueued(...)`
  - preserved the existing `browser-execution` operation kind and dispatcher key
  - added queue/acquire and timeout/busy tests
  - left login/setup/human-verification flows fail-fast
- Verification target:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser-service/operationDispatcher.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 58`
  - `git diff --check`

## Turn 67 | 2026-04-25

- Active plan:
  `docs/dev/plans/0057-2026-04-25-browser-media-queued-dispatch.md`
- Goal: opt the first async browser product path into queued browser-service
  dispatch.
- Result:
  - wrapped Gemini/Grok browser media execution in
    `BrowserOperationDispatcher.acquireQueued(...)`
  - added media timeline events `browser_operation_queued` and
    `browser_operation_acquired`
  - kept Gemini API transport and human/login flows outside queued dispatch
  - used raw DevTools operation keys for explicit Grok video readback probes
- Verification target:
  - `pnpm vitest run tests/mediaBrowserExecutor.test.ts tests/browser-service/operationDispatcher.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 57`
  - `git diff --check`

## Turn 66 | 2026-04-25

- Active plan:
  `docs/dev/plans/0056-2026-04-25-browser-operation-queued-dispatch.md`
- Goal: continue the browser-service control-plane lane by adding an opt-in
  queued dispatch primitive for future service/API/MCP browser callers.
- Result:
  - added `BrowserOperationDispatcher.acquireQueued(...)`
  - preserved existing fail-fast `acquire(...)` behavior for hard-stop flows
  - covered queued in-memory and file-backed acquisition plus timeout/busy
    readback
- Verification target:
  - `pnpm vitest run tests/browser-service/operationDispatcher.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 56`
  - `git diff --check`

## Turn 65 | 2026-04-25

- Active plan:
  `docs/dev/plans/0050-2026-04-23-workbench-capability-surfaces.md`
- Goal: continue browser-first capability work after provider API media access
  was parked.
- Result:
  - added no-live browser-discovery adapter coverage for Gemini tool drawer
    labels, ChatGPT apps/skills/research labels, and Grok Imagine entrypoint
    discovery options
  - closed Plan 0050 for capability discovery/reporting across CLI/API/MCP and
    browser-backed feature-signature mapping
  - left provider-backed invocation beyond media generation for a future
    bounded per-capability plan
- Verification target:
  - `pnpm vitest run tests/workbenchBrowserDiscovery.test.ts tests/workbenchCapabilities.test.ts tests/http.workbenchCapabilities.test.ts tests/mcp.workbenchCapabilities.test.ts tests/cli/workbenchCapabilitiesCommand.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 50`
  - `git diff --check`

## Turn 64 | 2026-04-25

- Active plan:
  `docs/dev/plans/0055-2026-04-25-media-generation-compatibility-follow-up.md`
- Goal: record the operator decision to sideline provider API access for now.
- Result:
  - skipped the proposed live Gemini API image smoke
  - kept explicit Gemini `transport = api` support as implemented, but parked
    provider API media access for current dogfooding
  - restored browser-first media/workbench behavior as the active priority in
    roadmap and operator docs
- Verification target:
  - `pnpm run plans:audit -- --keep 55`
  - `git diff --check`

## Turn 63 | 2026-04-25

- Active plan:
  `docs/dev/plans/0055-2026-04-25-media-generation-compatibility-follow-up.md`
- Goal: audit the current Gemini API image contract and either implement or
  defer Gemini API image execution for durable media-generation runs.
- Result:
  - added a Gemini API media executor for `provider = gemini`,
    `mediaType = image`, and explicit `transport = api`
  - used the Google GenAI SDK `models.generateImages` path with default Imagen
    model `imagen-4.0-generate-001`, `GEMINI_API_KEY`, count/aspect/size
    options, inline-byte artifact caching, and focused failure codes
  - kept browser Gemini media and legacy `--generate-image <file>` behavior
    unchanged
  - closed Plan 0055
- Verification target:
  - `pnpm vitest run tests/mediaGenerationGeminiApiExecutor.test.ts tests/cli.mediaGenerationCommand.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 55`
  - `git diff --check`

## Turn 62 | 2026-04-25

- Active plan:
  `docs/dev/plans/0055-2026-04-25-media-generation-compatibility-follow-up.md`
- Goal: make the legacy Gemini `--generate-image <file>` decision explicit
  before changing behavior.
- Result:
  - kept `--generate-image <file>` as a documented compatibility shortcut for
    direct one-file Gemini browser image saves
  - documented `auracall media generate` as the preferred durable
    image/music/video path because it preserves media ids, status polling,
    timeline evidence, and cached artifacts
  - left Gemini API image execution as the remaining Plan 0055 follow-up
- Verification target:
  - `pnpm run plans:audit -- --keep 55`
  - `git diff --check`

## Turn 61 | 2026-04-25

- Active plan:
  `docs/dev/plans/0049-2026-04-22-media-generation-surfaces.md`
- Goal: audit Plan 0049's remaining unchecked items and either close it or
  split true follow-up into a bounded compatibility plan.
- Result:
  - closed Plan 0049 for the shared durable media-generation resource across
    CLI, local API, MCP, status, and browser-backed Gemini/Grok provider paths
  - opened
    `docs/dev/plans/0055-2026-04-25-media-generation-compatibility-follow-up.md`
    for legacy Gemini `--generate-image` migration and Gemini API image
    execution
  - updated roadmap wiring so provider media core and compatibility/API
    follow-up are separate planning authorities
- Verification target:
  - `pnpm run plans:audit -- --keep 49 --keep 55`
  - `git diff --check`

## Turn 60 | 2026-04-25

- Active plan:
  `docs/dev/plans/0049-2026-04-22-media-generation-surfaces.md`
- Goal: add no-live parser-level regression coverage for the actual
  `auracall media generate` Commander path.
- Result:
  - moved media command registration into `src/cli/mediaGenerationCommand.ts`
    so tests can exercise the real command tree with injected seams
  - added a Commander parse test for provider/type/prompt/count/aspect-ratio,
    `--no-wait`, and `--json`
  - kept browser/provider execution mocked out, so the test cannot open a
    browser or spend media-generation quota
- Verification:
  - `pnpm vitest run tests/cli.mediaGenerationCommand.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 49`
  - `git diff --check`

## Turn 59 | 2026-04-25

- Active plan:
  `docs/dev/plans/0049-2026-04-22-media-generation-surfaces.md`
- Goal: start the next media-parity slice by adding a CLI create path on the
  shared durable media-generation contract.
- Result:
  - added `auracall media generate` for `gemini|grok` and
    `image|music|video`
  - wired CLI creation through the same durable media-generation service used
    by API/MCP, with `source = cli`, browser transport default, and `--no-wait`
    async creation for run-status polling
  - kept legacy Gemini `--generate-image` as a compatibility side path until a
    later explicit migration slice
  - updated README, testing docs, Plan 0049, dev journal, and fixes log
- Verification:
  - `pnpm vitest run tests/cli.mediaGenerationCommand.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run build`
  - `pnpm tsx bin/auracall.ts media generate --help`
  - `pnpm run plans:audit -- --keep 49`
  - `git diff --check`

## Turn 58 | 2026-04-25

- Active plan:
  `docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md`
- Goal: review the completed Grok Imagine browser-first work and decide
  whether Plan 0054 should close or produce another bounded follow-up.
- Result:
  - closed Plan 0054 after image/video discovery, guarded submit, submitted-tab
    status sensing, materialization, compact status diagnostics, live proofs,
    and provider-adapter regression coverage were all recorded
  - updated the roadmap so the next Grok step is no longer stale browser
    discovery work
  - left xAI API execution and Grok edit/reference workflows deferred for a
    future bounded plan
- Verification target:
  - `pnpm run plans:audit -- --keep 54`
  - `git diff --check`

## Turn 57 | 2026-04-24

- Active plan:
  `docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md`
- Goal: implement the first browser-first Grok Imagine discovery slice without
  submitting a generation request.
- Result:
  - added static Grok Imagine image/video workbench capability entries
  - added read-only Grok browser feature-signature probing for Imagine
    visibility, labels, routes, modes, account gating, and blocked/failure
    evidence
  - mapped Grok Imagine feature signatures into
    `grok.media.imagine_image` and `grok.media.imagine_video`
  - wired CLI/API capability discovery so `provider=grok` can use the same
    browser-backed discovery path as Gemini and ChatGPT
  - live read-only managed-browser probe observed `/imagine` and reported
    `grok.media.imagine_image` as `account_gated`; video remained static
    `unknown`
- Verification:
  - `pnpm vitest run tests/workbenchCapabilities.test.ts tests/http.workbenchCapabilities.test.ts tests/mcp.workbenchCapabilities.test.ts tests/cli/workbenchCapabilitiesCommand.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm tsx bin/auracall.ts capabilities --target grok --static --json`
  - `pnpm tsx bin/auracall.ts capabilities --target grok --json`
  - `pnpm run check`

## Turn 56 | 2026-04-24

- Active plan:
  `docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md`
- Goal: research Grok Imagine before implementation because the interface is
  provider-specific and has separate image/video execution shapes.
- Result:
  - xAI API image generation uses `grok-imagine-image` through
    `/v1/images/generations`
  - image generation can return URL or base64 data and supports `n`,
    `aspect_ratio`, and `resolution`
  - xAI API video generation uses `grok-imagine-video` through
    `/v1/videos/generations`, returns a `request_id`, and requires polling
    `/v1/videos/{request_id}`
  - video URLs are temporary and must be downloaded promptly
  - xAI API access is separate from Grok.com/X/mobile subscription state
- Decision:
  - user corrected priority to browser-first Grok Imagine
  - implement managed-browser Imagine discovery before provider invocation
  - defer xAI API image/video execution, image editing, video editing, and
    browser prompt submission to later bounded slices
- Verification target:
  - `pnpm run plans:audit -- --keep 54`
  - `git diff --check`

## Turn 55 | 2026-04-23

- Active plan: `docs/dev/plans/0050-2026-04-23-workbench-capability-surfaces.md`
- Goal: extend read-only workbench capability discovery to ChatGPT's volatile
  composer/workbench tool surface.
- Result:
  - ChatGPT feature signatures now project available capabilities for Web
    Search, Deep Research, Company Knowledge, visible apps/connectors, and
    visible skills
  - static ChatGPT apps, Company Knowledge, and skills remain conservative
    `account_gated` entries until discovery proves current-account visibility
  - API/MCP/CLI capability reports reuse the existing read-only capability
    contract and do not invoke or enable provider tools
- Verification:
  - `pnpm vitest run tests/workbenchCapabilities.test.ts tests/http.workbenchCapabilities.test.ts tests/mcp.workbenchCapabilities.test.ts tests/cli/workbenchCapabilitiesCommand.test.ts --maxWorkers 1`
  - `pnpm tsx bin/auracall.ts capabilities --target chatgpt --static --json`
  - `pnpm tsx bin/auracall.ts capabilities --target gemini --static --json`

## Turn 54 | 2026-04-23

- Active plan: `docs/dev/plans/0038-2026-04-21-service-runner-roadmap-checkpoint.md`
- Goal: complete the service/runner integration-hygiene action that Plan 0038
  selected before any new implementation lane.
- Result:
  - worktree was clean before the pass
  - broad HTTP/MCP/runtime/CLI runner-control validation passed
  - no fresh service/runner ownership or readback mismatch was reproduced
  - service/runner architecture expansion remains paused until a concrete
    product requirement or reproduced mismatch justifies a new bounded plan
- Verification:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts tests/runtime.configuredExecutor.test.ts tests/runtime.schedulerAuthority.test.ts tests/runtime.runnersControl.test.ts tests/runtime.dispatcher.test.ts tests/runtime.control.test.ts tests/runtime.inspection.test.ts tests/runtime.api.test.ts tests/runtime.responsesService.test.ts tests/mcp.runStatus.test.ts tests/mcp.runtimeInspect.test.ts tests/mcp/teamRun.test.ts tests/http.mediaGeneration.test.ts tests/mcp.mediaGeneration.test.ts tests/cli.runStatusCommand.test.ts tests/cli/runtimeInspectionCommand.test.ts tests/cli/teamRunCommand.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/mcp/teamRun.test.ts tests/teams.runtimeBridge.test.ts tests/runtime.runner.test.ts tests/runtime.lease.test.ts tests/runtime.store.test.ts tests/runtime.runnersStore.test.ts tests/teams.service.test.ts tests/teams.store.test.ts tests/teams.schema.test.ts --maxWorkers 1`

## Turn 53 | 2026-04-23

- Active browser reliability exception:
  `docs/dev/plans/0053-2026-04-23-browser-control-plane-completion.md`
- Reason:
  - reproduced Gemini browser-media runs proved the earlier dispatcher work was
    necessary but not sufficient
  - managed-profile mutation authority is still split across browser-service
    helpers, provider adapters, and legacy browser flows
- Codebase audit inventory recorded in Plan 0053:
  - direct `Page.navigate(...)` call sites: `7`
  - direct `Page.reload(...)` call sites: `5`
  - explicit `location.assign(...)` call sites: `1`
  - explicit `location.href =` / `window.location` mutation call sites: `6`
  - `openOrReuseChromeTarget(...)` call sites: `9`
  - `navigateAndSettle(...)` call sites: `13`
- Next checkpoint:
  - route managed-profile navigation/reload/target-reuse mutation intent
    through one browser-service-owned control plane with mutation audit
    records before doing more provider-local browser hardening

## Turn 1 | 2026-04-14

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- Adjacent canonical plan: `docs/dev/plans/0002-2026-04-14-task-run-spec.md`
- Adjacent canonical plan: `docs/dev/plans/0003-2026-04-14-team-run-data-model.md`
- Adjacent canonical plan: `docs/dev/plans/0004-2026-04-14-team-service-execution.md`
- Adjacent canonical plan: `docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md`
- Adjacent canonical plan: `docs/dev/plans/0006-2026-04-14-team-config-boundary.md`
- Adjacent canonical plan: `docs/dev/plans/0007-2026-04-14-config-model-refactor.md`
- Adjacent canonical plan: `docs/dev/plans/0008-2026-04-14-browser-profile-family-refactor.md`
- Adjacent canonical plan: `docs/dev/plans/0009-2026-04-14-agent-config-boundary.md`
- Adjacent canonical plan: `docs/dev/plans/0010-2026-04-14-service-volatility-chatgpt.md`
- Adjacent canonical plan: `docs/dev/plans/0011-2026-04-14-browser-service-refactor-roadmap.md`
- Adjacent canonical plan: `docs/dev/plans/0012-2026-04-14-service-volatility-refactor.md`
- Adjacent canonical plan: `docs/dev/plans/0013-2026-04-14-gemini-completion.md`
- Adjacent canonical plan: `docs/dev/plans/0014-2026-04-14-browser-service-reattach-reliability.md`
- Goal: migrate active planning authority into canonical `docs/dev/plans/`
  artifacts without changing runtime behavior.

## Turn 2 | 2026-04-14

- Read `AGENTS.md` before touching behavior.
- Keep `docs/dev/dev-journal.md` and `docs/dev-fixes-log.md` updated when a
  repair lands or when a new failure mode becomes clear.
- For generic DOM drift, consult:
  - `docs/dev/browser-service-upgrade-backlog.md`
  - `docs/dev/browser-service-tools.md`
  - `docs/dev/browser-automation-playbook.md`
- For broader package-boundary follow-ons after the ChatGPT cycle, review
  `docs/dev/browser-service-lessons-review-2026-03-30.md`.

## Turn 3 | 2026-04-14

Prioritize diagnostics adoption on these Grok surfaces:

- account `/files` delete row actions
- project `Sources -> Personal files` list/upload/delete/save flows

Keep trigger/button scoring provider-local unless the same scoring shape repeats
on another real surface/provider.

## Turn 4 | 2026-04-14

Run on a normal Node 22 + pnpm dev box:

```sh
pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1
pnpm run check
```

Recommended live Grok follow-up commands:

```sh
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects files list <projectId> --target grok
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects files add <projectId> <file> --target grok
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects files remove <projectId> <file> --target grok
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts files remove <fileId> --target grok
```

## Turn 5 | 2026-04-15

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- Goal: keep the public runtime inspection contract aligned across CLI, HTTP,
  tests, and governing docs without widening execution semantics.
- Completed:
  - widened `auracall api inspect-run` and `GET /v1/runtime-runs/inspect` to
    accept exactly one of:
    - `runId`
    - `runtimeRunId`
    - `teamRunId`
    - `taskRunSpecId`
  - preserved `runnerId` as the optional affinity-evaluation input
  - added focused CLI and HTTP coverage for the new lookup aliases plus
    invalid-request shape checks
  - synchronized `README.md`, `docs/testing.md`, `ROADMAP.md`, and the active
    execution plan with the same lookup-key contract
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/cli/runtimeInspectionCommand.test.ts`
  - `pnpm plans:audit`

## Turn 6 | 2026-04-15

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- Goal: tighten runtime inspection readback so alias-based queries remain
  operator-visible without widening execution semantics.
- Completed:
  - added alias provenance to runtime inspection payloads:
    - `resolvedBy`
    - `queryId`
    - existing resolved `queryRunId`
  - kept the runtime inspection surface read-only and did not add public write
    behavior
  - synchronized CLI formatting plus HTTP/CLI tests and operator docs with the
    same bounded response contract
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/cli/runtimeInspectionCommand.test.ts`

## Turn 7 | 2026-04-15

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- Goal: keep runtime inspection alias resolution auditable when one alias can
  map to multiple persisted runtime runs.
- Completed:
  - added bounded alias match summary to runtime inspection payloads:
    - `matchingRuntimeRunCount`
    - `matchingRuntimeRunIds`
  - kept the route read-only and bounded to the latest resolved runtime run
    plus a compact candidate summary
  - synchronized CLI formatting, focused HTTP/CLI tests, and operator docs
    with the same bounded match-summary contract
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/cli/runtimeInspectionCommand.test.ts`

## Turn 8 | 2026-04-15

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- Adjacent plan:
  `docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md`
- Goal: reassess the roadmap after the configured account-affinity checkpoint
  instead of continuing implementation by inertia.
- Decision:
  - durable state/account mirroring is now an active single-runner checkpoint,
    not merely planned future signal
  - configured account-affinity is complete enough across runner metadata,
    runtime inspection, local claim, targeted-drain diagnostics, tests, and
    operator docs
  - public team execution writes and multi-runner/background-worker service mode
    remain paused
- Next checkpoint:
  - run one bounded local `api serve` operator smoke for `/status`,
    local-claim summary, and `GET /v1/runtime-runs/inspect` account-affinity
    readback before choosing another implementation lane
- Verification target:
  - `pnpm run plans:audit`
  - `pnpm run check`

## Turn 9 | 2026-04-15

- Active plan: `docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md`
- Goal: run the bounded local `api serve` operator smoke requested by the
  durable account-affinity checkpoint.
- Completed:
  - started `auracall api serve` against an isolated temporary
    `AURACALL_HOME_DIR` with configured ChatGPT service identity
  - paused background drain before seeding a runnable direct run, so the smoke
    did not call live browser/API providers
  - confirmed `/status` exposed:
    - active persisted local runner
    - paused background drain
    - compact direct-run `localClaimSummary`
    - `selectedRunIds = ["smoke_runtime_account_affinity_1"]`
  - confirmed `GET /v1/runtime-runs/inspect` with the server runner returned:
    - `claimState = claimable`
    - `requiredServiceAccountId = service-account:chatgpt:operator@example.com`
    - runner `serviceAccountIds` containing the same id
  - confirmed the same inspection route with an intentionally missing-account
    runner returned:
    - `claimState = blocked-affinity`
    - `reason = runner runner:smoke-missing-account does not expose service account service-account:chatgpt:operator@example.com`
  - stopped the isolated server after the smoke.
- Decision:
  - the durable-state/account-affinity sub-lane is green at the current
    single-runner checkpoint
  - pause this sub-lane and choose the next roadmap lane explicitly before more
    service-mode implementation
- Verification target:
  - `pnpm run check`
  - `git diff --check`

## Turn 10 | 2026-04-15

- Active plan: `docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md`
- Adjacent plans:
  - `docs/dev/plans/0001-2026-04-14-execution.md`
  - `docs/dev/plans/0003-2026-04-14-team-run-data-model.md`
  - `docs/dev/plans/0004-2026-04-14-team-service-execution.md`
  - `docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md`
- Goal: memorialize the service-health, passive-monitoring, and
  reproducibility design boundary before starting another implementation lane.
- Decision:
  - build a durable team-run review ledger before broad passive provider-state
    monitoring
  - keep provider chat caches as supplemental evidence, not the canonical
    orchestration record
  - attach future provider states such as `thinking`, `response-incoming`, and
    hard-stop classifications to ledger observations instead of letting DOM
    state define the execution model
- Next implementation checkpoint:
  - Slice 1 is contract and projection-only review ledger from existing
    persisted runtime/team records
  - keep public team execution writes paused
  - keep multi-runner/background-worker expansion paused
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 11 | 2026-04-15

- Active plan: `docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md`
- Goal: implement Slice 1 without adding public team execution writes or a new
  operator surface.
- Completed:
  - added `src/teams/reviewLedger.ts`
  - added `tests/teams.reviewLedger.test.ts`
  - projected a read-only ledger from existing runtime bundles
  - preserved deterministic serial step order, handoffs, artifacts,
    prompt/input snapshots, output snapshots, failures, and provenance
  - preserved provider conversation refs from existing `browserRun` output
    metadata when available
  - represented missing provider refs as `null`
- Deferred:
  - public read-only endpoint or CLI review command
  - provider reference enrichment beyond existing `browserRun` metadata
  - passive hard-stop observations
- Verification:
  - `pnpm vitest run tests/teams.reviewLedger.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## Turn 12 | 2026-04-15

- Active plan: `docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md`
- Goal: implement Slice 2 as a bounded read-only operator surface.
- Completed:
  - added `reviewTeamRunLedger(...)` payload resolution with the same one-key
    lookup posture as team inspection
  - added `auracall teams review`
  - supported exactly one of:
    - `--task-run-spec-id`
    - `--team-run-id`
    - `--runtime-run-id`
  - preserved alias provenance, bounded matching runtime-run ids, task-run spec
    summary, and the projected ledger
  - kept the surface read-only
- Deferred:
  - HTTP review endpoint
  - provider reference enrichment beyond existing `browserRun` metadata
  - passive provider-state observations
- Verification:
  - `pnpm vitest run tests/teams.reviewLedger.test.ts tests/cli/teamRunCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## Turn 13 | 2026-04-15

- Active plan: `docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md`
- Goal: implement Slice 3 provider reference enrichment without adding
  provider scraping or inferred cache paths.
- Completed:
  - enriched stored browser-run metadata from configured team execution with:
    - provider/service
    - conversation id and tab URL
    - configured URL and project id
    - runtime profile id and browser profile id
    - agent id and selected model
    - explicit cache path status
  - projected those fields through `TeamRunProviderConversationRef`
  - kept cache path `null` unless stored metadata already carries a concrete
    provider cache path
- Deferred:
  - resolving exact provider cache identity/path during stored-step execution
  - passive provider-state observations
- Verification:
  - `pnpm vitest run tests/runtime.configuredExecutor.test.ts tests/teams.reviewLedger.test.ts tests/cli/teamRunCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## Turn 14 | 2026-04-15

- Active plan: `docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md`
- Goal: implement Slice 4 minimal passive hard-stop observations without
  adding live DOM polling or broad chat-state detection.
- Completed:
  - projected durable failure-derived ledger observations for:
    - provider error
    - login required
    - captcha/human-verification
    - awaiting human action
  - attached observations to steps with source, timestamp, confidence, and
    evidence reference
  - updated `auracall teams review` text output to list observations
- Deferred:
  - rich passive `thinking` and `response-incoming` detection
  - live/manual provider smokes for observation generation
- Verification:
  - `pnpm vitest run tests/teams.reviewLedger.test.ts tests/cli/teamRunCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## Turn 15 | 2026-04-15

- Active plan: `docs/dev/plans/0016-2026-04-15-passive-provider-observations.md`
- Goal: complete the roadmap reassessment after the review-ledger checkpoint
  and choose one bounded next implementation lane.
- Completed:
  - closed the completed review-ledger checkpoint plan:
    - `docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md`
  - opened the next bounded plan:
    - `docs/dev/plans/0016-2026-04-15-passive-provider-observations.md`
  - selected adapter-owned passive provider observations as the next lane
    instead of:
    - resuming durable-state/account-mirroring work
    - resolving exact provider cache identity/path first
  - set the first slice to a stored passive-observation seam plus ChatGPT
    execution-path capture for:
    - `thinking`
    - `response-incoming`
    - `response-complete`
- Verification:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 16 | 2026-04-15

- Active plan: `docs/dev/plans/0016-2026-04-15-passive-provider-observations.md`
- Goal: implement Slice 1 with one stored passive-observation seam plus
  ChatGPT execution-path capture.
- Completed:
  - extended ChatGPT browser execution to return stored passive observations
    for:
    - `thinking`
    - `response-incoming`
    - `response-complete`
  - persisted those observations into configured stored-step
    `browserRun.passiveObservations`
  - projected stored passive observations through the review ledger and
    `auracall teams review`
- Deferred:
  - Gemini parity on the same stored seam
  - Grok parity and cross-provider evidence normalization
- Verification:
  - `pnpm vitest run tests/runtime.configuredExecutor.test.ts tests/teams.reviewLedger.test.ts tests/cli/teamRunCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## Turn 17 | 2026-04-16

- Active plan: `docs/dev/plans/0016-2026-04-15-passive-provider-observations.md`
- Goal: validate the live ChatGPT passive-state sequence on the managed WSL
  Chrome path and refine the ChatGPT `thinking` evidence seam to match real
  UI behavior.
- Completed:
  - proved the managed ChatGPT WSL launch inherits `DISPLAY=:0.0` even when
    the parent shell has `DISPLAY` unset
  - captured direct instant-mode and thinking-mode ChatGPT DOM traces on the
    managed profile:
    - `/tmp/chatgpt-direct-instant-dom-trace.jsonl`
    - `/tmp/chatgpt-direct-thinking-dom-trace.jsonl`
  - confirmed the current reliable thinking signal is the placeholder
    assistant turn text `ChatGPT said:Thinking`
  - refined the ChatGPT thinking-status seam so the passive monitor checks the
    last assistant turn for that placeholder before falling back to generic
    status nodes
  - normalized that placeholder to the stable thinking label `Thinking`
  - synchronized the active passive-observations plan, roadmap, README, and
    testing docs with the live evidence boundary
- Deferred:
  - Gemini parity on the same stored observation seam
  - Grok parity and cross-provider evidence normalization
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser/thinking.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 18 | 2026-04-16

- Active plan: `docs/dev/plans/0017-2026-04-16-runtime-inspection-service-state-probe.md`
- Goal: add the first bounded read-only API/CLI contract for mid-turn live
  provider `serviceState` probing without widening `/status`, then wire
  provider-owned live probes on that seam one service at a time.
- Completed:
  - closed the passive provider-observation provider-parity plan:
    - `docs/dev/plans/0016-2026-04-15-passive-provider-observations.md`
  - opened the next bounded plan:
    - `docs/dev/plans/0017-2026-04-16-runtime-inspection-service-state-probe.md`
  - extended runtime inspection with an opt-in `serviceState` payload
  - wired explicit request surfaces for the new seam:
    - `auracall api inspect-run --probe service-state`
    - `GET /v1/runtime-runs/inspect?...&probe=service-state`
  - kept actual live provider probing injectable so the generic inspection
    layer only reports:
    - `probeStatus = observed`
    - `probeStatus = unavailable`
  - wired the default `api serve` ChatGPT-backed probe:
    - resolves the running step AuraCall runtime profile before probing
    - probes only ChatGPT-managed browser sessions on the matching runtime
      profile
    - returns honest `null` when the step runtime profile does not resolve
      back to the same AuraCall runtime profile
  - added focused helper coverage for ChatGPT placeholder-turn `thinking`,
    assistant-visible `response-incoming`, and auth-surface
    `login-required`
  - wired the default `api serve` Gemini-backed probe for browser-backed
    runtime profiles:
    - resolves the running step AuraCall runtime profile before probing
    - refuses non-browser Gemini runtime profiles
    - reports provider-owned Gemini states from live page evidence
  - added focused helper coverage for Gemini browser `thinking`,
    `response-incoming`, `response-complete`, and `login-required`
- Deferred:
  - signed-in Gemini live proof on the managed browser path
  - Grok live service-state probe on the same inspection seam
- Verification:
  - `pnpm vitest run tests/browser/liveServiceState.test.ts tests/runtime.inspection.test.ts tests/http.responsesServer.test.ts tests/cli/runtimeInspectionCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `pnpm run plans:audit`
  - `git diff --check`
  - live `api serve` ChatGPT proof:
    - started `auracall api serve --port 8092` with ambient `DISPLAY` unset
    - created one direct browser-backed response with:
      - `auracall.runtimeProfile = default`
      - `auracall.service = chatgpt`
      - model `gpt-5.2-thinking`
    - mid-turn runtime inspection on
      `resp_6a82023f7cc1458aa57411654f982eaf` returned:
      - `probeStatus = observed`
      - `service = chatgpt`
      - `state = unknown`
      - `evidenceRef = chatgpt-live-probe-no-signal`
      - `confidence = low`
  - stronger managed-profile follow-up proof:
    - started `auracall api serve --port 8093`
    - created one direct browser-backed response with:
      - `auracall.runtimeProfile = wsl-chrome-2`
      - `auracall.service = chatgpt`
      - `runId = resp_a212f22157344324bb8d8d52adbfeb8f`
    - mid-turn runtime inspection first returned:
      - `probeStatus = observed`
      - `state = thinking`
      - `evidenceRef = chatgpt-placeholder-turn`
      - `confidence = high`
    - bounded live DOM inspection on the same managed tab showed:
      - `stopVisible = true`
      - `lastAssistantText = ChatGPT said:Pro thinking`
      - no meaningful `[role="status"]` / `aria-live` signal
    - later mid-turn runtime inspection on the same run returned:
      - `probeStatus = observed`
      - `state = response-incoming`
      - `evidenceRef = chatgpt-streaming-visible`
      - `confidence = high`
    - terminal inspection then correctly returned:
      - `probeStatus = unavailable`
      - reason `runtime run ... is not actively running`
  - live blocker uncovered and fixed in the same slice:
    - `serveResponsesHttp` had not been wiring the configured stored-step
      executor by default
    - after fixing that wrapper, `/v1/responses` ran on the real configured
      browser-backed path instead of completing as an empty no-op
  - Gemini executor-owned follow-up proof:
    - started `auracall api serve --port 8096`
    - created one direct browser-backed response with:
      - `auracall.runtimeProfile = auracall-gemini-pro`
      - `auracall.service = gemini`
      - `runId = resp_5f985759ab394ebdaffce387a5cc8602`
    - repeated mid-turn runtime inspection returned:
      - `probeStatus = observed`
      - `state = thinking`
      - `evidenceRef = gemini-web-request-started`
      - `confidence = medium`
    - terminal inspection still returned:
      - `probeStatus = unavailable`
      - reason `runtime run ... is not actively running`
    - that specific run later failed after the active proof window, which
      confirms the Gemini improvement is the active-state seam rather than a
      guarantee of successful completion
  - Grok executor-owned live proof:
    - started `auracall api serve --port 8097`
    - created one direct browser-backed response with:
      - `auracall.runtimeProfile = auracall-grok-auto`
      - `auracall.service = grok`
      - `runId = resp_668e19a0ea5946d3aea8cdcbf683c127`
    - repeated mid-turn runtime inspection returned:
      - `probeStatus = observed`
      - `state = thinking`
      - `evidenceRef = grok-prompt-submitted`
      - `confidence = medium`
    - later readback showed:
      - `runStatus = succeeded`
      - terminal `serviceState.probeStatus = unavailable`
    - this closes the provider-breadth checkpoint for the current
      `serviceState` seam
  - roadmap reassessment:
    - closed
      `docs/dev/plans/0017-2026-04-16-runtime-inspection-service-state-probe.md`
      as the completed provider-breadth checkpoint
    - opened
      `docs/dev/plans/0018-2026-04-17-service-state-quality-follow-up.md`
      as the active quality lane
    - next work is explicitly quality-focused:
      - richer Gemini mid-turn states where stable provider evidence exists
      - richer Grok mid-turn states where stable provider evidence exists
    - `/status` remains out of scope and no generic runtime-owned DOM polling
      is authorized
  - Gemini quality follow-up:
    - started `auracall api serve --port 8098`
    - bounded live quality probe on
      `resp_b0b118b56afe409794b0f13cb2f006b0` returned only:
      - active `thinking` via `gemini-web-request-started`
      - then terminal `unavailable` after failure
    - bounded managed-profile DOM inspection on the same lane showed the page
      still on the idle/home surface with no stable answer-bearing history
      signal
    - conclusion:
      - do not manufacture richer Gemini states from generic heuristics on
        this machine/profile
      - keep Gemini executor-owned `thinking` as the honest active fallback
      - move the next quality slice to Grok
  - Grok quality follow-up:
    - started `auracall api serve --port 8099`
    - tightened Grok inspection precedence so provider-owned visible answer
      state can override transient executor-owned `thinking` when present
    - bounded live quality probe on
      `resp_ca285e207960420caa370da67d3180aa` still showed:
      - active `thinking` via `grok-prompt-submitted`
      - then terminal `unavailable` after successful completion
      - no stable provider-owned `response-incoming` during the active polling
        window
    - conclusion:
      - keep Grok executor-owned `thinking` as the honest active fallback on
        this machine/profile
      - keep the stricter precedence change so provider-owned visible answer
        state can win if a future live run exposes it
  - lane closeout:
    - closed
      `docs/dev/plans/0018-2026-04-17-service-state-quality-follow-up.md`
      after bounded negative evidence for both Gemini and Grok
    - next step is roadmap reassessment before any further live-state
      expansion
  - reassessment result:
    - no new bounded `serviceState` follow-up plan was opened
    - keep the current run-scoped `serviceState` seam in maintenance mode
    - only resume expansion if a future live proof exposes a new
      provider-owned evidence seam

## Turn 19 | 2026-04-17

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- Adjacent plan:
  `docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md`
- Goal: reassess whether the durable-state/account-affinity checkpoint should
  remain an active bounded plan.
- Decision:
  - the shipped single-runner/account-affinity checkpoint is complete enough
    to close as a bounded plan
  - no new durable-state/account-mirroring implementation slice is opened in
    this turn
  - keep the lane in maintenance mode until a broader durable-ownership seam
    is selected explicitly
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 20 | 2026-04-20

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- Goal: prune the roadmap execution board after the 360 review so product work
  has one primary active lane instead of many competing `OPEN` plans.
- Decision:
  - primary active implementation lane is service/runner orchestration beyond
    the current single-host bounded local-runner bridge
  - `0002`, `0003`, `0004`, `0006`, and `0009` remain active supporting
    authorities only where they preserve that lane's team/task/agent semantics
  - config, browser, volatility, and reattach tracks are maintenance-only
    unless a concrete mismatch is reproduced
  - Gemini remains a provider-expansion side track, not the primary sequencing
    authority
  - response-shape normalization and service-state probing stay parked unless
    a new public routing/readback mismatch or provider-owned evidence seam is
    demonstrated
- Scope:
  - docs-only roadmap and plan-authority pruning
  - no runtime or operator behavior changes
- Verification target:
  - `pnpm run plans:audit`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `git diff --check`

## Turn 21 | 2026-04-20

- Active plan: `docs/dev/plans/0004-2026-04-14-team-service-execution.md`
- Goal: land the smallest service/runner ownership increment after roadmap
  pruning without widening public team execution writes or multi-runner scope.
- Change:
  - `ExecutionServiceHost` now owns local runner lifecycle writes:
    - register existing-or-new local runner
    - heartbeat the local runner
    - mark the local runner stale on shutdown
  - `api serve` still owns timers, HTTP status projection, and server shutdown
    ordering, but delegates runner lifecycle mutations to the service host.
- Scope:
  - no public endpoint changes
  - no provider/browser behavior changes
  - no multi-runner expansion
- Verification target:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts`
  - `pnpm vitest run tests/http.responsesServer.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 22 | 2026-04-20

- Active plan: `docs/dev/plans/0004-2026-04-14-team-service-execution.md`
- Goal: continue the service/runner ownership lane by auditing background
  drain scheduling and extracting only the runtime-owned part.
- Decision:
  - keep background-drain timers, pause/resume state, and `/status`
    projection in `api serve`
  - move serial drain queue ownership into `ExecutionServiceHost`
  - do not create a public endpoint or widen team execution writes
- Change:
  - added `ExecutionServiceHost.drainRunsUntilIdleQueued(...)`
  - added `ExecutionServiceHost.waitForDrainQueue()`
  - rewired `api serve` to delegate queued drain execution to the service host
- Verification target:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 23 | 2026-04-20

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- New checkpoint plan:
  `docs/dev/plans/0019-2026-04-20-public-team-execution-write-surface.md`
- Goal: select the next bounded checkpoint after completing the immediate
  `api serve` service-host ownership extraction/reassessment.
- Decision:
  - stop extracting more from `api serve` by default because remaining state is
    transport/listener scoped
  - open a public team execution write preflight plan
  - candidate first write endpoint is `POST /v1/team-runs`
  - the first implementation should reuse the existing
    `TaskRunSpec -> TeamRun -> TeamRuntimeBridge` chain
  - MCP write parity and multi-runner/background-worker expansion stay
    deferred
- Scope:
  - docs-only checkpoint selection
  - no runtime or operator behavior changes

## Turn 24 | 2026-04-20

- Active plan: `docs/dev/plans/0019-2026-04-20-public-team-execution-write-surface.md`
- Goal: land the first bounded public HTTP team execution write surface.
- Completed:
  - added `POST /v1/team-runs`
  - shared the bounded task-run-spec builder and team execution payload between
    CLI and HTTP
  - routed HTTP creation through the existing
    `TaskRunSpec -> TeamRun -> TeamRuntimeBridge -> ExecutionServiceHost`
    chain
  - returned `object = "team_run"` with generated `taskRunSpec`,
    deterministic execution ids/status, and links for team inspection, runtime
    inspection, and `/v1/responses/{runtimeRunId}` readback
  - kept arbitrary prebuilt `taskRunSpec` JSON, MCP write parity,
    multi-runner scheduling, and parallel team execution deferred
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `pnpm run plans:audit`
  - `git diff --check`
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 25 | 2026-04-21

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- New browser reliability plan:
  `docs/dev/plans/0021-2026-04-21-browser-operation-dispatcher.md`
- Goal: record the roadmap/plan decision after default tenant account-health
  checks exposed a managed-profile CDP ownership problem.
- Evidence:
  - default Grok, ChatGPT, and Gemini login checks all eventually confirmed
    when run one provider at a time
  - earlier overlapping auth-mode launches reused fixed DevTools port
    `127.0.0.1:9222`
  - live doctor/probe evidence could mix tabs and account state across
    providers unless the operator manually serialized the checks
  - a separate `wsl-chrome-2/chatgpt` session also remained live, proving
    profile boundary evidence must stay explicit
- Decision:
  - open a bounded browser-service dispatcher slice instead of widening the
    runtime service/runner lane
  - first target is one operation owner per managed browser profile/service
  - login/manual-verification, browser execution, doctor, features, setup, and
    managed-profile `browser-tools` calls should acquire that operation owner
  - busy/blocked outcomes should be structured and operator-actionable
  - shared read paths remain deferred until a specific path proves it does not
    focus, select, navigate, or mutate page state
- Scope:
  - docs/roadmap/plan update only in this turn
  - no runtime or operator behavior changes yet
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 26 | 2026-04-21

- Closed browser reliability plan:
  `docs/dev/plans/0021-2026-04-21-browser-operation-dispatcher.md`
- New browser reliability plan:
  `docs/dev/plans/0022-2026-04-21-provider-selector-diagnosis-hardening.md`
- Goal: reassess Plan 0021 after implementation and serial live smoke, then
  open only the next bounded browser-service reliability slice.
- Evidence:
  - dispatcher implementation and focused tests cover login, setup, doctor,
    features, browser execution, and managed-profile `browser-tools`
  - serial live smoke proved default Grok, ChatGPT, and Gemini managed browser
    profile separation on auto-assigned ports without shared `9222`
    contamination
  - default ChatGPT stayed distinct from the live `wsl-chrome-2/chatgpt`
    session on port `45013`
  - Grok and ChatGPT doctor commands still exited nonzero because selector
    diagnosis expected conversation-output selectors on home/new-chat surfaces
- Decision:
  - close Plan 0021 as dispatcher-proofed
  - open Plan 0022 for Grok/ChatGPT selector-diagnosis hardening
  - keep the follow-up narrow: account/profile health vs
    conversation-output readiness, not prompt sending or broader provider
    automation
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 27 | 2026-04-21

- Closed browser reliability plan:
  `docs/dev/plans/0022-2026-04-21-provider-selector-diagnosis-hardening.md`
- Goal: implement the narrow Grok/ChatGPT selector-diagnosis fix opened after
  the dispatcher smoke.
- Change:
  - `src/inspector/doctor.ts` now classifies selected provider surfaces as
    `conversation` or `non-conversation`
  - non-conversation surfaces defer prompt-dependent `sendButton` checks and
    conversation-output checks (`assistantBubble`, `assistantRole`,
    `copyButton`)
  - diagnosis reports now include `surface` metadata and
    `failedRequiredChecks`
  - ChatGPT and Grok home/new-chat surfaces can pass doctor when account,
    composer, model/menu, file, and attachment evidence are present
  - conversation surfaces still require prompt/conversation-output selectors
- Live proof:
  - Grok default managed browser profile on port `45040` selected
    `https://grok.com/`, saw no blocking state, identified the expected Grok
    account, and returned selector `allPassed: true`
  - ChatGPT default managed browser profile on port `45065` selected
    `https://chatgpt.com/`, saw no blocking state, identified
    `ecochran76@gmail.com`, and returned selector `allPassed: true`
  - smoke Chrome roots were killed and two dead browser-state entries were
    pruned; `wsl-chrome-2/chatgpt` on port `45013` remained live
- Verification target:
  - `pnpm vitest run tests/inspector/doctor.test.ts tests/browser/profileDoctor.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 28 | 2026-04-21

- Closed service/runner plan:
  `docs/dev/plans/0023-2026-04-21-mcp-team-run-write-parity.md`
- Goal: land the bounded MCP team-run write parity slice after the HTTP
  `/v1/team-runs` contract stabilized.
- Change:
  - `auracall-mcp` now registers `team_run`
  - the tool accepts the same bounded team-run create shape as HTTP:
    `teamId`, `objective`, optional prompt shaping fields, output contract,
    max turns, and bounded local-action policy
  - MCP-created runs use the existing configured team-run executor and the
    existing `TaskRunSpec -> TeamRun -> TeamRuntimeBridge -> runtimeRun` path
  - team/task schemas now accept `trigger = "mcp"`
  - MCP-created task specs are stamped with `requestedBy.kind = "mcp"` and
    `auracall-mcp team_run` context
  - build output now copies `configs/` into `dist/configs/` so the built MCP
    server can import configured executor/provider registry code
- Verification target:
  - `pnpm vitest run tests/mcp/teamRun.test.ts tests/cli/teamRunCommand.test.ts tests/teams.schema.test.ts tests/mcp.schema.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run test:mcp`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 29 | 2026-04-21

- Closed service/runner plan:
  `docs/dev/plans/0024-2026-04-21-taskrunspec-public-contract-reconciliation.md`
- Goal: reassess the roadmap after HTTP and MCP team-run write parity and
  select the next bounded checkpoint.
- Decision:
  - do not widen into multi-runner/background-worker work yet
  - use the live flattened `TaskRunSpec` schema as the first public full-spec
    compatibility target
  - defer sectioned public envelopes until a versioned compatibility layer is
    justified
  - keep compact HTTP and MCP team-run create requests unchanged
  - next implementation slice should accept a prebuilt `taskRunSpec` only after
    `TaskRunSpecSchema` validation and conflict checks
- Scope:
  - roadmap/plan reassessment only
  - no runtime or operator behavior changes
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 30 | 2026-04-21

- Closed service/runner plan:
  `docs/dev/plans/0025-2026-04-21-prebuilt-taskrunspec-acceptance.md`
- Goal: implement public prebuilt `taskRunSpec` acceptance against the live
  flattened schema selected in Plan 0024.
- Change:
  - HTTP `POST /v1/team-runs` now accepts either compact assignment fields or
    a prebuilt flattened `taskRunSpec`
  - MCP `team_run` now accepts the same prebuilt flattened `taskRunSpec`
  - prebuilt specs validate through `TaskRunSpecSchema`
  - top-level `teamId` may accompany a prebuilt spec only when it matches
    `taskRunSpec.teamId`
  - compact assignment fields cannot be mixed with `taskRunSpec`
  - prebuilt specs preserve assignment fields, ids, policies, trigger, and
    requested-by provenance through the existing
    `TaskRunSpec -> TeamRun -> TeamRuntimeBridge -> runtimeRun` chain
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/mcp/teamRun.test.ts tests/cli/teamRunCommand.test.ts tests/teams.schema.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 31 | 2026-04-21

- Closed service/runner reassessment plan:
  `docs/dev/plans/0026-2026-04-21-service-runner-topology-reassessment.md`
- Goal: choose the next bounded checkpoint after compact and prebuilt public
  team-run writes landed on HTTP and MCP.
- Decision:
  - do not jump directly into multi-runner/background-worker execution
  - the current `ExecutionServiceHost` remains deliberately runner-scoped
  - existing claim-candidate ordering is read/evaluation support, not fleet
    scheduler authority
  - next implementation should add a read-only runner topology/readiness seam
    owned by `ExecutionServiceHost`
  - `/status` may project bounded local-server topology/readiness state, but
    `api serve` should still execute only through its configured local runner
  - keep reassignment loops, worker pools, and parallel execution deferred
- Scope:
  - roadmap/plan reassessment only
  - no runtime or operator behavior changes
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 32 | 2026-04-21

- Closed service/runner plan:
  `docs/dev/plans/0027-2026-04-21-runner-topology-readiness-status.md`
- Goal: implement the read-only runner topology/readiness checkpoint selected
  by Plan 0026.
- Change:
  - added `ExecutionServiceHost.summarizeRunnerTopology()`
  - added `/status.runnerTopology`
  - topology readback reports the local execution owner, runner freshness,
    runner capability summaries, and aggregate active/stale/fresh/expired
    counts
  - topology readback is read-only and does not select claims, acquire leases,
    execute steps, or reassign work to another runner
- Verification target:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 33 | 2026-04-21

- Closed service/runner preflight plan:
  `docs/dev/plans/0028-2026-04-21-scheduler-authority-preflight.md`
- Goal: define scheduler authority before adding any background worker loop,
  reassignment mutation, or multi-runner execution behavior.
- Decision:
  - topology visibility is not assignment authority
  - claim-candidate ordering is not assignment authority
  - `api serve` remains a local runner, not a fleet scheduler
  - fresh active leases owned by active fresh runners block reassignment
  - expired stale/missing lease owners may be classified as potentially
    reassignable only by an explicit future scheduler-authority decision
  - browser-backed assignment must respect browser-service dispatcher
    exclusivity
  - parallelism still requires explicit orchestration semantics and remains
    out of scope
- Next implementation target:
  - read-only scheduler-authority evaluator
  - no persistence, scheduler mutation, worker loop, or automatic reassignment
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 34 | 2026-04-21

- Closed service/runner plan:
  `docs/dev/plans/0029-2026-04-21-read-only-scheduler-authority-evaluator.md`
- Goal: implement the read-only scheduler-authority evaluator selected by
  Plan 0028 without adding assignment mutation, reassignment, a worker loop, or
  a public HTTP surface.
- Change:
  - added `src/runtime/schedulerAuthority.ts`
  - added `evaluateStoredExecutionRunSchedulerAuthority(...)`
  - evaluator consumes queue projection, active lease state, persisted runner
    records, deterministic claim candidates, configured affinity, and optional
    local runner identity
  - evaluator returns one deterministic decision, reason, candidate evidence,
    selected runner evidence, active lease posture, future mutation label, and
    `mutationAllowed: false`
- Verification target:
  - `pnpm vitest run tests/runtime.schedulerAuthority.test.ts tests/runtime.claims.test.ts tests/runtime.inspection.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm exec biome lint src/runtime/schedulerAuthority.ts tests/runtime.schedulerAuthority.test.ts --max-diagnostics 80`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 35 | 2026-04-21

- Closed service/runner plan:
  `docs/dev/plans/0030-2026-04-21-runtime-inspection-scheduler-authority.md`
- Goal: expose the Plan 0029 scheduler-authority evaluator through existing
  runtime inspection without adding scheduler mutation, worker loops,
  reassignment, lease acquisition, or a new route.
- Change:
  - added `authority=scheduler` to `GET /v1/runtime-runs/inspect`
  - added optional `inspection.schedulerAuthority`
  - runtime inspection passes the queried `runnerId` as local scheduler
    context when provided, otherwise the server-local runner id when available
  - user-facing endpoint/testing docs now describe the opt-in and read-only
    posture
- Verification target:
  - `pnpm vitest run tests/runtime.schedulerAuthority.test.ts tests/runtime.inspection.test.ts tests/http.responsesServer.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 36 | 2026-04-21

- Closed service/runner plan:
  `docs/dev/plans/0031-2026-04-21-cli-runtime-inspection-scheduler-authority.md`
- Goal: expose existing read-only scheduler-authority evidence through the
  operator CLI before designing any mutation.
- Change:
  - added `--authority scheduler` to `auracall api inspect-run`
  - passed `includeSchedulerAuthority` into runtime inspection
  - formatter now renders a compact `Scheduler authority` section with
    decision, reason, mutation posture, selected/local runner, future mutation,
    candidate count, and active lease posture
  - JSON output remains the full underlying payload
- Verification target:
  - `pnpm vitest run tests/cli/runtimeInspectionCommand.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm exec biome lint src/cli/runtimeInspectionCommand.ts tests/cli/runtimeInspectionCommand.test.ts bin/auracall.ts --max-diagnostics 40`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 37 | 2026-04-21

- Closed service/runner design plan:
  `docs/dev/plans/0032-2026-04-21-scheduler-mutation-design.md`
- Goal: define the first scheduler-mutation shape before adding assignment or
  reassignment behavior.
- Decision:
  - first mutation target is explicit single-run operator control:
    `schedulerControl.action = "claim-local-run"`
  - implementation should live under `ExecutionServiceHost`; HTTP should only
    map `POST /status` payload/result
  - mutation must be gated by the read-only scheduler-authority evaluator
  - v1 may claim or reassign only to the server-local runner
  - fresh active leases, still-active expired owners, non-local selected
    runners, capability mismatches, and not-ready/human-blocked runs must
    reject
  - browser-backed claims still execute through the normal stored-step
    executor and browser-service dispatcher path
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 38 | 2026-04-21

- Closed implementation plan:
  `docs/dev/plans/0033-2026-04-21-scheduler-local-claim-control.md`
- Goal: implement the first bounded scheduler mutation without adding fleet
  scheduling.
- Changes:
  - `ExecutionServiceHost` now supports
    `schedulerControl.action = "claim-local-run"`
  - existing `POST /status` maps `schedulerControl` payloads/results
  - local claim acquires a lease only when scheduler authority selects the
    server-local runner
  - expired stale/missing-owner leases may be reassigned only to the
    server-local runner
  - successful mutation emits a bounded scheduler-control runtime event
  - revision-check conflicts return `status = "conflict"` without mutation
- Validation so far:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts --testNamePattern "scheduler"`
  - `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "scheduler-authorized local run through POST /status|scheduler authority"`
- Closeout target:
  - focused scheduler/runtime/http suites without filters
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 33`
  - `git diff --check`

## Turn 39 | 2026-04-21

- Goal: broaden closeout validation after Plan 0033.
- Findings:
  - scheduler/runtime/http focused suites were already green
  - full `pnpm test` initially exposed deterministic non-scheduler failures in
    stale browser Pro alias expectations, dry-run cookie-copy copy, Windows
    Chrome lifecycle ownership test isolation, mocked llmService file-cache
    write-spacing, and cache-only Gemini CLI target resolution
- Fixes:
  - aligned the stale browser Pro alias test with the current stable ChatGPT
    Pro browser label
  - aligned dry-run cookie-copy expectation with current source-profile copy
    wording
  - isolated the Windows Chrome ownership test from real managed profile state
  - disabled live provider guard delays in mocked file-cache unit tests
  - kept cache-only CLI context/export paths from resolving live browser
    targets
- Validation:
  - `pnpm test`
  - `pnpm run check`
- Remaining closeout:
  - `pnpm run plans:audit -- --keep 33`
  - `git diff --check`

## Turn 40 | 2026-04-21

- Closed checkpoint:
  `docs/dev/plans/0034-2026-04-21-scheduler-roadmap-checkpoint.md`
- Goal: decide the next scheduler slice after `claim-local-run`.
- Decision:
  - keep `claim-local-run` as explicit single-run operator control
  - do not add fleet scheduling, background worker loops, non-local assignment,
    or release-and-reclaim follow-through
  - next implementation should let targeted drain execute a run whose active
    lease is already owned by the same server-local runner
  - preserve the existing `ExecutionServiceHost -> stored-step executor ->
    browser-service dispatcher` ownership path
- Verification target:
  - `pnpm run plans:audit -- --keep 34`
  - `git diff --check`

## Turn 41 | 2026-04-21

- Closed implementation plan:
  `docs/dev/plans/0035-2026-04-21-local-owned-active-lease-drain.md`
- Goal: add the explicit execution follow-through for a scheduler-claimed local
  run without adding a scheduler loop.
- Change:
  - `executeStoredExecutionRunOnce(...)` can now reuse an existing active lease
    when the lease is still present and owned by the requested execution owner
  - existing-lease execution heartbeats that lease before step execution and
    releases the same lease on completion/failure/cancellation
  - `ExecutionServiceHost` targeted drain now executes runnable work when the
    active lease owner is the configured server-local runner
  - foreign active leases still skip
- Verification so far:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts --testNamePattern "scheduler-claimed|foreign active lease|scheduler" --maxWorkers 1`
  - `pnpm vitest run tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/runtime.runner.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/browser-service/portSelection.test.ts --maxWorkers 1`
  - `pnpm test`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 35`
  - `git diff --check`

## Turn 42 | 2026-04-21

- Closed checkpoint:
  `docs/dev/plans/0036-2026-04-21-scheduler-phase-closeout.md`
- Goal: decide whether to add a compound claim-and-drain scheduler control
  after Plan 0035 made targeted drain consume local-owned active leases.
- Decision:
  - do not add `claim-and-drain-local-run` now
  - keep the explicit operator flow:
    inspect scheduler authority, `claim-local-run`, then targeted `drain-run`
    when immediate execution is desired
  - treat the scheduler local-control phase as closed unless a concrete
    operator workflow shows the two-step control is too noisy or error-prone
  - keep fleet scheduling, background worker loops, non-local assignment,
    parallel execution, and browser dispatcher bypass deferred
- Verification target:
  - `pnpm run plans:audit -- --keep 36`
  - `git diff --check`

## Turn 43 | 2026-04-21

- Closed implementation plan:
  `docs/dev/plans/0037-2026-04-21-team-run-background-drain-parity.md`
- Goal: return to the non-scheduler service/runner lane and remove the
  remaining synchronous team-run execution coupling from HTTP background-drain
  mode.
- Change:
  - `TeamRuntimeBridge` now supports `drainAfterCreate = false`
  - default bridge behavior remains synchronous for CLI/MCP and existing tests
  - `api serve` constructs the team runtime without draining when background
    drain is enabled
  - HTTP `POST /v1/team-runs` then schedules the existing server-owned
    background drain, matching direct `/v1/responses`
  - background-drain disabled mode keeps the existing synchronous one-request
    behavior
- Verification so far:
  - `pnpm vitest run tests/teams.runtimeBridge.test.ts --testNamePattern "without draining" --maxWorkers 1`
  - `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "team-run create before execution|bounded team run over HTTP" --maxWorkers 1`
  - `pnpm run check`
- Closeout target:
  - broader HTTP/team-runtime tests
  - `pnpm run plans:audit -- --keep 37`
  - `git diff --check`

## Turn 44 | 2026-04-21

- Closed roadmap checkpoint:
  `docs/dev/plans/0038-2026-04-21-service-runner-roadmap-checkpoint.md`
- Goal: decide whether to open another service/runner implementation slice
  after scheduler local-control closeout and HTTP team-run background-drain
  parity.
- Decision:
  - do not open another service/runner architecture implementation slice now
  - no fresh route-neutral runtime mutation was found still owned directly by
    HTTP
  - keep HTTP responsible for listener lifecycle, request parsing,
    background-drain timer state, pause/resume control mapping, and response
    projection
  - keep route-neutral runner lifecycle, queued drain, recovery, operator
    controls, scheduler-local claim, and targeted drain under
    `ExecutionServiceHost`
  - pause multi-runner execution, background worker pools, non-local
    assignment, parallel team execution, and compound scheduler controls
- Verification target:
  - `pnpm run plans:audit -- --keep 38`
  - `git diff --check`
- Next action: integration hygiene over the accumulated dirty worktree before
  selecting the next implementation lane.

## Turn 45 | 2026-04-21

- Goal: run the integration-hygiene pass selected by Plan 0038.
- Worktree inventory:
  - current branch is `main`
  - dirty state spans policy/closeout docs, browser-service dispatcher and
    selector diagnosis, MCP/team-run writes, public `TaskRunSpec`
    compatibility, scheduler/service-host ownership, HTTP team-run
    background-drain parity, and roadmap/runbook hygiene
  - review should not treat the entire dirty worktree as one logical change
- Validation:
  - `pnpm run check`
  - `pnpm test`
  - `pnpm run test:mcp`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 38`
  - `git diff --check`
- Recommended review/commit sequence:
  - closeout policy/docs contract
  - browser-service operation dispatcher and selector diagnosis
  - MCP/team-run write parity and public `TaskRunSpec` acceptance
  - runner topology, scheduler authority, local claim, and local-owned drain
  - HTTP team-run background-drain parity
  - roadmap/runbook/journal/fixes-log reconciliation

## Turn 46 | 2026-04-21

- Closed implementation plan:
  `docs/dev/plans/0039-2026-04-21-raw-devtools-dispatcher-fencing.md`
- Goal: remove the normal raw DevTools port bypass from browser-service dev
  tooling.
- Change:
  - operation dispatcher keys now support raw DevTools endpoints such as
    `devtools:127.0.0.1:45013`
  - browser operation records preserve optional `rawDevTools` endpoint metadata
  - `browser-tools --port <port>` now acquires a port-scoped dispatcher lock
    before resolving or connecting to the endpoint
  - AuraCall-managed browser-tools commands still prefer the managed browser
    profile dispatcher key when profile/target context is available
- Remaining follow-up:
  - legacy direct-CDP verification scripts under `scripts/` remain
    unsafe/debug-only until routed through browser-service tooling or fenced
    behind an explicit guard
- Verification target:
  - `pnpm vitest run tests/browser-service/operationDispatcher.test.ts tests/browser/browserTools.test.ts`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 39`
  - `git diff --check`

## Turn 47 | 2026-04-22

- Closed implementation plan:
  `docs/dev/plans/0040-2026-04-22-direct-cdp-script-guard.md`
- Goal: fence legacy direct-CDP development scripts while preserving explicit
  escape hatches for debugging.
- Change:
  - added `scripts/raw-devtools-guard.ts`
  - guarded all TypeScript scripts that directly import
    `chrome-remote-interface` or call `puppeteer.connect(...)`
  - scripts now require either `--allow-raw-cdp` or
    `AURACALL_ALLOW_RAW_CDP=1` before making raw CDP connections
  - the flag is consumed before positional argument parsing so existing script
    arguments remain stable
- Verification target:
  - `pnpm vitest run tests/scripts/rawDevtoolsGuard.test.ts`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 40`
  - `git diff --check`

## Turn 48 | 2026-04-22

- Closed implementation plan:
  `docs/dev/plans/0041-2026-04-22-browser-service-script-family.md`
- Goal: group browser-service-related scripts without breaking historical root
  script paths.
- Change:
  - added `scripts/browser-service/` wrapper copies for generic browser tools,
    launch/test helpers, and Grok/browser verification helpers
  - retained all existing `scripts/<name>.ts` entrypoints for compatibility
  - documented that provider-dependent Grok helpers stay outside
    `packages/browser-service` because they import AuraCall app/provider code
  - added wrapper-shape tests to keep the copied family as thin routing, not
    duplicated implementation
- Verification target:
  - `pnpm vitest run tests/scripts/browserServiceWrappers.test.ts tests/scripts/rawDevtoolsGuard.test.ts`
  - `pnpm run check`
  - wrapper raw-CDP refusal smoke:
    `pnpm tsx scripts/browser-service/test-remote-chrome.ts 127.0.0.1 1`
  - `pnpm run plans:audit -- --keep 41`
  - `git diff --check`

## Turn 49 | 2026-04-22

- Closed reconciliation plan:
  `docs/dev/plans/0042-2026-04-22-open-execution-plan-reconciliation.md`
- Goal: align the open execution authorities after scheduler local-control,
  service/runner ownership, and browser-service maintenance checkpoints all
  closed.
- Change:
  - updated `0004` so it no longer names scheduler-control implementation as
    the next action after Plans 0033-0036 already shipped that phase
  - updated `0001` and ROADMAP to keep service/runner architecture expansion
    paused unless a reproduced ownership/readback mismatch or new product
    requirement justifies reopening it
  - recorded the browser-service maintenance exception as closed through
    Plans 0039-0041
- Verification target:
  - `pnpm run plans:audit -- --keep 42`
  - `git diff --check`

## Turn 50 | 2026-04-22

- Closed integration fix:
  `docs/dev/plans/0043-2026-04-22-browser-service-wrapper-build-compatibility.md`
- Goal: finish the integration/review pass selected by Plan 0042.
- Finding:
  - `pnpm run check` passed, but `pnpm run test:mcp` failed in its build step
    because wrapper scripts imported root scripts with explicit `.ts`
    extensions
  - base `tsconfig.json` permits those imports for no-emit typecheck, while
    `tsconfig.build.json` does not permit them for emitted builds
- Change:
  - changed `scripts/browser-service/*.ts` wrappers to extensionless dynamic
    imports
  - updated wrapper-shape tests to require extensionless imports
- Verification target:
  - `pnpm vitest run tests/scripts/browserServiceWrappers.test.ts tests/scripts/rawDevtoolsGuard.test.ts`
  - `pnpm tsx scripts/browser-service/test-remote-chrome.ts 127.0.0.1 1`
  - `pnpm tsx scripts/browser-service/browser-tools.ts --help`
  - `pnpm run check`
  - `pnpm test`
  - `pnpm run test:mcp`
  - `pnpm run plans:audit -- --keep 43`
  - `git diff --check`

## Turn 51 | 2026-04-22

- Policy update:
  `docs/dev/policies/0013-commit-and-push-cadence.md`
- Goal: make commit/push cadence operational after the local stack grew large.
- Change:
  - commit validated slices by default, including docs-only policy/roadmap
    slices
  - push after green integration checkpoints, before changing lanes, before
    handoff, and before ending a session with more than a small local-only stack
  - treat local `main` being more than 10 commits ahead or carrying unpushed
    validated work from a prior day as a handoff risk
  - default posture: end-of-slice commit, end-of-turn push for shared-ready
    commits, and exact blocker notes when push cannot happen
- Verification target:
  - `pnpm run plans:audit -- --keep 43`
  - `git diff --check`

## Turn 52 | 2026-04-22

- Closed implementation plan:
  `docs/dev/plans/0044-2026-04-22-team-run-cli-resolver-shadow-fix.md`
- Goal: fix repo-dogfood regression where `auracall teams run` returned a
  planned runtime run without draining the browser-backed Grok step.
- Finding:
  - Commander supplied default `browserModelStrategy = select`
  - transitional CLI service-alias mirroring created a partial target
    `runtimeProfiles.default`
  - target `runtimeProfiles` shadowed bridge `profiles`, so local-runner
    capability projection did not see `auracall-grok-auto`
- Change:
  - transitional CLI service aliases now write into `runtimeProfiles` only for
    target-shaped configs and into `profiles` for bridge-shaped configs
  - added resolver coverage for bridge-shaped configs with Commander-style
    browser defaults
- Verification target:
  - `pnpm vitest run tests/schema/resolver.test.ts tests/cli/teamRunCommand.test.ts`
  - narrow Grok CLI dogfood run
  - `pnpm run test:live:team:baseline`
  - `pnpm run check`
  - `pnpm test`
  - `pnpm run test:mcp`
  - `pnpm run plans:audit -- --keep 44`
  - `git diff --check`

## Turn 53 | 2026-04-22

- Closed implementation plan:
  `docs/dev/plans/0045-2026-04-22-repo-dogfood-user-runtime-install.md`
- Goal: do one more bounded repo dogfood pass, then add a user-scoped runtime
  install path independent of the checkout.
- Dogfood result:
  - config/profile/session operator reads passed
  - Grok and ChatGPT browser doctors passed with signed-in identities and
    selector checks
  - Gemini local doctor passed with signed-in managed-profile state and no
    active Gemini DevTools session
  - local API server status exposed the active local runner and background
    drain
  - HTTP team-run create/readback completed with
    `AURACALL_HTTP_DOGFOOD_OK`
- Change:
  - added `pnpm run install:user-runtime`
  - added `scripts/install-user-runtime.ts`
  - added `docs/user-scoped-runtime.md`
  - linked the repo dogfood install command from `README.md`
- Verification target:
  - repo dogfood commands listed in Plan 0045
  - dry-run installer smoke
  - real user-scoped install smoke
  - installed `~/.local/bin/auracall --version`
  - installed `~/.local/bin/auracall config show --team auracall-solo --json`
  - `pnpm run check`
  - `pnpm test`
  - `pnpm run test:mcp`
  - `pnpm run plans:audit -- --keep 45`
  - `git diff --check`

## Turn 54 | 2026-04-22

- Closed dogfood plan:
  `docs/dev/plans/0046-2026-04-22-installed-runtime-dogfood.md`
- Goal: prove the user-scoped installed runtime works from a neutral working
  directory and is suitable for daily operator use.
- Result:
  - installed config/profile/status reads passed from
    `/tmp/auracall-installed-dogfood`
  - installed Grok doctor passed on the default managed browser profile
  - installed ChatGPT `wsl-chrome-2` doctor attached to the active managed
    browser profile
  - installed ChatGPT team run returned `AURACALL_INSTALLED_CHATGPT_OK`
  - installed Gemini doctor stayed passive and confirmed signed-in managed
    profile state
  - installed `api serve --port 8099` returned `/status.ok = true` and stopped
    cleanly
- Follow-up:
  - `/status` is useful but too noisy after accumulated stale runner records;
    keep that as a bounded operator-readability improvement, not a blocker for
    installed-runtime dogfooding.
- Verification target:
  - installed runtime commands listed in Plan 0046
  - `pnpm run plans:audit -- --keep 46`
  - `git diff --check`

## Turn 55 | 2026-04-22

- Closed implementation plan:
  `docs/dev/plans/0047-2026-04-22-status-runner-topology-compaction.md`
- Goal: keep installed-runtime `/status` readable after long-lived dogfood
  environments accumulate stale runner records.
- Change:
  - plain `/status` now lists only the local execution owner plus fresh/active
    runners under `runnerTopology.runners`
  - `runnerTopology.metrics` still counts all stored runners and now reports
    displayed/omitted runner counts
  - `GET /status?runnerTopology=full` preserves the full stored runner list for
    forensic debugging
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/runtime.serviceHost.test.ts`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 47`
  - `git diff --check`
  - installed runtime `/status` and `/status?runnerTopology=full` smoke on
    port 8099

## Turn 56 | 2026-04-22

- Closed drift checkpoint:
  `docs/dev/plans/0048-2026-04-22-grok-model-drift-checkpoint.md`
- Opened implementation plan:
  `docs/dev/plans/0049-2026-04-22-media-generation-surfaces.md`
- Trigger:
  - installed-runtime parallel Gemini/Grok API image dogfood did not produce
    images
  - Gemini returned a text-only refusal through the current API path
  - Grok used stale 4.1 canonicalization instead of current Grok 4.20
- Change:
  - added current `grok-4.20` known model key mapped to
    `grok-4.20-reasoning`
  - kept explicit `grok-4.1` as a legacy key
  - changed plain Grok aliases and setup/wizard defaults to current Grok
  - documented that Grok Imagine and full CLI/API/MCP media generation still
    need the shared media-generation contract in Plan 0049
- Verification target:
  - targeted Grok/options/browser setup/OpenRouter/multimodel tests
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 49`
  - `git diff --check`

## Turn 57 | 2026-04-23

- Opened planning slice:
  `docs/dev/plans/0050-2026-04-23-workbench-capability-surfaces.md`
- Trigger:
  - Gemini and ChatGPT expose fast-changing chat-workbench capabilities that
    do not fit the narrow media-generation contract.
  - Gemini and ChatGPT both expose Deep Research-style tools.
  - ChatGPT exposes apps/connectors broadly and skills on business-plan
    accounts.
  - Gemini exposes media tools such as image/music/video through the tool
    drawer.
- Decision:
  - keep `media_generation` as the simple first-class resource for common
    image/music/video requests
  - add a separate provider-neutral workbench capability model for discovery,
    availability, account gating, and eventual invocation
  - do discovery/readback before broad invocation, because provider toolsets
    are account-tier, region, UI, and rollout dependent
- Verification target:
  - `pnpm run plans:audit -- --keep 50`
  - `git diff --check`

## Turn 58 | 2026-04-23

- Continued implementation plan:
  `docs/dev/plans/0050-2026-04-23-workbench-capability-surfaces.md`
- Goal: make service discovery/reporting a regular API/MCP workflow for
  volatile provider workbench tools.
- Change:
  - added shared workbench capability types/schema/catalog/service
  - added local API route `GET /v1/workbench-capabilities`
  - added MCP tool `workbench_capabilities`
  - static catalog includes Gemini media/research and ChatGPT search/canvas,
    Deep Research, apps, and skills with conservative availability
  - live browser/provider discovery remains a later slice
- Verification target:
  - `pnpm vitest run tests/workbenchCapabilities.test.ts tests/http.workbenchCapabilities.test.ts tests/mcp.workbenchCapabilities.test.ts tests/mcp.schema.test.ts`
  - `pnpm run check`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 50`
  - `git diff --check`

## Turn 59 | 2026-04-23

- Continued implementation plan:
  `docs/dev/plans/0050-2026-04-23-workbench-capability-surfaces.md`
- Goal: add live read-only Gemini capability reporting without introducing a
  second Gemini DOM scraper.
- Change:
  - added Gemini feature-signature to workbench-capability mapping
  - added static Gemini Canvas capability
  - wired configured `api serve` discovery so
    `GET /v1/workbench-capabilities?provider=gemini` can merge live managed
    browser evidence
  - kept unfiltered reports static/cheap to avoid launching every provider
- Verification target:
  - `pnpm vitest run tests/workbenchCapabilities.test.ts tests/http.workbenchCapabilities.test.ts tests/mcp.workbenchCapabilities.test.ts tests/mcp.schema.test.ts tests/browser/geminiAdapter.test.ts`
  - `pnpm run check`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 50`
  - `git diff --check`

## Turn 60 | 2026-04-23

- Opened and closed maintenance plan:
  `docs/dev/plans/0051-2026-04-23-runtime-browser-diagnostics.md`
- Trigger:
  - live provider status debugging needs the selected target, DOM state, and
    screenshot while a chat is executing, without raw CDP escape hatches or
    page churn
- Change:
  - added opt-in runtime browser diagnostics to HTTP, CLI, and MCP runtime
    inspection
  - diagnostics are active-run only and report target URL/title/id, document
    readiness, visible control counts, provider evidence, and stored PNG path
- Verification target:
  - `pnpm vitest run tests/runtime.inspection.test.ts tests/http.responsesServer.test.ts tests/cli/runtimeInspectionCommand.test.ts tests/mcp.runtimeInspect.test.ts`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 51`
  - `git diff --check`

## Turn 61 | 2026-04-23

- Opened and closed maintenance plan:
  `docs/dev/plans/0052-2026-04-23-status-browser-diagnostics-parity.md`
- Trigger:
  - dogfood showed direct Gemini response runs can complete through the
    cookie/web-client path before runtime diagnostics can observe a managed
    browser workbench
  - Gemini browser media generation is the long-lived tab path with recorded
    `tabTargetId`, so diagnostics belong on status polling too
- Change:
  - added `diagnostics=browser-state` to generic run status and
    media-generation status
  - added matching MCP input support for `run_status` and
    `media_generation_status`
  - media diagnostics prefer the provider `tabTargetId` from metadata or
    prompt-submission timeline details
- Verification target:
  - `pnpm vitest run tests/mediaBrowserDiagnostics.test.ts tests/http.mediaGeneration.test.ts tests/mcp.mediaGeneration.test.ts tests/mcp.runStatus.test.ts tests/mcp.schema.test.ts`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 52`
  - guarded live Gemini browser media diagnostics smoke:
    - `medgen_4bf95e87bb594929aa51578ca7a2564a` proved
      `status?diagnostics=browser-state` can reach the Gemini browser family
    - the first snapshot occurred before prompt submission and the media job
      later failed with `media_generation_failed`, so the implementation now
      requires a recorded `tabTargetId` before reporting observed media
      browser diagnostics
  - `git diff --check`

## Turn 62 | 2026-04-23

- Closed implementation plan:
  `docs/dev/plans/0053-2026-04-23-browser-control-plane-completion.md`
- Goal: finish the browser mutation control-plane boundary after Gemini media
  dogfood showed root-route fallback needed attribution.
- Change:
  - browser-service mutation helpers now provide the product-code control
    points for navigation, reload, target open/reuse, and location fallback
  - provider and legacy product paths route through those helpers or carry
    mutation audit context
  - browser diagnostics can report recent mutation history
  - static enforcement rejects direct product browser mutations outside
    approved browser-service control points
  - raw mutating CDP scripts remain available only through the explicit
    `--allow-raw-cdp` / `AURACALL_ALLOW_RAW_CDP=1` guard and
    `RAW_DEVTOOLS_MUTATING_SCRIPT_ALLOWLIST`
- Verification target:
  - `pnpm vitest run tests/browser/browserMutationControlPlane.test.ts tests/scripts/rawDevtoolsGuard.test.ts tests/scripts/browserServiceWrappers.test.ts`
  - broader targeted browser-control tests
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 53`
  - `git diff --check`

## Turn 63 | 2026-04-24

- Continued implementation plan:
  `docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md`
- Goal: give operators direct browser evidence for Grok Imagine gating during
  workbench capability discovery, without raw CDP access or prompt submission.
- Change:
  - added `diagnostics=browser-state` / `--diagnostics browser-state` to
    workbench capability reports
  - wired the diagnostics option through CLI, local API, MCP, and the shared
    workbench capability service
  - reused browser-service diagnostics storage and screenshot capture
  - added Grok Imagine provider evidence to browser diagnostics using the
    read-only Grok feature probe
- Verification target:
  - `pnpm vitest run tests/workbenchCapabilities.test.ts tests/http.workbenchCapabilities.test.ts tests/mcp.workbenchCapabilities.test.ts tests/cli/workbenchCapabilitiesCommand.test.ts tests/browser/grokAdapter.test.ts`
  - live read-only dogfood:
    - `pnpm tsx bin/auracall.ts capabilities --target grok --diagnostics browser-state --json`
    - selected the current managed Grok project-chat tab, captured target
      URL/title plus a stored PNG screenshot, and kept Imagine capabilities
      conservative `unknown`
  - `pnpm run check`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 54`
  - `git diff --check`

## Turn 64 | 2026-04-24

- Continued implementation plan:
  `docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md`
- Goal: add a read-only Grok Imagine entrypoint inspection path before any
  invocation work.
- Change:
  - added `entrypoint=grok-imagine` / `--entrypoint grok-imagine` to workbench
    capability requests
  - routed explicit Grok Imagine discovery through `https://grok.com/imagine`
    using existing browser-service target open/reuse control-plane attribution
  - preserved the explicit entrypoint tab long enough for browser diagnostics
  - split generic document diagnostics from provider-specific evidence so a
    provider probe failure cannot erase target/document state
  - fixed the Grok feature probe syntax regression and added a parse guard test
- Verification target:
  - `pnpm vitest run tests/workbenchCapabilities.test.ts tests/http.workbenchCapabilities.test.ts tests/mcp.workbenchCapabilities.test.ts tests/cli/workbenchCapabilitiesCommand.test.ts tests/browser/grokAdapter.test.ts tests/mcp.schema.test.ts`
  - live read-only dogfood:
    - `pnpm tsx bin/auracall.ts capabilities --target grok --entrypoint grok-imagine --diagnostics browser-state --json`
    - observed `https://grok.com/imagine`, `Imagine - Grok`, image/video
      mode evidence, account-gated image/video capability reports, and a
      stored PNG screenshot
  - `pnpm run check`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 54`
  - `git diff --check`

## Turn 65 | 2026-04-24

- Continued implementation plan:
  `docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md`
- Goal: add provider-owned read-only Grok Imagine run-state/readback evidence
  before any prompt-submission work.
- Change:
  - extended the Grok feature probe with conservative `run_state` classification
  - captured visible pending indicators, terminal image/video DOM media,
    media URLs, and download/save/open/share/copy controls
  - preserved normalized evidence in Grok workbench capability metadata for
    CLI/API/MCP consumers
  - kept discovery read-only with no prompt submission or generation-control
    clicks
- Verification target:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/workbenchCapabilities.test.ts --maxWorkers 1`
  - live read-only dogfood:
    - `pnpm tsx bin/auracall.ts capabilities --target grok --entrypoint grok-imagine --diagnostics browser-state --json`
    - observed `run_state = account_gated`, `pending = false`,
      `terminal_image = false`, and `terminal_video = false`; public gallery
      media stayed page evidence instead of terminal generated output
  - `pnpm run check`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 54`
  - `git diff --check`

## Turn 66 | 2026-04-24

- Continued implementation plan:
  `docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md`
- Goal: wire the first guarded Grok browser image invocation path without
  allowing account-gated prompt submission.
- Change:
  - added Grok browser media executor support for image generation behind
    `grok.media.imagine_image`
  - media service now preflights Grok browser image requests through the
    explicit `/imagine` entrypoint with browser-state diagnostics
  - account-gated/unavailable Grok Imagine stops with
    `media_capability_unavailable` before the executor is invoked
  - available-account path pins the `/imagine` tab, emits prompt/run-state
    timeline events, polls provider run state, and materializes terminal remote
    image media
  - Grok video remains gated as not implemented
- Verification target:
  - `pnpm vitest run tests/mediaGeneration.test.ts tests/mediaGenerationGrokBrowserExecutor.test.ts tests/mediaGenerationGeminiBrowserExecutor.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/mediaGeneration.test.ts tests/mediaGenerationGrokBrowserExecutor.test.ts tests/mediaGenerationGeminiBrowserExecutor.test.ts tests/http.mediaGeneration.test.ts tests/mcp.mediaGeneration.test.ts tests/mcp.schema.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/browser/browserMutationControlPlane.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - local API gated live request:
    - `pnpm tsx bin/auracall.ts api serve --port 18081`
    - `curl -s http://127.0.0.1:18081/v1/media-generations -H 'Content-Type: application/json' -d '{"provider":"grok","mediaType":"image","transport":"browser","prompt":"Generate an image of an asphalt secret agent"}'`
    - returned `medgen_8744a7d69a314433bc7d7e67615391e9` with
      `media_capability_unavailable`, `availability = account_gated`, and no
      `prompt_submitted` timeline event
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 54`
  - `git diff --check`

## Turn 67 | 2026-04-25

- Continued implementation plan:
  `docs/dev/plans/0059-2026-04-25-browser-operation-queue-observability.md`
- Goal: make browser-operation queue/readiness visible through the same
  browser-state diagnostics operators already use for runtime/run status.
- Change:
  - added a bounded browser-operation queue observation log for response
    browser execution
  - recorded `queued`, `acquired`, and `busy-timeout` observations from the
    queued acquisition path
  - projected recent queue observations into browser-state diagnostics next to
    browser mutation history
  - rendered queue event count and latest queue event in CLI runtime
    inspection output
- Verification target:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/cli/runtimeInspectionCommand.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 59`
  - `git diff --check`

## Turn 68 | 2026-04-25

- Continued implementation plan:
  `docs/dev/plans/0060-2026-04-25-browser-operation-queue-status-proof.md`
- Goal: prove browser-operation queue diagnostics survive generic API and MCP
  run-status surfaces without live provider churn.
- Change:
  - added local API coverage for
    `/v1/runs/{run_id}/status?diagnostics=browser-state` preserving a latest
    queued browser-operation event
  - added MCP `run_status` coverage for the same diagnostics shape
  - made the MCP response-run browser diagnostics probe injectable for
    controlled tests while preserving the default live probe behavior
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/mcp.runStatus.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 60`
  - `git diff --check`

## Turn 69 | 2026-04-25

- Continued implementation plan:
  `docs/dev/plans/0061-2026-04-25-grok-imagine-materialization-hardening.md`
- Goal: close the browser-service control-plane detour and return the active
  execution board to Grok Imagine materialization hardening.
- Change:
  - opened Plan 0061 as the bounded follow-up for Grok Imagine multi-image
    visible-tile materialization, default count `8`, preview-vs-full-quality
    download comparison evidence, and installed-runtime dogfood
  - updated `ROADMAP.md` so Plan 0061 is the selected active provider slice
    after the profile, fixed-port, queued-dispatch, and status-diagnostics
    browser-service proofs
  - kept xAI API media execution and Grok edit/reference workflows deferred to
    later bounded plans
- Verification target:
  - `pnpm run plans:audit -- --keep 61`
  - `git diff --check`

## Turn 70 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: return from lint-warning cleanup to lazy live follow and tighten the
  cooperative yield contract between routine mirrors and real browser work.
- Change:
  - queue observations now include the queued request owner as well as the
    active blocker
  - response browser execution, media generation, and mirror refresh requests
    write comparable queue-observation records
  - account-mirror collectors yield when response/media browser work queues
    behind an active lazy mirror, but do not yield only because another routine
    mirror refresh is queued
- Verification target:
  - `pnpm vitest run tests/accountMirror/refreshService.test.ts tests/accountMirror/schedulerService.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/mediaBrowserExecutor.test.ts tests/browser/browserModeExports.test.ts --maxWorkers 1 --testTimeout 15000`
  - `pnpm vitest run tests/cli/runtimeInspectionCommand.test.ts tests/http.responsesServer.test.ts tests/mcp.runStatus.test.ts --maxWorkers 1 --testTimeout 15000`
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run docs:list`
  - `git diff --check`

## Turn 71 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: make lazy-live cooperative-yield evidence directly discoverable by
  operators without parsing the full `/status` payload.
- Change:
  - added `yieldCause` to yielded attachment continuation cursors
  - added compact scheduler-history projection with latest yield, queued work
    cause, resume cursor, and remaining detail surfaces
  - exposed the projection at
    `GET /v1/account-mirrors/scheduler/history`
  - projected latest yield summary through `auracall api status` helpers and
    MCP `api_status`
- Verification target:
  - `pnpm vitest run tests/accountMirror/refreshService.test.ts tests/accountMirror/schedulerService.test.ts tests/accountMirror/schedulerLedger.test.ts tests/http.responsesServer.test.ts tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts --maxWorkers 1 --testTimeout 15000`
  - `pnpm run typecheck`
  - `pnpm run lint`

## Turn 72 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: dogfood the compact lazy-yield readback through a local API runtime
  without provider/browser churn.
- Change:
  - added `scripts/smoke-account-mirror-scheduler-history.ts`
  - added `pnpm run smoke:scheduler-history`
  - documented the smoke in `docs/testing.md`, `docs/mcp.md`, and Plan 0063
- Proof:
  - `pnpm run smoke:scheduler-history`
  - output included:
    - `latestYield.owner=media-generation:chatgpt:image`
    - `latestYield.remaining=4`
    - `latestYield.nextConversationIndex=3`
- Verification target:
  - `pnpm run smoke:scheduler-history`
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run install:user-runtime`
  - installed `auracall api mirror-complete --help`
  - installed `auracall api mirror-completion-status --help`
  - `git diff --check`

## Turn 73 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: dogfood one low-churn live lazy-follow pass against the bound default
  ChatGPT profile, then verify scheduler history and operator status reflect
  the completed pass.
- Proof:
  - dry-run preflight on port `18091` showed default ChatGPT
    `eligible`, `in_progress`, and 68 remaining detail surfaces
  - execute-enabled `api serve` on port `18092` plus one `run-once` completed
    from `2026-05-01T00:34:10.644Z` to `2026-05-01T00:37:19.705Z`
  - refresh completed for `chatgpt/default`, detected identity
    `ecochran76@gmail.com`, detected account level `Business`
  - metadata counts after the pass were projects `5`, conversations `74`,
    artifacts `39`, files `24`, media `0`
  - attachment inventory advanced to `nextConversationIndex: 7`, scanned 6
    conversations, and left 67 remaining detail surfaces
  - scheduler history reported `refresh-completed`, `yielded: false`,
    `backpressureReason: none`, and `latestYield: null`
  - `auracall api status --port 18092` reported scheduler `idle`,
    posture `healthy`, and latest lazy mirror action `refresh-completed`
  - browser-operation locks were empty before and after the pass
- Verification target:
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `git diff --check`

## Turn 81 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: make live-follow health directly assertable by operators and MCP
  callers.
- Change:
  - added derived `liveFollow.severity` with values `healthy`,
    `backpressured`, `paused`, and `attention-needed`
  - `auracall api status` now includes `severity=<value>` in the
    `Live follow health:` line and supports
    `--expect-live-follow-severity`
  - MCP `api_status` exposes `liveFollow.severity` and supports
    `expectedLiveFollowSeverity`
  - the no-browser completion-control smoke now asserts `paused` severity
    after pause and `attention-needed` severity after cancel
- Verification target:
  - `pnpm run smoke:completion-control`
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`
  - installed `node ~/.auracall/user-runtime/node_modules/auracall/dist/scripts/smoke-account-mirror-completion-control.js`
  - installed `node ~/.auracall/user-runtime/node_modules/auracall/dist/scripts/smoke-account-mirror-completion-control.js`

## Turn 82 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: bring the CLI/MCP live-follow severity signal into `/ops/browser`.
- Change:
  - added dashboard-side live-follow health derivation from `/status`
  - rendered `Live Follow Severity` in the Server panel
  - included `health.severity` in the Mirror Live Follow JSON projection
  - recorded a follow-up to centralize the derivation in shared status code
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "browser operator dashboard"`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`

## Turn 83 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: centralize live-follow health derivation for CLI, MCP, HTTP, and
  dashboard surfaces.
- Change:
  - added shared live-follow health helper
  - moved CLI status health-line construction to the shared helper
  - added `/status.liveFollow` to the HTTP status payload
  - changed `/ops/browser` to consume `status.liveFollow` instead of duplicating
    severity logic in client-side JavaScript
- Verification target:
  - `pnpm run smoke:completion-control`
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts tests/http.responsesServer.test.ts --testNamePattern "api status|browser operator dashboard|completion operations|status with recovery"`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`

## Turn 84 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: add deterministic parity coverage for shared live-follow health.
- Change:
  - added `scripts/smoke-live-follow-health-parity.ts`
  - added `pnpm run smoke:live-follow-health`
  - the smoke compares HTTP `/status.liveFollow`, CLI status, MCP
    `api_status`, and `/ops/browser` from one fixture-backed local API server
  - the fixture includes both yielded scheduler history and a paused
    live-follow completion, with no provider or browser dispatcher access
- Verification target:
  - `pnpm run smoke:live-follow-health`
  - `pnpm run smoke:completion-control`
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts tests/http.responsesServer.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`

## Turn 85 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: add deterministic restart coverage for hydrated live-follow completion
  status.
- Change:
  - added `scripts/smoke-account-mirror-completion-hydration.ts`
  - added `pnpm run smoke:completion-hydration`
  - the smoke seeds a paused live-follow completion into a temp cache, starts
    the API twice over the same cache, and verifies `/status`, CLI status, and
    MCP `api_status` after restart
  - the fixture uses no provider or browser dispatcher access
- Verification target:
  - `pnpm run smoke:completion-hydration`
  - `pnpm run smoke:live-follow-health`
  - `pnpm run smoke:completion-control`
  - `pnpm vitest run tests/accountMirror/completionService.test.ts tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts tests/http.responsesServer.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`

## Turn 86 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: put live-follow completion controls on the regular status preflight
  path.
- Change:
  - added `accountMirrorCompletion` pause/resume/cancel support to
    `POST /status`
  - changed `/ops/browser` Mirror Live Follow controls to post to `/status`
  - updated `pnpm run smoke:completion-control` to prove status-path pause,
    CLI resume, MCP cancel, and status readback without provider/browser work
- Verification target:
  - `pnpm run smoke:completion-control`
  - `pnpm run smoke:completion-hydration`
  - `pnpm run smoke:live-follow-health`
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`

## Turn 87 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: add deterministic `/ops/browser` completion-control coverage.
- Change:
  - added `scripts/smoke-ops-browser-completion-control.ts`
  - added `pnpm run smoke:ops-browser-control`
  - the smoke verifies dashboard button wiring and the `POST /status`
    `accountMirrorCompletion` control path against a fixture completion service
  - the fixture uses no provider or browser dispatcher access
- Verification target:
  - `pnpm run smoke:ops-browser-control`
  - `pnpm run smoke:completion-control`
  - `pnpm run smoke:completion-hydration`
  - `pnpm run smoke:live-follow-health`
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`

## Turn 88 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: add installed-runtime `/ops/browser` dashboard/status contract
  expectation support.
- Change:
  - added `auracall api ops-browser-status`
  - the command reads `/ops/browser`, verifies Mirror Live Follow control
    wiring uses `POST /status` with `accountMirrorCompletion`, reads linked
    `/status`, and applies live-follow/completion-count expectations
  - the browser-ops deterministic smoke now exercises that helper against its
    fixture server
- Verification target:
  - `pnpm vitest run tests/cli/apiOpsBrowserCommand.test.ts tests/http.responsesServer.test.ts tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm run smoke:ops-browser-control`
  - `pnpm run smoke:completion-control`
  - `pnpm run smoke:completion-hydration`
  - `pnpm run smoke:live-follow-health`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`

## Turn 89 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: add MCP parity for `/ops/browser` dashboard/status contract
  expectation support.
- Change:
  - added MCP `api_ops_browser_status`
  - the tool shares the CLI helper path for `/ops/browser` dashboard contract
    assertions and linked `/status` live-follow/completion-count expectations
  - the browser-ops deterministic smoke now exercises API, CLI, and MCP
    dashboard/status contract paths against its fixture server
- Verification target:
  - `pnpm vitest run tests/mcp.apiOpsBrowserStatus.test.ts tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiStatus.test.ts tests/mcp.schema.test.ts`
  - `pnpm run smoke:ops-browser-control`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`

## Turn 90 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: add installed-runtime MCP protocol smoke coverage for
  `api_ops_browser_status`.
- Change:
  - added `scripts/smoke-ops-browser-mcp.ts`
  - added `pnpm run smoke:mcp-ops-browser`
  - the smoke starts an injected local API fixture, pauses live follow through
    `/status`, connects to installed `auracall-mcp`, verifies tool discovery,
    and calls `api_ops_browser_status`
  - release `operator-smoke` now runs both MCP status smokes
- Verification target:
  - `pnpm run smoke:mcp-ops-browser`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`
  - installed `node ~/.auracall/user-runtime/node_modules/auracall/dist/scripts/smoke-ops-browser-mcp.js`

## Turn 79 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Change:
  - added completion count expectation support to `auracall api status`
  - added matching MCP `api_status` inputs for active, paused, cancelled, and
    failed completion counts
  - extended the no-browser completion-control smoke to assert paused and
    cancelled counts through the compact status path
- Verification target:
  - `pnpm run smoke:completion-control`
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`

## Turn 80 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Change:
  - added a structured `liveFollow` summary to API status CLI/MCP projections
  - `auracall api status` now prints one `Live follow health:` line combining
    scheduler posture, state, completion counts, backpressure, and latest yield
    evidence
  - MCP `api_status` includes the same live-follow health line in text output
    and structured content
- Verification target:
  - `pnpm run smoke:completion-control`
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`

## Turn 78 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Change:
  - added compact completion-control posture to `auracall api status`
  - MCP `api_status` now returns the same completion metrics, active
    operations, and recent controlled operations
  - the no-browser completion-control smoke checks the compact status
    projection in addition to HTTP/CLI/MCP controls
- Verification target:
  - `pnpm run smoke:completion-control`
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `git diff --check`

## Turn 74 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: expose full compact lazy mirror scheduler history through regular
  operator surfaces, not only raw HTTP or the latest `api status` summary.
- Change:
  - added shared `readApiSchedulerHistoryForCli`
  - added `auracall api scheduler-history --port <port> [--limit <count>]`
  - added MCP `account_mirror_scheduler_history`
  - extended `pnpm run smoke:scheduler-history` to verify the new CLI helper
    and MCP tool alongside the existing HTTP route and `api_status` summary
- Verification target:
  - `pnpm vitest run tests/cli/apiSchedulerHistoryCommand.test.ts tests/mcp.accountMirrorSchedulerHistory.test.ts --maxWorkers 1 --testTimeout 15000`
  - `pnpm run smoke:scheduler-history`
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `git diff --check`

## Turn 75 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: dogfood the new scheduler-history operator surfaces from the
  user-scoped installed runtime.
- Proof:
  - `pnpm run install:user-runtime` refreshed `~/.auracall/user-runtime` and
    wrappers under `~/.local/bin`
  - installed `~/.local/bin/auracall --version` reported `0.1.1`
  - installed `auracall api scheduler-history --help` exposed the new command
  - installed `api serve` on port `18093` loaded the persisted scheduler
    history with scheduler posture `scheduled`
  - installed `auracall api scheduler-history --port 18093 --limit 5` returned
    five entries, `latestYield: null`, and top entry
    `refresh-completed chatgpt/default backpressure=none yielded=false`
  - installed MCP `account_mirror_scheduler_history` returned the same top
    entry and remaining detail surfaces `67`
  - no browser-operation locks were present after shutdown
- Change:
  - added the scheduler-history route to the API startup endpoint banner after
    installed dogfood showed the route worked but was not listed there
- Verification target:
  - targeted CLI/MCP/API tests
  - `pnpm run smoke:scheduler-history`
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `git diff --check`

## Turn 76 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: resume the bound default ChatGPT lazy mirror from its saved attachment
  cursor until completeness reached zero remaining detail surfaces.
- Proof:
  - installed `api serve` ran on port `18094` with execute mode enabled and
    explicit refreshes used `queueTimeoutMs: 0`
  - starting state was `in_progress`, `nextConversationIndex: 13`, and 63
    remaining detail surfaces after the first explicit pass in this turn
  - cooldown-respecting explicit passes advanced the cursor through
    conversation indexes `19`, `25`, `31`, `37`, `43`, `45`, `51`, and finally
    `0`
  - final status at `2026-05-01T03:03:47.851Z` reported
    `mirrorCompleteness.state: complete`, zero remaining detail surfaces, and
    identity `ecochran76@gmail.com` on `Business`
  - final high-limit catalog metrics were projects `5`, conversations `76`,
    artifacts `374`, files `24`, media `0`
  - no browser-operation locks remained after shutdown
- Live observation:
  - the explicit-refresh cooldown and six-detail-read cap worked as intended
  - artifact-heavy conversations can exhaust the artifact row budget before
    all six detail reads complete; pass 7 scanned only two conversations but
    still added 80 artifacts
- Verification target:
  - final `GET /v1/account-mirrors/status?provider=chatgpt&runtimeProfile=default&explicitRefresh=true`
  - final `GET /v1/account-mirrors/catalog?provider=chatgpt&runtimeProfile=default&kind=all&limit=500`
  - `find ~/.auracall/browser-operations -maxdepth 1 -type f -name '*.json'`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `git diff --check`

## Turn 77 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: correct the default ChatGPT mirror assumptions after live dogfood
  showed the account has more than the bounded visible rail snapshot.
- Change:
  - ChatGPT `listConversations(..., { includeHistory, historyLimit })` now
    passes options into the provider scraper instead of ignoring them
  - the provider politely scrolls the ChatGPT left rail until the requested
    history limit is reached or the rail stops loading older rows
  - added nonblocking account-mirror completion operations:
    `POST /v1/account-mirrors/completions`,
    `GET /v1/account-mirrors/completions`,
    `GET /v1/account-mirrors/completions/{id}`,
    `auracall api mirror-complete`, and
    `auracall api mirror-completions`,
    `auracall api mirror-completion-status`
  - added MCP `account_mirror_completion_start` and
    `account_mirror_completion_list` and
    `account_mirror_completion_status`
  - live dogfood showed the first completion expanded ChatGPT conversations
    from 76 to 291; completion now forces one verification refresh and waits
    through polite cooldown windows before continuing later passes
  - installed cooldown smoke showed a subsequent completion stayed `running`,
    reported `nextAttemptAt: 2026-05-01T03:55:21.121Z`, preserved 290
    remaining detail surfaces, and left no browser-operation lock while
    waiting
  - default completion mode is now unbounded `live_follow`; `--max-passes`
    remains available only as a debug cap
  - live-follow completion reports `phase = backfill_history|steady_follow`
    and stays running after backfill completes so steady follow can crawl for
    new content on the polite cadence
  - completion records are persisted under the account-mirror cache and
    hydrated on API/MCP startup; a restarted service keeps the operation id,
    phase, `nextAttemptAt`, latest refresh/error, and resumes active jobs
    without refreshing before an existing cooldown expires
  - completion list readback is cache/service-state only and must not launch a
    browser, acquire the dispatcher, or touch provider pages
  - `/status.accountMirrorCompletions` now reports completion metrics plus
    active/recent operations, and `/ops/browser` renders the same "Mirror Live
    Follow" posture for local operators
  - added live-follow completion controls:
    `POST /v1/account-mirrors/completions/{id}` with
    `{"action":"pause|resume|cancel"}`,
    `auracall api mirror-completion-control <id> pause|resume|cancel`, MCP
    `account_mirror_completion_control`, and matching `/ops/browser` buttons
  - added `pnpm run smoke:completion-control`, a no-browser local API smoke
    that verifies HTTP pause, CLI resume, MCP cancel, and `/status` metrics
    against an injected completion service
- Verification target:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/accountMirror/completionService.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run lint`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `git diff --check`

## Turn 91 | 2026-05-01

- Goal: make lazy-live-follow dogfood start with one compact operator preflight.
- Change:
  - added `pnpm run preflight:lazy-live-follow`
  - wired `./scripts/release.sh operator-smoke` through the preflight
  - documented the rollup in release, MCP, testing, and plan surfaces
- Verification target:
  - `pnpm run preflight:lazy-live-follow`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `./scripts/release.sh operator-smoke`

## Turn 92 | 2026-05-01

- Goal: live dogfood default ChatGPT lazy live follow from the installed
  runtime.
- Result:
  - installed API ran on `127.0.0.1:18095`
  - default ChatGPT binding confirmed `ecochran76@gmail.com`, Business
  - completion `acctmirror_completion_e26007da-f0e6-4423-bc64-8352c1fdc5c5`
    started and surfaced through API, MCP status tools, and `/ops/browser`
  - refresh request `acctmirror_3650f309-f05c-4b84-b994-a323b87fcbaf` used
    dispatcher operation `7f496bd1-9df5-47dc-926a-249a955aa510`
  - cache advanced to 292 conversations, 393 artifacts, and 285 remaining
    detail surfaces
  - completion was paused cleanly
- Follow-up fixed in repo:
  - completion accounting now records a pass result even when pause happens
    while the refresh is in flight

## Turn 93 | 2026-05-01

- Goal: remove the installed CLI parser trap for completion-list filters.
- Change:
  - enabled positional option scoping at the root CLI command
  - added CLI-entrypoint coverage for
    `api mirror-completions --status active` and `--status=paused`
- Verification:
  - focused CLI parser/root alias tests passed
  - `pnpm exec tsc --noEmit`
  - `pnpm run smoke:completion-control`
  - docs/plan/lint gates passed
  - user runtime reinstalled
  - installed parse check now reaches fetch instead of failing with
    `too many arguments for 'mirror-completions'`

## Turn 94 | 2026-05-01

- Goal: verify patched lazy-live-follow pass accounting from the installed
  runtime on the existing default ChatGPT completion.
- Result:
  - installed API ran on `127.0.0.1:18095`
  - resumed completion
    `acctmirror_completion_e26007da-f0e6-4423-bc64-8352c1fdc5c5`
  - refresh request `acctmirror_715a135d-8a8d-4339-9c2a-c4b75fd7e36f`
    completed through dispatcher operation
    `57890d99-5d28-4be9-b7da-f103b2965bdc`
  - completion accounting now persists `passCount: 1`, `lastRefresh`, phase
    `backfill_history`, and completeness with 279 remaining detail surfaces
  - cache advanced to 292 conversations, 416 artifacts, 24 files, and
    Business identity `ecochran76@gmail.com`
  - completion was paused cleanly at `nextAttemptAt`
    `2026-05-01T23:30:47.156Z`
  - API status, `/ops/browser`, MCP `api_status`, and MCP
    `api_ops_browser_status` all reported live-follow severity `paused` with
    one active paused completion

## Turn 95 | 2026-05-01

- Goal: prove live-follow completion cadence does not need an operator resume
  after each cooldown.
- Change:
  - added focused completion-service coverage for the service-owned cadence
    loop
  - the test starts unbounded `live_follow`, receives a polite cooldown,
    resolves the scheduled sleep, verifies the next refresh runs
    automatically, and confirms the operation schedules the following
    `nextAttemptAt` without another control call
- Verification:
  - `pnpm vitest run tests/accountMirror/completionService.test.ts`

## Turn 96 | 2026-05-01

- Goal: prove the same service-owned lazy-live-follow cadence in the installed
  runtime against the real default ChatGPT cache.
- Result:
  - installed API ran on `127.0.0.1:18095`
  - resumed completion
    `acctmirror_completion_e26007da-f0e6-4423-bc64-8352c1fdc5c5`
  - first resumed refresh
    `acctmirror_c3173aa3-0164-41e3-b577-d07bdbcdc75b` completed through
    dispatcher operation `1ff34c95-3de8-4df6-9481-872afebd97df`, advancing
    the operation to `passCount: 2`
  - the operation stayed `running` and, without another control call, woke at
    `nextAttemptAt` `2026-05-02T00:47:01.989Z`
  - second refresh
    `acctmirror_e84dd5df-2fca-4271-bff9-dea4b33ef9c2` started at
    `2026-05-02T00:47:01.998Z`, completed at
    `2026-05-02T00:50:28.152Z`, and used dispatcher operation
    `24d85542-01fc-437e-99cb-98c7ed6aafba`
  - completion readback showed `passCount: 3`, `nextAttemptAt`
    `2026-05-02T01:02:22.458Z`, 292 conversations, 416 artifacts, 24 files,
    and 267 remaining detail surfaces
  - completion was paused cleanly; API status and `/ops/browser` both reported
    live-follow severity `paused` with one active paused completion

## Turn 97 | 2026-05-01

- Goal: dogfood ChatGPT DOM-drift detection after the model selector moved
  into the prompt workbench.
- Finding:
  - live `auracall capabilities --target chatgpt --json` detected apps, Deep
    Research, web search, and Company Knowledge, but did not report model
    selector evidence
  - live `browser-tools` DOM inspection found the prompt-workbench model pill
    as `button.__composer-pill` with label `Instant`; a separate response
    action still uses `aria-label="Switch model"`, so selector order matters
- Change:
  - added `button.__composer-pill` and `button[aria-label="Switch model"]`
    fallbacks to ChatGPT model-button selectors
  - extended the ChatGPT feature signature and workbench capability mapper to
    report `chatgpt.model.selector`
- Verification:
  - source live probe now reports `chatgpt.model.selector` as `available` with
    `label: Instant`, `location: prompt_workbench`, and
    `selector: button.__composer-pill`
