# Process-owned browser tabs and physical TTL reconciliation | 0390

State: CLOSED
Owner: primary
Work item: Issue #165; successor repair within Plan 0386
Branch: fix/issue165-process-tab-lifetimes
Target: main
Integration: merge

## Original observed state

The coordinator reproducer leaves 33 pages from 32 restored pages and 34 after
another completion in the same PID. Existing lease uniqueness is per workload.
Maintenance counts unleased targets but does not expire them. Saved sessions
were quarantined after native absence proof; authentication is preserved.

## Objective and bounds

User: one tab per process, including live follow; all other tabs in an open
managed browser have TTLs. Process means OS process within the managed browser
and tenant scope unless the pending clarification changes that interpretation.
Account scopes never share provider tabs. Start 2026-10-05T11:04:30Z; checkpoint
and stop by 2026-10-05T13:04:30Z or 500,000 consumed tokens, whichever first.
Goal tool currently exposes no configured token ceiling; poll usage and honor
the explicit user ceiling independently. Previous review is outcome_progress:
it supplies a red-capable physical-inventory reproducer and identifies the
acceptance gap. Material transition checkpoints and 15-minute backstop.

## Matt flow and bounded packets

Diagnosing-bugs has a real coordinator red loop. Continue in this context with
one red-green TDD slice at each public seam, then serial Standards and Spec
review against the pinned source base. Existing repository operating contract
is domain authority. No competing glossary is created.

1. Registry and coordinator: process-bound reuse, atomic contention protection,
   collector-to-child reuse, no extra tab for a changed workload.
2. Physical inventory: persist deadlines for untracked pages, expire them with
   verified close, retain live-follow tab, retain TTLs across maintenance/restart.
3. Production wiring, documentation, focused/presubmit validation, review,
   merge/install, provider-free installed replay and bounded browser proof.

## Acceptance and seams

Checkpoint 1 | 2026-10-05T11:27Z | outcome_progress: process binding, atomic
revision-fenced handoff, pre-I/O acquisition serialization, physical census
deadlines, live-follow retention and cold restoration quarantine implemented.
Focused core checks pass 45 tests; latest registry/coordinator subset passes 32.
Red receipts: second workload admitted; child opens page-2; concurrent cold
acquisitions open two pages; extra pages never retire and follow expires;
ordinary cold startup leaves session inputs; retained follow action expires.
Each reproducer now passes. Installed runtime unchanged. Remaining gates:
production navigation and restart coverage, broader selected tests, lint/build,
serial Standards/Spec review, integration/install and actual browser proof.
Goal meter at 11:21Z: 113064 tokens; explicit ceiling remains 500000.

- Registry enforces at most one current process binding per managed browser and
  tenant; concurrent jobs serialize or receive explicit contention.
- Sequential jobs including live-follow and child materialization reuse one
  physical target. Revisions prevent stale users from navigating it.
- Every other page has a persisted finite deadline; repeated census does not
  refresh its deadline. Blank and non-provider pages are included.
- TTL maintenance closes expired targets and verifies disappearance; a retained
  live-follow target is exempt from automatic TTL retirement.
- Cold launch cannot restore excessive untracked tabs indefinitely; warm
  adoption, cancellation, failure, restart and expired records are covered.
- Authentication, provider cooldowns and account isolation remain enforced.
- Tests assert physical target inventories in addition to registry records.
- Installed runtime matches reviewed source and demonstrates target reuse and
  TTL retirement without provider mutations or warning dismissal.

No additional provider retries beyond the existing remaining live allowance.
No prompts, Answer now clicks, account identity guessing, or memory writes to
unqualified destinations. Keep unrelated dirty work intact. Full Plan 0386 asset
acceptance remains a separate unmet requirement unless current evidence proves it.

## Checkpoint 2 | 2026-10-05T11:50Z | outcome_progress

