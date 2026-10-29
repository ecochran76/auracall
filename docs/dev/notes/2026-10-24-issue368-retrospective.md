# Issue368 session retrospective

Reviewed the visible conversation from the missing-governor repair through
installed OpenSign acceptance and issue closure, plus current repository checks.
Review base:9dfcd3a92006b02ae95862becf8dc4a1ce42c5bb. This is a recommendation
packet; no runtime change, new live probe, global instruction edit or expanded
access grant is included. The accepted outcome in
[the live receipt](https://github.com/ecochran76/auracall/blob/9dfcd3a92006b02ae95862becf8dc4a1ce42c5bb/docs/dev/notes/2026-10-24-issue368-live-acceptance.md) remains valid.

1. **High — Preserve causal evidence at the public command boundary.**
   The refresh JSON catch in
   [auracall.ts](https://github.com/ecochran76/auracall/blob/9dfcd3a92006b02ae95862becf8dc4a1ce42c5bb/bin/auracall.ts#L5612)
   emits only the outer error message. In this session, “operation and owned
   cleanup failed” concealed native cancellation and interception errors. Direct
   invocation of the installed public operation finally exposed those causes;
   targeted ownership-response capture then separated a Remote View failure.
   **Consequence:** a failed live attempt could not explain itself, forcing
   additional multi-minute probes. **Improvement:** extend the existing receipt
   formatter with bounded, redacted nested causes, failing phase, cleanup/effect
   state and diagnostic correlation. Keep request metadata method/path-class
   bounded; exclude tokens, headers, raw bodies and account snapshots.
   **Verification:** one public CLI-output regression preserves distinct primary
   and cleanup causes, terminates cyclic cause chains and excludes secret fixture
   values. Reuse existing stage reporting instead of inventing another CLI.
   **Cost:** medium; one maintained serializer and a small contract test.

2. **High — Make transition-lock crash recovery ownership-aware.**
   [DesktopControlGate.transition](https://github.com/ecochran76/auracall/blob/9dfcd3a92006b02ae95862becf8dc4a1ce42c5bb/src/browser/service/desktopControlGate.ts#L38)
   creates an empty transition directory and removes it in finally. Dead-owner
   recovery occurs inside acquire, after that transition must already be held.
   Two exited helpers left this directory behind during the session; normal
   acquisition could not reach its dead-owner reconciliation. The retained
   records and reversible quarantine steps are recorded in Plan0451.
   **Consequence:** a stale coordination artifact looked like active ownership
   and required manual forensic recovery. **Improvement:** give the transition
   an attributable owner/generation record and reconcile only proven dead owners.
   Preserve human claims and ambiguous records; elapsed time alone is inadequate.
   **Verification:** a child-process crash fixture recovers the exact dead
   transition while live, human and mismatched-generation owners remain protected.
   **Cost:** medium; a small coordination-state protocol with concurrency tests.

3. **Medium — Verify execution of the existing CI guardrail.**
   The tracked
   [CI workflow](https://github.com/ecochran76/auracall/blob/9dfcd3a92006b02ae95862becf8dc4a1ce42c5bb/.github/workflows/ci.yml)
   already invokes frozen install, lint, tests and Linux build. GitHub readback on
   2026-10-24 reports Actions enabled and this workflow active, but run listing
   returns no runs; the observed repair PRs had empty status-check rollups. No
   configured core.hooksPath or installed pre-commit hook was found.
   **Consequence:** the session's manual checks have evidence, but automatic
   presubmit execution has none. This does not establish why runs are absent.
   **Improvement:** investigate event delivery/repository execution settings and
   qualify the existing workflow before adding duplicate CI or more rules.
   **Verification:** a legitimate PR produces an attributable workflow run whose
   results cover the configured checks; confirm the intended merge requirement.
   **Cost:** low to diagnose; runner cost depends on the existing matrix.

4. **Medium — Follow the existing feedback-loop and suspension gates earlier.**
   I initially improved diagnostic wording without reproducing the missing-catalog
   behavior, then supervised repeated long live waits. The user had to redirect
   the investigation to diagnosing-bugs. Later, a minimal activation-delay case
   and an after-send successful-acknowledgment case each produced decisive red/green
   loops. The existing
   [testing policy](https://github.com/ecochran76/auracall/blob/9dfcd3a92006b02ae95862becf8dc4a1ce42c5bb/docs/dev/policies/0029-code-testing-discipline.md#L31)
   already requires those loops and durable completion wakes for suitable waits.
   **Improvement:** apply that gate before another live packet: name the exact
   symptom, retained evidence and red-capable command; distinguish reporting
   repairs from behavioral repairs. Establish completion monitoring when the
   job can survive the turn. The attempted owner-exit wake had pending_time,
   then was canceled when its trigger process exited; it was never verified
   automatic continuation. **Verification:** the next bug packet includes its
   actual red result before a fix, and a long unattended run has a verified
   monitor/registration/completion receipt. **Cost:** low; use existing policy
   and tooling rather than expanding AGENTS.md.

Recommended order: public failure receipts, transition-lock recovery, then CI
execution qualification. Apply the process correction immediately to the next
packet. Existing cancellation/receipt regressions already protect the defects
fixed in #368; do not duplicate them or reopen the accepted issue merely to
increase test counts. Treat the candidates above as separately scoped follow-ups.

Validation of this recommendation packet: source/API readback, docs:list and
whitespace checks. No live provider mutation or implementation test was needed.
Memory disposition: forbidden; no explicit request to save memory.
