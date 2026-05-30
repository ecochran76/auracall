# API Readback Memory And Runner Compaction Plan | 0084-2026-05-30

State: CLOSED
Lane: P01

## Purpose

Stabilize the installed AuraCall API service by reducing expensive status and
completion readback pressure, compacting stale runner records, and preserving
operator forensic access through explicit full-read modes.

This is the first detailed follow-up from the 2026-05-30 live-follow and
artifact-materialization audit. It protects the reliability of `/status`,
CLI/MCP status tools, the greenfield `/console` workbench, and future
materialization planning before adding more product controls or recovery
automation.

## Current State

- Plan 0083 is closed for the first state-gated Runs controls in the
  greenfield `/console?view=runs` workbench.
- The 2026-05-30 audit found the installed service on port `18095` usable but
  not broadly green:
  - recent `~/.auracall/logs/api-18095.log` entries show Node heap OOM restarts;
  - `/status.runnerTopology.metrics` reported `1761` runner records, with only
    `1` active and `1760` stale;
  - account-mirror completion storage contains thousands of historical
    completion records, while `/status` must still expose current live-follow
    state quickly;
  - status readback can recover to healthy target rollups even while older
    failure history remains large;
  - direct `/v1/*` materialization reads may be protected by API-key policy,
    increasing reliance on safe status/CLI/MCP readback for operator audit.
- Existing work already compacted plain runner topology for normal `/status`
  reads while preserving full forensic access through query options, but the
  installed dogfood state shows further retention/readback limits are needed.
- No materialization recovery, provider browser automation, or new controls
  should be added until the status/readback substrate is stable enough to
  report them truthfully.

## Scope

- Identify the API readback paths most likely to allocate large object graphs
  during normal status, CLI, MCP, and console polling.
- Keep default readback bounded for:
  - runner topology;
  - account-mirror completion summaries;
  - live-follow target summaries;
  - recent runtime/run/archive surfaces used by `/console`.
- Add or tighten stale-runner compaction so dead runner records do not grow
  without an explicit forensic retention policy.
- Preserve explicit forensic modes for full runner/completion inspection when
  requested by an operator.
- Add tests that prove bounded default payload sizes and full-read escape
  hatches.
- Update operator docs and planning surfaces if query options, retention
  behavior, or status semantics change.

## Non-Goals

- Do not implement artifact materialization recovery in this plan.
- Do not change provider browser automation or live-follow collection logic
  except where needed to avoid expensive readback.
- Do not add Search/archive, API Access, launch, broad retry, or new console
  control families.
- Do not delete forensic evidence without a documented retention rule and
  operator-readable replacement path.
- Do not hide active failures by pruning current active, paused, failed, or
  recently terminal operations from operator-visible summaries.
- Do not widen service/runner architecture into multi-runner scheduling,
  reassignment, or worker pools.

## Architecture Boundaries

- `/status` remains the fast operator posture route.
- Detailed API routes, CLI commands, MCP tools, and explicit query parameters
  remain the correct place for forensic/full data.
- Runner records are service-runtime ownership evidence, not account-mirror
  tenant truth.
- Account-mirror completion records remain durable operation history, but
  default readback should project compact current state instead of loading every
  historical record into every response.
- The greenfield `/console` should consume compact readback by default and open
  full details only through explicit inspectors.

## Implementation Tracks

### Track 1 | Reproduce And Measure Readback Pressure

Status: completed.

- Capture a current installed-service baseline for:
  - `/status` default payload size and response time;
  - `/status?recovery=true&sourceKind=all&tenantExecutionLimits=usage` payload
    size and response time;
  - active vs stale runner counts;
  - active/recent account-mirror completion counts;
  - recent API OOM evidence from `~/.auracall/logs/api-18095.log`.
- Identify which status sections force uncapped reads or large in-memory
  expansion.
- Record the baseline in the dev journal without storing secrets or raw
  provider payloads.

Evidence:

- Before implementation, installed `/status` on port `18095` returned
  `457378` bytes in `10.379518s`; heavy
  `/status?recovery=true&sourceKind=all&tenantExecutionLimits=usage` returned
  `537722` bytes in `16.084951s`.
- Baseline runner topology was `1761` total runners, `1` active, and `1760`
  stale. Completion summary held `2698` total records with `6` active rows.
- Recent `~/.auracall/logs/api-18095.log` contained Node heap OOM restart
  evidence before this plan.

### Track 2 | Bounded Default Status Projections

Status: completed.

- Audit `/status`, CLI `api status`, MCP `api_status`, and `/console` readback
  consumers for fields that need current posture versus full history.
- Enforce bounded defaults for:
  - runner topology summaries;
  - completion metrics;
  - active completion rows;
  - recent terminal completion rows;
  - live-follow target accounts.
- Preserve current operator-critical counts such as active, paused, failed,
  cancelled, desired target counts, and attention state.
- Add explicit limit fields or omitted-count metadata where rows are capped.

Evidence:

