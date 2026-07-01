# Live-Follow Cycle Phase Ledger | 0150-2026-06-28

State: OPEN
Lane: P01

## Purpose

Make live-follow decide what work is actually needed for the next cycle, then
resume that work across bounded passes instead of always starting from the same
front door. The target state is not "one pass does everything"; it is "a cycle
can walk rails, projects, project conversations, file-library rows, and full
chat scraping over multiple wakes without starving the later phases."

## Current State

- Plan 0145 fixed reverse-mtime freshness frontier selection for recent
  conversation rows.
- Plan 0148 made steady-follow prioritize frontier-selected ChatGPT
  conversations before account-library/project inventory in the narrow detail
  pass.
- Plan 0149 proved direct single-chat artifact scraping can succeed with
  bounded DOM/CDP traffic and no broad account/project fanout.
- `AccountMirrorCollectorPhaseProgressEvidence` already records collector
  phase progress for `identity`, `projects`, `root-conversations`,
  `project-conversations`, `chatgpt-library`, `detail-inventory`, and
  `complete`.
- `AccountMirrorCompletionOperation` persists pass count, cooldowns, last
  refresh, materialization state, and account-library catch-up state, but it
  does not persist a live-follow cycle phase ledger or next-surface decision.
- `AccountMirrorRefreshRequest` accepts `sweepMode`, but it does not accept a
  requested collector phase, work class, or resume cursor that completion can
  use to prevent cross-cycle starvation.

## Problem Statement

The live-follow unit of work is larger than one bounded pass. Walking the root
conversation rail, projects, project conversations, ChatGPT file-library rows,
and full conversation detail/materialization cannot reliably finish in one
cycle. If every cycle starts by walking the root rail and project surfaces, the
later phases can remain theoretically reachable but practically starved.

Rate-limit guards are not the primary model error here. The scrape path should
use very little active LLM service traffic after a target chat is loaded. The
missing control-plane behavior is a durable decision tree that chooses the next
needed surface and carries unfinished work forward.

## Required Decision Tree

For each live-follow wake, completion must choose the next phase from persisted
operation state and latest mirror evidence:

1. **Guard and identity gate**
   - If the target is paused, disabled, identity-mismatched, or in provider
     cooldown, park with the existing reason and do not burn a collector phase.
   - If identity proof is missing or stale beyond policy, run the minimum
     identity check needed before deeper work.
2. **Root rail freshness gate**
   - If recent root conversation rows are missing, stale, or policy says the
     root rail TTL expired, run `root-conversations`.
   - If the freshness frontier is already current and no pending root cursor
     exists, do not restart here just because a new wake began.
3. **Project inventory gate**
   - If project membership is missing/stale, run `projects`.
   - Otherwise keep the current project snapshot for later phases.
4. **Project conversation gate**
   - If `projectConversations` has a cursor or project conversation coverage is
     incomplete, run or resume `project-conversations`.
   - Persist project index/read-limit progress after every bounded attempt.
5. **File-library gate**
   - If provider file-library inventory is enabled and stale, run
     `chatgpt-library`.
   - This phase must not preempt an already-started full chat/detail scrape
     unless policy marks the library as urgent.
6. **Conversation detail/full-scrape gate**
   - If frontier-selected conversations, incomplete detail cursors, or
     remaining detail surfaces exist, run `detail-inventory`.
   - If a conversation detail chunk cursor exists, resume that conversation
     before selecting new detail rows.
   - For ChatGPT steady-follow, this phase should honor the Plan 0149 model:
     load the target chat, parse DOM/app state, then iterate direct download
     links with telemetry, not broad account/project/history scans.
7. **Materialization/catch-up gate**
   - Queue materialization only after metadata evidence identifies missing local
     assets.
   - Do not treat account-library catch-up as a substitute for selected
     conversation detail scraping.
8. **Cycle completion gate**
   - A cycle is complete only when all required phases are fresh or terminal for
     the current policy window.
   - A new cycle may start at the earliest stale phase, not unconditionally at
     the root rail.

## Implementation Tracks

### Track A | Durable Cycle Ledger

- Add a `liveFollowCycle` or equivalent ledger to
  `AccountMirrorCompletionOperation`.
- Persist:
  - cycle id / started-at timestamp;
  - current phase and next phase;
  - phase order and per-phase status (`pending`, `running`, `yielded`,
    `complete`, `skipped`, `blocked`);
  - last decision reason;
  - relevant cursors copied from metadata evidence;
  - a compact history of phase transitions.
- Normalize the field in `completionStore` so installed runtime restarts do not
  erase cycle progress.

### Track B | Refresh Request Contract

- Extend `AccountMirrorRefreshRequest` with a requested live-follow phase or
  work-class contract.
- Thread the request into `AccountMirrorMetadataCollectorInput`.
- Teach the ChatGPT collector to honor phase requests:
  - avoid project/root rail reads when resuming known detail/full-chat scraping;
  - resume project conversation cursors without restarting root rail work;
  - resume detail chunk cursors before broad selection;
  - preserve the existing full-sweep behavior for explicit full sweeps.