Production process-tab wiring, restarted idle-owner adoption, lost-follow TTL
retirement, native HTTP 429 warning detection and all managed cold-start
quarantine are implemented. Selected broader validation: 164 files, 1781 tests
passed, one skipped. Typecheck and build pass. Touched lint has zero errors and
two unchanged launcher/global-name warnings. The unchanged prompt-structure
test failure was independently reproduced on clean PR 208 source; its two-case
file is excluded from this selected lane. Installed runtime remains PR 208.
Freeze source for serial Standards/Spec review, then integrate/install and prove
physical reuse and elapsed-time TTL expiry. Meter: 346753 tokens at 11:49Z;
original 500000-token and 13:04:30Z bounds remain in force.

## Checkpoint 3 | 2026-10-05T12:04Z | outcome_progress

PR 211 merged as 6f0d4e0f8 and canonical installation passed. API 44226 has zero
restarts; eight installed modules match the canonical build. An installed public
coordinator proof started native browser 68083, reuses one real target for
follow/child/follow, and assigns three extra blank pages fixed five-minute
deadlines. Actual elapsed-time expiry is still running. Initial CLI startup
failed due to missing XAUTHORITY; native absence verified, original failed
receipt preserved, rerun uses the API service's existing display authority.
No provider navigation or remaining provider journey was consumed.

Bounded verification found two restart retention defects after integration:
idle retained-follow process death never removed exemption, and active follow
with a renewed heartbeat could be lost at its old absolute TTL. Both tests fail
on PR 211 and pass after the generic restart reconciler handles dead idle
process bindings and exempts retained active follow from absolute TTL. Heartbeat
expiry, revision fencing and unknown-effect preservation remain enforced.
44 focused maintenance/utility/registry/restart tests pass; typecheck/build pass.
This accepted Spec blocker is remediated in a narrow successor slice; installed
proof must be rebound to that final source before completion. Meter 459254 at
12:03Z; original resource limits remain in force.

## Acceptance | 2026-10-05T12:14Z | achieved

PR 211 and the bounded restart successor PR 212 are merged. Final code identity
is 3e58471b27d8b1584dce882fade80bbdcf22f007. Canonical build and installation
pass; all ten selected installed modules match. API 46019 is healthy with zero
restarts. The primary's final installed-runtime fixture runs actual managed
Chromium with only about:blank, strict native startup/closure ownership and
the production public coordinator, registry and maintenance. Follow, child and
follow reuse target E150DCC6BBC0095E600542BFBD28ABE4. Three extra pages keep
their original five-minute deadlines across repeated real-time scans, then all
close; retained follow survives its deliberately one-second fixture TTL. The
333511ms run passes and cleanup proves native absence and zero fenced leases.

Receipts: `docs/dev/evidence/plan0390/installed-3e58471b2-physical-proof.json`,
`installed-3e58471b2-parity.json`, and `installed-3e58471b2-runtime-state.json`.
The earlier PR 211 physical run and initial CLI environment failure are also
preserved. Fixture: `docs/dev/fixtures/plan0390-installed-tab-proof.mjs`; run
with the same XAUTHORITY file as the service. No provider navigation, prompts,
warning dismissal or provider journey was consumed. Four provider journeys
remain used; one remains from the separate allowance. All 12 existing active
completion records and the scheduler remain paused; background drain remains
unpaused.

Validation: 1781 selected broad tests passed (one skipped), with the unchanged
two-case prompt-structure file excluded and its baseline failure preserved.
The restart correction separately passes 44 affected tests, typecheck, build
and touched Biome checks. Serial Standards/Spec review and bounded remediation
are recorded in the review note. Full Plan 0386 asset acceptance remains OPEN.
Installed tab-lifecycle acceptance was proved before the resource stop. Final
documentation integration and goal closeout did not finish within the token
ceiling: the stop readback was 500210, later automatic continuations reached
503992, and the goal was marked blocked. PR 213 remains open; do not describe
the old goal as complete or infer renewed execution authority from this plan.

Final pre-publication meter: 487137 tokens at 12:15Z.
