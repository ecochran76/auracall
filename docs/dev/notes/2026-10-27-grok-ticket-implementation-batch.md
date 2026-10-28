# Grok ticket implementation batch — 2026-10-27

State: OPEN. User explicitly renewed TDD implementation and a subsequent one-round
code review plus one-round TDD findings pass. Historical Plan0458 review/TDD1/1
remains history; this batch has review0/1 and findings-TDD0/1, not a resource reset.
Base main5d332eef076f0cd32cb9049a82c8ae53ebdd6771. Review baseline choice asked
asynchronously; implementation continues. Parent398 stays untouched.

Root owns406, independent workers own409/411/414 in isolated worktrees.477 remains
BLOCKED_NATIVE_CAPABILITY and is not simulated complete. Four active agent slots;
no nested workers. Root serializes all native browser interaction and shared
compiler use; workers run focused provider-free tests independently.

## Implementation seams

-406 configured Connector invocation and public request/result contracts: prove
exact Connector/account selection, attributable tool/result evidence and fenced
unknown execution. Browser/native controls require qualified observation; local
Mail Receipts calls do not substitute for Grok. Source fixtures are not live proof.
-409 exact-owned-Bot resource discovery/configuration public contracts: observe
supported controls and preserve explicit unavailable/unqualified distinctions.
-411 selected-output publication prepare/reconcile public contracts: bind exact
qualified snapshot and prevent replay. Actual first publication requires its
concrete prepared operation; no placeholder publication or invented app/version.
-414 shared public archive/history materialization contracts: prove referenced
asset binding and cursor/budget/foreground/restart behavior, keeping selected
workspace coverage distinct from full coverage.

Each lane uses one observable failing test, smallest passing implementation, then
next behavior. Keep red/green commands and tested source in lane notes. No broad
review until consolidated implementation checkpoint; one adjudicated finding set
then one bounded TDD remediation pass. Close only original criteria actually met,
with intended-main integration and fresh GitHub readback. Routine source work and
read-only preparation proceed; sending/deletion/new consent/publication excluded.

## Root406 tracer bullet: exact installed custom Connector discovery

Actual native card had an A avatar before the canary title; first-line parsing
returned A, losing exact-name search and committed native ID binding. Public
client RED: `pnpm exec vitest run tests/browser/grok404Connectors.test.ts`
(1failure, expected Example installed row; received empty). Shared native-card
label qualification corrects inventory, revalidation and provider-ID binding.
GREEN: four affected suites54tests; full typecheck PASS. Native evidence private
`oauth-resume-20261026/picker-1793153728568.json`; no prompt/tool invocation.
This repairs a406 selection prerequisite, not invocation/live-draft acceptance.