### Track C | Decision Engine

- Add a pure decision helper that derives the next phase from:
  - the persisted operation ledger;
  - latest status registry entry;
  - `collectorProgress`;
  - `conversationFreshnessFrontier`;
  - `projectConversations`;
  - `attachmentInventory`;
  - `mirrorCompleteness.remainingDetailSurfaces`.
- Unit-test the helper with starvation scenarios where several cycles are
  needed to reach detail/full-chat scraping.

### Track D | Observability

- Add lifecycle events for phase decisions and phase completion/yield.
- Surface current phase, next phase, and reason in completion readback and
  scheduler history summary.
- Keep Plan 0149 scrape telemetry as the proof surface for the detail/full-chat
  phase.

### Track E | Bounded Installed Proof

- Keep `chatgpt/wsl-chrome-3` live-follow paused until Track A-D unit and type
  validation pass.
- Resume with a bounded operator-approved proof only after the installed
  runtime can show a ledger advancing past root/project phases into
  detail/full-chat scraping across multiple wakes.
- The proof must include at least one later-phase continuation after a
  cooldown/yield/restart boundary.

## Non-Goals

- Do not tune rate-limit cooldown thresholds as a substitute for phase
  scheduling.
- Do not require one live-follow pass to complete every surface.
- Do not restart installed live-follow automatically in this plan-opening
  slice.
- Do not remove the reverse-mtime freshness frontier from Plan 0145; it remains
  the row-selection policy inside the detail phase.
- Do not treat account-library or file-library catch-up as proof that selected
  conversation detail scraping completed.

## Acceptance

- [x] Plan 0150 is wired into `ROADMAP.md`, `RUNBOOK.md`, and the dev journal.
- [x] Completion persists a durable live-follow cycle ledger across store
  read/write and runtime restart.
- [x] A pure decision helper chooses the next phase without always starting at
  root rails.
- [x] `AccountMirrorRefreshRequest` can carry the requested phase/work class to
  the collector.
- [x] ChatGPT collector honors requested project-conversation and detail/full
  scrape continuation phases without broad restart work.
- [x] Tests prove multi-cycle progress eventually reaches
  `detail-inventory`/full-chat scraping even when earlier phases cannot all
  finish in one pass.
- [x] Completion readback exposes current phase, next phase, and decision
  reason.
- [ ] Installed proof shows at least one continuation across a wake boundary
  that does not restart at root rail when a later phase is pending.

## Progress Evidence

### 2026-06-28 | Ledger And Decision Helper

- Added `AccountMirrorLiveFollowCycleLedger` with current phase, next phase,
  decision reason, phase entries, and pass count.
- Completion refresh readback now stores `liveFollowCycle` for live-follow
  operations and appends a `live_follow_phase_decision` lifecycle event.
- Completion store normalization preserves the ledger across read/write and
  installed runtime restart.
- Added a pure `chooseLiveFollowCyclePhase` helper that chooses
  `detail-inventory` before earlier surfaces when conversation detail cursors,
  incomplete asset inventory, remaining detail surfaces, or freshness-frontier
  selections are pending.
- Focused coverage:
  - `pnpm vitest run tests/accountMirror/completionService.test.ts`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm exec biome check src/accountMirror/liveFollowCycleDecision.ts src/accountMirror/completionService.ts src/accountMirror/completionStore.ts tests/accountMirror/completionService.test.ts`
  - `pnpm run plans:audit -- --keep 150`
- Remaining implementation gap: refresh requests still carry `sweepMode` only;
  the next slice must thread a requested phase/work class into refresh and
  collector code so the persisted decision changes browser behavior.

### 2026-06-30 | Requested Phase Contract And Collector Honoring

- Extended `AccountMirrorRefreshRequest` and
  `AccountMirrorMetadataCollectorInput` with `requestedPhase`.
- Completion now maps live-follow cycle `nextPhase` to a collector phase on
  the next refresh, excluding terminal/internal phases.
- ChatGPT collector honors requested `detail-inventory` when prior evidence has
  concrete target conversation ids from an attachment/detail cursor or
  freshness-frontier selection; in that continuation path it keeps identity
  verification but skips project, root-conversation, project-conversation, and
  account-library reads.
- ChatGPT collector honors requested `project-conversations` by reading
  projects and project conversations while skipping the root conversation rail.
- Focused coverage:
  - `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts tests/accountMirror/refreshService.test.ts tests/accountMirror/completionService.test.ts`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm exec biome check src/accountMirror/chatgptMetadataCollector.ts src/accountMirror/refreshService.ts src/accountMirror/completionService.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/accountMirror/refreshService.test.ts tests/accountMirror/completionService.test.ts`
- Remaining implementation gap: installed/runtime proof still needs to show a
  continuation across a wake boundary that does not restart at the root rail
  when a later phase is pending.
