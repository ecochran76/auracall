# Gemini Left-Rail Artifact Live-Follow Plan | 0105-2026-06-02

State: CLOSED
Lane: P01

## Purpose

Repair Gemini live follow so it does useful provider work again. The problem
is not that AuraCall was doing live follow; live follow is supposed to run. The
failure mode is that Gemini work repeatedly navigated to
`https://gemini.google.com/app` and `/gems/view` without advancing through real
historical conversations or retrieving artifact-bearing outputs.

This plan replaces the current "bounded-only because Gemini churned" posture
with a productive Gemini live-follow contract: use `/app` only as a
landing/reattach surface, drive historical discovery from the Gemini left live
rail, enter real conversations, prioritize artifact/file-bearing conversations,
and materialize retrievable assets under bounded caps.

## Current State

- Plan 0104 closed with containment, cleanup, and system-Gem filtering:
  - bounded Gemini final-pass cleanup terminates the managed browser;
  - Google/system Gems such as `chess-champ`, `brainstormer`, and `storybook`
    are rejected before editable project treatment;
  - the old indefinite completion
    `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` remains
    paused.
- Plan 0104 did not prove productive Gemini history traversal. Its installed
  proof completed with `projects=0`, `conversations=71`, and no
  artifacts/files/media.
- Previous operator observation established that the Gemini left live rail is
  the highest-yield known surface for historical conversations.
- Repeated `/app` or `/gems/view` navigation without selecting a real
  conversation must be treated as churn, not as live-follow progress.
- Gemini artifact materialization exists in earlier bounded lanes, but this
  plan must reconnect it to live-follow conversation selection rather than
  relying on metadata-only page refreshes.

## Scope

- Audit Gemini provider read paths that currently navigate to `/app`,
  `/gems/view`, direct `/app/<id>` URLs, or conversation/detail pages.
- Define and implement a left-rail traversal strategy for live follow:
  - attach or land at `/app` only when needed to reach the authenticated
    Gemini shell;
  - discover visible conversation rows from the left live rail;
  - advance a per-runtime conversation cursor/checkpoint;
  - open real conversations from the rail with bounded interaction counts;
  - detect whether the selected conversation exposes artifact/file/media
    surfaces;
  - hand retrievable surfaces into existing Gemini materialization paths.
- Add churn detection:
  - count `/app`-only navigations;
  - count repeated route visits without conversation selection;
  - fail, yield, or mark blocked when a pass cannot advance beyond the shell.
- Preserve Plan 0104 guardrails:
  - bounded cleanup remains mandatory for bounded Gemini proofs;
  - system/non-owned Gem cards remain skipped;
  - model selector and edit surfaces remain out of read-only live-follow scope;
  - CAPTCHA/sorry/human-verification remains a hard stop.
- Prove the repair in the installed user runtime with bounded caps before
  reopening any indefinite automatic Gemini live-follow posture.

## Non-Goals

