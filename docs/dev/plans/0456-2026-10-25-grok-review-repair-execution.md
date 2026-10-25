# Plan0456 — Grok review repair execution

State: OPEN
Branch: feat/grok-review-repairs-20261025
Target: main
Owner: ecochran76
Base: 69b6e889d4a8c8494a3f2351faf42790ee2682cf
Ledger: [execution graph](0456-grok-review-repair-ledger.json)
Parent: https://github.com/ecochran76/auracall/issues/398

## Current State

User approved the five proposed review repairs, current-graph integration and
implementation with reset2h/2MM allowance and manual monitoring. Issues440–444
are freshly published/read back with ready-for-agent and bug/enhancement labels.
No parent issue was modified. Current main's desktop transition fixes and both
journal histories were preserved while integrating the review report.

Ready frontier:440,441,442,444. Primary440; workers441/442/444, one ticket each.
443 is blocked by440/441/442 validated on this integration branch. All original
399–414 graph nodes remain visible.401/412 tracker closures remain historical;
affected acceptance requires corrective validation (401:440/442;
412:440/441/442/443). Corrective edges do not make the repair depend on its broken
predecessor. Original403/405/406/408/409/410/411/414 remain open with their existing
provider-contract/effect gates; this repair wave does not falsely close them.

## Frozen scope and acceptance

Implement all five approved issue bodies under
[repair tickets](0456-grok-review-repair-tickets), preserving their full criteria.
440 protects cursor-covered returned rows through real public discovery and
atomic checkpoint persistence.441 provides qualified bounded project coverage
and later-scope progress.442 guarantees bounded restart progress rather than
endless unchanged cursors.443 implements durable incremental follow after the
three foundations validate.444 centralizes reference projection while retaining
explicit client/persisted-record compatibility. No invented provider controls,
weakened bounds, silent fallback or live mutation follows from source readiness.

## Execution and validation

Use real public service/adapter/collector seams with controlled CDP and isolated
stores, red before green. Each worker owns its isolated worktree and bounded
paths; primary owns shared integration, journal/ledger/public wiring and any
adapter overlap reconciliation. Separate source, built, installed and native
proof. No global installation, provider effects or unrelated runtime work is
required by this source-repair packet. Preserve Wake319 and manual monitoring.

Integrate serially, run affected checks, retain exact commit/readback evidence,
then mark validated and unlock dependents. Close each issue only after its full
criteria and intended-target integration are proved. After all five close, run
one broad two-axis code-review over the frozen repair integration, then one
bounded TDD findings remediation pass. Verify accepted blockers closed-world;
do not restart broad review discovery. Existing full-program review is source
input, not the new post-closure review. No findings means no invented repair.

## Bounds and recovery

The native goal started2026-10-25T02:18:44Z; original reset window ends04:18:44Z
or earlier native7200seconds accounting. User token cap2MM applies even when
the native goal exposes no numeric budget. Do not reset on continuation.
Checkpoint at meaningful integrations/worker transitions and manually read
usage/time/resources. At the earliest cap stop new work and preserve exact
worker states, commits and remaining gates; never claim whole-program completion
from repair-wave closure. Memory writes remain forbidden absent a save request.
