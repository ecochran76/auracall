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