- Do not resume
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` as the proof
  path.
- Do not treat `/app` page reachability as success.
- Do not cycle through `/gems/view` or non-owned Gem cards as a substitute for
  conversation history traversal.
- Do not enable broad uncapped Gemini full-sweep materialization.
- Do not change the retired frontend.
- Do not auto-click Gemini model selectors, edit buttons, share controls, or
  non-owned Gem cards during read-only live-follow work.

## Work Tracks

### Track 1 | Gemini Navigation Contract Audit

Status: completed.

- Trace the Gemini account-mirror collector and adapter calls that land on
  `/app`, `/gems/view`, or direct conversation routes.
- Classify each navigation as:
  - shell attach;
  - rail discovery;
  - conversation selection;
  - artifact/detail inspection;
  - churn-prone repeat;
  - unsupported write/edit surface.
- Add diagnostics that expose the pass route sequence and classify whether the
  pass selected at least one real conversation.

Acceptance evidence:

- Tests or fixtures prove `/app` reachability alone does not count as live
  follow progress.
- Completion evidence can report route sequence, selected conversation count,
  and churn/yield cause.

### Track 2 | Left-Rail Conversation Discovery

Status: completed.

- Implement a Gemini left-rail reader that extracts stable conversation row
  candidates from the authenticated shell.
- Capture row evidence without model selector interaction:
  - title or accessible label;
  - relative position;
  - URL or inferred conversation id when available;
  - visible artifact/file/media hint when available;
  - selected/current row state.
- Add a bounded cursor/checkpoint so repeated passes advance through the rail
  instead of reopening the same shell state.
- Prefer artifact/file-hinted conversations, then recent unseen conversations,
  then cursor-continuation rows.

Acceptance evidence:

- Unit/fixture coverage proves visible rail rows become conversation
  candidates.
- A bounded proof selects at least one real rail conversation or reports a
  specific blocked/yield reason.
- Repeated bounded passes do not reselect the same row unless explicitly
  forced.

### Track 3 | Conversation Entry And Artifact Detection

Status: completed.

- Add a read-only conversation-entry path from a rail row.
- After entry, verify the page is a real conversation, not just `/app` shell.
- Detect artifact/file/media surfaces inside the conversation:
  - downloadable file links;
  - generated artifact panels or cards;
  - uploaded file references with retrievable URLs;
  - cached Gemini asset references already known to the catalog.
- Record why a conversation was materializable, metadata-only, unsupported, or
  blocked.

Acceptance evidence:

- A selected rail conversation records a conversation detail URL or equivalent
  in-pass evidence.
- Artifact/file candidates discovered in a conversation flow into the catalog
  with enough authority for retrieval or explicit unsupported classification.

### Track 4 | Gemini Materialization Handoff

Status: completed.

- Connect rail-selected artifact/file candidates to the existing Gemini
  materialization code paths.
- Keep materialization bounded:
  - small `maxItems` proof cap;
  - no broad full sweep;
  - no duplicate redownload when an archived family already exists;
  - no materialization if the surface is only metadata without retrieval
    authority.
- Record materialization outcomes in completion evidence and live-follow
  health readback.

Acceptance evidence:

- Installed proof materializes at least one retrievable Gemini artifact/file,
  or proves no retrievable candidate exists after selecting real conversations
  under the bounded cap.
- Replay proof skips already archived families before browser work.
- Failures name the missing authority or blocked surface, not generic
  metadata-only status.

### Track 5 | Churn And Scheduler Health Gates

Status: completed.

- Add pass-level churn counters:
  - `/app` shell attach count;
  - `/gems/view` visits;
  - repeated same-route visits;
  - real conversation selections;
  - artifact-bearing conversation selections;
  - materialization attempts.
- Prevent the scheduler from considering a pass healthy if it repeatedly lands
  on `/app` without conversation advancement.
- Make diagnostics distinguish:
  - paused because old indefinite completion is intentionally not used;
  - blocked by provider guard or human verification;
  - delayed by foreground/browser work;
  - yielded because rail traversal reached its bounded cap;
  - failed because of route churn.

Acceptance evidence:

- Diagnostics expose `/app` churn versus real conversation progress.
- A bounded proof with no conversation advancement is not reported as a clean
  productive pass.

### Track 6 | Installed Bounded Proof And Posture Decision

Status: completed.

- Rebuild and reinstall the user runtime/API service after code changes.
- Keep the old indefinite completion paused throughout the proof.
- Run one bounded Gemini left-rail proof:
  - provider: `gemini`;
  - runtime profile: `auracall-gemini-pro`;
  - sweep mode: `steady_follow`;
  - materialization policy: bounded artifact/file retrieval;
  - max passes: `1`;
  - small materialization cap.
- Confirm:
  - at least one real left-rail conversation was selected, or a specific
    blocked/yield reason explains why none could be selected;
  - `/app` navigation did not loop;
  - system Gems were not opened;
  - materialization outcome is truthful;
  - bounded cleanup removed the managed browser after terminal proof.
- Decide final posture:
  - **Repair Incomplete** if left-rail traversal cannot advance;
  - **Bounded Rail Retrieval Enabled** if bounded conversation/artifact work is
    productive and cleaned up;
  - **Live-Follow Reenable Candidate** only after repeated bounded rail passes
    prove cursor advancement, artifact truth, and no route churn.

Acceptance evidence:

- Installed proof includes completion evidence for route sequence,
  conversation selections, artifact candidate counts, materialization outcome,
  and browser lifecycle cleanup.
- Old indefinite Gemini completion remains paused unless a later plan replaces
  it.
- `ROADMAP.md`, `RUNBOOK.md`, `docs/dev/dev-journal.md`, and
  `docs/dev-fixes-log.md` record the posture decision.

## Critical Path

1. Audit Gemini navigation and current `/app` landing behavior.
2. Implement left-rail candidate extraction and cursor/checkpoint state.
3. Add conversation-entry verification and artifact detection.
4. Wire retrievable conversation assets into bounded materialization.
5. Add churn diagnostics and scheduler health semantics.
6. Run focused tests, typecheck, and build.
7. Install and run one bounded left-rail proof.
8. Record the posture decision and close or carry forward a narrower plan.

## Installed Proof | 2026-06-03

- Root cause found: Gemini shell readiness treated a collapsed left rail as
  ready because `[data-test-id="all-conversations"]` was visible even while
  real `/app/<conversation_id>` rows were hidden. The collector therefore
  reached `/app` and reported zero selectable conversation candidates.
- Fixes installed:
  - Gemini shell readiness now requires visible conversation anchors, and the
    sidebar opener is clicked when the rail is collapsed.
  - Gemini steady-follow preserves the attachment/detail cursor instead of
    resetting to shell-only metadata.
  - completion evidence now records route progress, selected conversation ids,
    artifact/file-bearing ids, materialization attempts, and shell-only churn.
  - Gemini shell-only route churn no longer queues materialization from stale
    retained metadata.
  - history materialization cleanup terminates every managed Chrome process
    using the resolved Gemini managed browser profile directory.
  - `history-materialization-create` now exposes
    `--provider-work-timeout-ms`, and the HTTP parser preserves
    `providerWorkTimeoutMs` for bounded provider work.
- Left-rail proof:
  - completion `acctmirror_completion_c96ff20c-c1d2-4299-8209-f5ab76652351`
    completed at `2026-06-03T02:38:56.223Z`.
  - route progress selected real conversations:
    `/app/62dd6ff9d85218b1`, `/app/b1cb32d4af54605d`,
    `/app/9469a4636595c20e`, and `/app/692bca4b1fbe8204`.
  - route progress reported `conversationCandidates=67`,
    `selectedConversationIds=4`, `artifactBearingConversationIds=3`,
    `materializationAttempts=3`, and `churnDetected=false`.
  - mirror counts advanced to `conversations=71`, `artifacts=7`,
    `files=2`, and `media=6`; remaining detail surfaces stayed bounded.
- Materialization proof:
  - job `hmj_e4b7007b8ff142438c77d41449dc1ff3` succeeded at
    `2026-06-03T03:04:33.948Z`.
  - the job materialized `Midnight At The Harbor` from Gemini conversation
    `62dd6ff9d85218b1` through `direct-remote-fetch`.
  - local file:
    `/home/ecochran76/.auracall/cache/providers/gemini/ecochran76@gmail.com/conversation-attachments/62dd6ff9d85218b1/files/gemini-artifact-62dd6ff9d85218b1-1-0/midnight_at_the_harbor.mp4`.
  - checksum:
    `81384741e358b6a3f618085bf459130614320a38eb192671cefac17d33460807`;
    size `3247266`; MIME `video/mp4`.
- Cleanup proof:
  - after terminal materialization, `pgrep -af
    'auracall/browser-profiles/.*/gemini|gemini.google.com'` matched only the
    `pgrep` command itself; no managed Gemini browser remained.
- Timeout/parser proof:
  - job `hmj_4f39d63352734b56b7d4c9ae37d672e4` was created with
    `maxItems=0` and `providerWorkTimeoutMs=45000`, then reached terminal
    `skipped` without opening Gemini.
- Validation:
  - `pnpm vitest run tests/cli/apiHistoryMaterializationCommand.test.ts
    --maxWorkers 1`
  - focused account-mirror/browser tests for Gemini route progress,
    shell-only churn, and cleanup wiring passed earlier in the slice.
  - `pnpm exec biome lint ...` on touched files passed.
  - `pnpm exec tsc --noEmit` passed.
  - `pnpm run build`, `pnpm run install:user-runtime`, and
    `pnpm run install:user-api-service` passed.

## Posture Decision

Plan 0105 closes as **Bounded Rail Retrieval Enabled**. Gemini live follow can
perform explicit bounded left-rail conversation traversal and retrievable
artifact materialization without `/app` shell churn. The old indefinite
completion `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402`
remains paused; automatic broad Gemini live-follow resume still needs a
separate plan proving repeated cursor advancement and scheduler policy.

## Parallelizable Work

- Route-sequence diagnostics can be designed while rail-row fixtures are built.
- System-Gem guard regression can remain separate from rail traversal tests.
- Materialization replay/idempotence tests can run in parallel with scheduler
  diagnostics once candidate authority is defined.

## Definition Of Done

- Plan 0105 is wired into `ROADMAP.md` and `RUNBOOK.md`.
- Gemini live follow has a left-rail-first traversal contract.
- `/app` shell reachability alone is not counted as productive progress.
- Bounded Gemini proof selects real conversations from the left rail or reports
  a precise blocked/yield reason.
- Artifact/file-bearing conversations are prioritized and handed to bounded
  materialization.
- Completion/scheduler evidence exposes route churn, conversation advancement,
  materialization outcome, and browser cleanup.
- Focused tests, typecheck, build, install, installed bounded proof, and
  `git diff --check` pass before any posture beyond bounded rail retrieval is
  considered.