- `/status.accountMirrorCompletions` now computes metrics from the in-memory
  completion projection but hydrates materialization status only for the
  bounded recent rows and current active rows.
- The summary now exposes `limits.recent: 10` and `omitted.recent` so default
  status consumers can show the cap explicitly.
- Focused HTTP coverage proves active live-follow count parity remains intact
  while recent hydration is bounded.

### Track 3 | Stale Runner Retention And Compaction

Status: completed.

- Define a retention rule for stale runner records in the user runtime store.
- Compact stale runner records at safe service lifecycle points, such as API
  startup or status-store maintenance, without removing the active local runner.
- Preserve enough aggregate evidence to explain:
  - active runner count;
  - stale runner count;
  - omitted/compacted runner count;
  - last compaction time;
  - whether forensic full readback is still available.
- Avoid introducing multi-runner scheduling semantics or reassignment behavior.

Evidence:

- Stale runner retention is `100` newest stale runner records. Compaction runs
  after the local API runner is registered and never removes active runners.
- Runner control now has a `compactStaleRunners({ keepNewest })` contract backed
  by store-level runner deletion.
- Focused runner-control coverage proves compaction deletes only older stale
  records and preserves the active runner plus retained stale evidence.

### Track 4 | Forensic Escape Hatches

Status: completed.

- Keep explicit full-read affordances for operators who need raw evidence:
  - query parameters such as `runnerTopology=full` where already supported;
  - CLI/MCP flags or separate commands where full readback is safer than
    bloating default status;
  - console inspectors that request detail only for selected rows.
- Make full-read modes visibly more expensive in operator docs or command help
  where applicable.
- Ensure protected `/v1/*` routes do not leave local operators without an
  authenticated or CLI-backed way to inspect current status.

Evidence:

- `runnerTopology=full` remains the explicit full runner-topology escape hatch.
  After compaction, installed `GET /status?runnerTopology=full` returned all
  `101` retained runner rows with `displayedRunnerCount: 101`.
- Direct unauthenticated
  `GET /v1/account-mirrors/completions?limit=1` still returns `401`, matching
  the protected-route posture; installed CLI readback
  `auracall api mirror-completions --port 18095 --limit 1 --json` returned one
  completion row successfully.

### Track 5 | Validation And Installed Runtime Proof

Status: completed.

- Add focused tests for bounded status payloads and omitted-count metadata.
- Add tests for stale-runner compaction without active-runner loss.
- Add CLI/MCP parity tests where status shape changes.
- Rebuild/install the user runtime and restart `auracall-api.service`.
- Verify the installed service no longer reports explosive stale-runner growth
  in default readback and does not immediately reproduce OOM during bounded
  status polling.

Evidence:

- `pnpm vitest run tests/runtime.runnersControl.test.ts --maxWorkers 1`
- `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 -t "keeps live-follow completion metrics aligned"`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run lint` exited `0` with the existing warning-level debt
  (`200` warnings).
- `pnpm run plans:audit -- --keep 84`
- `git diff --check`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- Installed default `/status` after restart returned `461530` bytes in
  `7.214479s`, with runner topology `101` total, `1` active, `100` stale,
  `1` displayed, and `100` omitted stale rows. Live follow remained
  `healthy` with `6` active completions.
- Installed heavy status after restart returned `542060` bytes in `11.560811s`
  with the same bounded runner and completion readback posture.

## Acceptance Criteria

- Plan 0084 is wired into `ROADMAP.md` and `RUNBOOK.md` as the active bounded
  plan.
- Default `/status` readback stays bounded even with thousands of historical
  completion or stale runner records.
- Default status consumers still show current active live-follow targets,
  completion counts, runner readiness, attention state, and omitted-count
  evidence.
- Full forensic runner/completion readback remains available only through
  explicit routes, flags, or query parameters.
- Stale runner compaction has a documented retention rule and does not remove
  the active local runner.
- CLI/MCP/console readback remains compatible or is updated in the same slice.
- Installed-runtime verification on port `18095` records before/after evidence
  for runner counts, payload size or response time, and service stability.

## Validation Plan

- Focused unit tests for runner topology compaction and status summary limits.
- Focused HTTP tests for `/status` default and full-read query behavior.
- CLI/MCP status parity tests if any status shape changes.
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run plans:audit -- --keep 84`
- `git diff --check`
- Installed runtime:
  - `pnpm run install:user-runtime-service`
  - `systemctl --user restart auracall-api.service`
  - bounded `/status` polling against `http://127.0.0.1:18095/status`
  - one explicit forensic readback check for the full runner/completion path.

## Definition Of Done

- Default status/readback paths are bounded and tested.
- Stale runner retention/compaction is implemented, documented, and verified.
- Full forensic readback remains intentionally available.
- Installed-runtime evidence shows improved default readback health.
- `ROADMAP.md`, `RUNBOOK.md`, `docs/dev/dev-journal.md`, and durable fixes log
  entries are updated with implementation evidence.
- Plan 0084 is updated with final evidence and closed.
