# Plan0458 checkpoint review and bounded remediation

The operator requested this review at the checkpoint and accepted both prepared
Option B recommendations on 2026-10-26. This moves the single broad review from
the original after-closure timing; it does not reset its count or native authority.

Frozen comparison: `git diff d107e13cef6a83b76f63de9b3f268366be936a6b...331951dda32e231f7c990c129ffabcd34225d178`.
The approved Bot and Build amendment proposals govern acceptance alongside Plan0452
and Plan0458. The code range contains75changedfiles, including independently
landed developer-app and ledger changes. Full raw reviewer packets and red/green
logs remain under `/tmp/grok-checkpoint-review-20261026`; they contain no live
provider acceptance. Root adjudicated both axes; no second broad review ran.

## Standards

Reviewed AGENTS, CONTEXT, testing guidance and architecture/testing/validation
policies, plus the twelve-smell baseline. No CONTRIBUTING or CODING_STANDARDS file
was found. No substantiated hard violation or actionable smell was accepted.
Repeated account-verification closures did not justify structural refactoring.

## Spec

S1, **blocking, high confidence**: export could select an older completed assistant
among multiple responses while native Download referred to the current workspace.
The snapshot filtered by requested response before checking uniqueness, and header
ownership proved conversation only. Approved #410 criterion3 requires exact owned
account/target/conversation/assistant plus current gateway provenance. This can
misattribute a newer archive to an older response. Reproducer: two completed
assistant turns A/B, workspaceB active, export explicitly selecting A.

Root accepted S1. Repair conservatively requires a unique assistant for export,
compares an explicit requested response with it, rechecks uniqueness in every
native control preparation and verifies the same response/gateway after capture.
Historical inspection remains available; no guessed workspace identity was added.
Changed binding after Download preserves unknown custody and withholds attribution.
The prior single-response native acceptance remains a separate, retained receipt;
no new generation or Download was run for remediation.

CRC candidate: **needs_evidence**, not a blocking contract violation. A corrupted
payload can pass lightweight ZIP structure screening. The returned SHA256 proves
retained bytes, not semantic validity of every entry. Native acceptance separately
verified all291entryCRCs. Do not claim the public capturer performs full CRC or
safe-extraction validation; it does not extract or execute the archive.

## TDD and acceptance routing

One TDD pass, limited to S1, used the public Build service with controlled CDP/DOM
for old-response refusal, the exported native-control boundary for ambiguity before
input, and public command/service behavior for drift during capture. Each causal
regression failed before its repair and passed afterward. The existing orchestration
capture harness isolates its snapshot collaborator; the real-DOM regression supplies
the independent composition coverage. No structural refactoring was introduced.
Initial test expectation used an undefined generation-status interpretation; it was
corrected to assert the public response identity is withheld, and red was rerun
before the final green. Preserve both receipts rather than treating it as a pass.

#408 is CLOSED under the approved native settings contract; #477 remains OPEN for
separate Instructions/Model defaults. #410 is CLOSED under approved prepublication
acceptance; #411 retains authentic provider identity/publication acceptance.
Parent #398 remains OPEN and untouched. #409 and #414 are dependency-ready, one
worker each, source preparation only; root retains #405. Publication and additional
native grants/mutations are not authorized by these amendments.

Review count1/1; TDD count1/1. Further verification is closed-world for S1 and its
critical regressions. Memory disposition: forbidden, no explicit memory-update
request; no memory write performed.


## Verification receipt

Primary affected run: `pnpm vitest run tests/browser/grok410Build.test.ts tests/browser/grok410Export.test.ts tests/browser/grok410ExportControls.test.ts tests/http.grokBuild.test.ts --maxWorkers=1` —62tests/4files PASS.
Primary `pnpm run typecheck` PASS. `git diff --check` PASS.
Red/green selectors: `-t 'export refuses an older assistant'`,
`-t 'Download refuses a second assistant'`, and
`-t 'response changes during capture'`, each under its corresponding file with
`--maxWorkers=1`. Raw logs retain initial and corrected-red expectations.
No live/provider operation, installed runtime upgrade or second broad review.

Summary: Standards0accepted findings/highestnone; Spec1accepted blocking S1
remediated and affected checks green,1needs_evidence CRC candidate unpromoted.
