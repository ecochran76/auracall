# Plan0469 — Desktop capture refusal integrity

State: OPEN
Lane: P469
Branch: fix/desktop-capture-followup-20261030
Target: main
Integration: merge

## Current State

Spec https://github.com/ecochran76/auracall/issues/513; tickets #514 and #515.
Operator approved publication, one primary ticket and one unblocked worker,
then closure, one broad two-axis review and one bounded TDD remediation pass.
Source-only scope; no runtime installation, browser/service restart or prompts.
Base: 57df62b52f88affdf28486f456af23be3d3c2fc9.
Primary integration checkout: auracall-desktop-capture-followup.

## Execution ledger

| Ticket | Blockers | Owner | State | Write scope | Evidence |
| --- | --- | --- | --- | --- | --- |
| #514 | None | primary/deadline | running | captureFailure deadline; deadline tests | pending red/green |
| #515 | None | category_515 | running | terminal classification; category tests | pending dispatch |

Worker uses a separate checkout from the recorded base. Source overlaps are
limited to separate portions of desktopControlGate; primary owns integration
and capture interface. Integrate serially, reconcile intent and rerun combined
checks. No invented logical blocker between independent behaviors.

## Acceptance and seams

Existing public DesktopControlGate.withAutomation seam with isolated homes and
ownership directories proves bounded failure capture and truthful categories.
100 ms bounds the complete diagnostic wait; preserve original error identity,
real ownership, private opt-in, receipt allowlist/permissions/4096-byte limit.
Filesystem operations already issued may finish later; late errors are observed.
Tests cannot qualify installed behavior or historical contention cause.

## Validation and review budget

One behavioral red/green cycle at a time. Focused gate/capture/transition/CDP
checks, typecheck, scoped lint and build; record compact terminal receipts.
All ticket criteria must be validated on integration tip before tracker closure.
Then one frozen diff review against the recorded base, Standards and Spec
separately adjudicated. At most one bounded TDD remediation pass; focused
verification only afterward. No repeated broad review.

## Definition of Done

Both tickets implemented, integrated, validated and tracker-closed with exact
commit evidence; one review completed and accepted blockers remediated or
explicitly unresolved. Push validated integration branch, preserve source/runtime
boundary and remove clean worker checkout after durable custody verification.

## Worker custody

Handle /root/category_515; branch fix/desktop-capture-category-515;
checkout auracall-desktop-capture-category; base57df62b52. Worker owns only
withAutomation category selection and desktopControlCategory.test.ts.
Primary owns captureFailure and desktopControlCaptureDeadline.test.ts.
Shared public signature and existing receipt schema remain unchanged.

## Primary TDD evidence

Public refused-admission test stalled only diagnostic writing: red1 failed
(expected settled=true after100ms, actualfalse), then green1 passed. Early
marker lookup stall additionally preserves the exact injected admission error.
Combined deadline/capture green2:9passed,0failed. Private evidence directory:
~/.auracall/diagnostics/pr508-followup-spec-20261030/deadline/.
Exact commands use pnpm vitest run with deadline test (red1/green1), then
both deadline and desktopControlFailureCapture.test.ts (green2), JSON reporters
and matching log/exit files. No installed state or live ownership was touched.
