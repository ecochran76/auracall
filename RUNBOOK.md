# RUNBOOK

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
