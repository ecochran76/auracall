# Aggregate Status Latency | 0315-2026-08-25

State: OPEN
Lane: P08
Operational state: IMPLEMENTATION_ACCEPTED_PENDING_INSTALLED_PROOF
Branch: fix/plan0315-aggregate-status-latency
Target: main
Integration: merge
Revision: 2 | 2026-08-25

## Stable Objective

Make the installed aggregate `GET /status` and `auracall api status` path
complete within the existing default five-second client budget on the current
AuraCall corpus, without deleting status evidence, weakening payload semantics,
or launching provider/browser work.

## Current State

- Plan 0314 restored `chatgpt/wsl-chrome-3` live follow and normal scheduler
  operation. Narrow completion and scheduler diagnostics remain responsive.
- Aggregate status completes only with a larger 30-second budget, observed in
  11-22 seconds. Three consecutive default installed probes timed out with
  `exit 124` after 7.2-7.8 seconds.
- API PID `62038` is active/running with zero restarts. The latest scheduled
  live-follow pass completed without backpressure and exact browser cleanup.
- Profiling isolated three dominant costs on the current corpus: local-claim
  evaluation over 400 persisted runs, archive/materialization availability
  hydration over a 1,875-item/29 MB index, and repeated active-job/browser
  readback. The original local-claim loop reread each run twice after the bulk
  scan and reread the same local runner for every candidate.
- The repair evaluates claims from the already-loaded record snapshot, reads
  the local runner once, exposes a one-pass stored-record list, refreshes
  archive availability without rereading asset contents, and overlaps
  independent aggregate projections. No status field or evidence class moved.
- Three instrumented source probes succeeded inside the five-second HTTP
  budget at 4.76 s, 4.18 s, and 1.53 s. Temporary instrumentation is removed.
  Final installed acceptance is deferred until unrelated host load returns to
  a valid proof posture; the latest readback was load average 42.67 with
  substantial CPU pressure and 31/32 GiB swap consumed.

## Diagnosis And Repair Evidence

- Baseline real-corpus profile: local claim 5.1 s, archive hydration 3.9-6.0 s,
  active materialization jobs 0.45-0.94 s, browser process status 1.3-3.1 s,
  runner topology 0.06 s. The 579 KB response size was secondary.
- RED regressions proved four `inspectRun` calls for two local-claim candidates
  and two redundant `readRecord` calls after a two-record bulk scan.
- GREEN requires zero per-candidate `inspectRun` calls, one local-runner read,
  zero post-scan record rereads, and availability-only archive refresh that
  retains the indexed checksum without reading asset contents.
- Rejected alternatives: a larger client timeout, field removal, stale cached
  status, unchecked checksum suppression on ordinary archive reads, and broad
  persisted cache architecture.
- Validation so far: focused regressions, runtime store/control/archive suites,
  isolated affected status hydration tests, typecheck, production build, and
  zero-warning scoped lint pass. A combined-file status sequence retains an
  order-dependent test-state leak: the identity-keyed archive test passes in
  isolation but can inherit prior history hydration. It is recorded as a
  validation caveat and did not justify weakening runtime semantics.

## Authority And Bounds

- The operator approved the recommended separate bounded performance plan.
- One critical-path owner and no subagents.
- Build a fast red-capable timing loop before source diagnosis. Record 3-5
  ranked falsifiable hypotheses before profiling or instrumentation.
- One bounded profiling/instrumentation pass and one diagnosis-backed repair
  slice. Temporary instrumentation must use one searchable debug prefix and be
  removed before closeout.
- A client-timeout-only change cannot satisfy this plan. Preserve current
  aggregate payload semantics unless a separately documented contract defect
  proves a field should move or disappear.
- Provider/browser work, prompt/composer action, materialization, cache/data
  deletion, and destructive recovery are out of scope.
- Installed adoption permits at most one supported install/service restart.
  Before it, pause the account-mirror scheduler at most once from a clean idle
  ownership state; after installed latency proof and clean ownership, resume it
  at most once. Hard stop on an active pass, provider guard, unknown ownership,
  exact managed-browser presence, or any human-verification surface.

## Execution Graph

1. Publish P08 custody and preserve the installed default-status timing repro.
2. Minimize the repro and rank/test 3-5 falsifiable cost hypotheses using
   CodeGraph plus measured profiling at the real aggregation seams.
3. Add a regression at the narrowest seam that reproduces the multiplicative
   cost, then implement the smallest semantics-preserving repair.
4. Run focused/affected provider-free validation, typecheck, lint, build,
   CodeGraph, plan audit, and diff hygiene.
5. From clean scheduler/browser ownership, install once and prove three
   consecutive default-budget aggregate reads plus narrow endpoint parity.
6. Resume the scheduler once, verify normal scheduled posture, record evidence,
   and close P08.

## Acceptance Criteria

- `ASL-R1`: one agent-runnable timing command reproduces the exact installed
  default-status timeout in at least 3/3 baseline runs.
- `ASL-R2`: profiling proves the dominant aggregate-status cost and its call
  multiplicity; the accepted hypothesis, rejected alternatives, and measured
  before/after evidence are durable.
- `ASL-R3`: a regression test exercises the real expensive call pattern and
  fails before the fix, then passes after it without removing response fields.
- `ASL-R4`: focused and affected tests, typecheck, scoped lint, build,
  CodeGraph, plan audit, and diff hygiene pass.
- `ASL-R5`: installed source is byte-identical; three consecutive default
  `auracall api status --json` probes complete successfully within five seconds
  each, while narrow completion/scheduler endpoints remain responsive.
- `ASL-R6`: one install/restart maximum, one scheduler pause/resume maximum,
  no provider/browser effect, no duplicate ownership, zero restart loop, clean
  Git/origin parity, and reconciled P08 documentation.

## Non-Goals

- No live-follow semantic change, retry-policy change, scheduler cadence
  change, provider selector change, browser automation, or account mutation.
- No status-field deletion, payload split, stale-data substitution, or broad
  cache architecture rewrite merely to hit the timing target.
- No cleanup of unrelated processes, branches, worktrees, or persisted data.

## Definition Of Done

- All six criteria have current source, installed, and runtime evidence.
- The default status command succeeds on the real current corpus without a
  larger timeout, and normal scheduler operation is restored after proof.
- P08 is closed/integrated with the measured root cause and durable lesson.
