# Issue165 — Retry detection visibility and scope

## Observed failure and causal limit

The PR199 installed context control reported
`readChatgptConversationContext:<conversation-id>: retry` after reaching
`chatgpt.readVisibleCanvasProbes`. The operator reports there are no warnings
currently visible. The error is not evidence of a rate-limit warning.

The context recovery wrapper inspects visible overlays and then page buttons.
Its button classifier emits `retry-affordance` with summary `retry`; the
single-visit guard throws the context action prefix plus that summary. A post-
action inspection can reject a context that has already finished extracting
messages, files, and canvas probes. This explains how the observed final stage
and error can coexist. The installed receipt did not capture the matching
button, so it cannot distinguish a genuine failed turn from a false positive.

## Deterministic reproduction

`pnpm vitest run tests/browser/chatgptRetryVisibility.test.ts` enters the real
context reader and evaluates its actual page-button expression in a VM with
synthetic DOM controls. The cheapest assertion checks that a warning-free
control does not replace the context action's deliberately injected error with
`retry`. It does not claim a successful context extraction.

Baseline: hidden Retry and an unrelated Retry both returned the observed
`readChatgptConversationContext:retry-visibility: retry` instead of the action
error. A visible Retry attached to a failed conversation turn correctly stopped.
The corrected baseline was repeated after simplifying the fixture to an action
sentinel; no payload or navigation mock is needed for this invariant.

Ranked predictions, shown before testing changes:
1. Computed visibility removes the hidden-control false positive.
2. Requiring a conversation turn/message ancestor removes the unrelated-control
   false positive.
3. A genuine visible failed-turn control remains blocking after both changes.

Changing visibility alone passed the hidden case while the unrelated case
remained red. Removing the arbitrary parent fallback then passed all three.
These experiments prove both local defects, not their occurrence in the prior
live DOM. No live provider pass was run in this slice.

## Behavior and review

The page-button fallback now rejects display:none, visibility:hidden, and
visibility:collapse controls, even if a layout rectangle exists, and requires
an existing conversation turn or message-author ancestor. Visible overlays and
rate-limit classification remain unchanged. Real failed-turn Retry detection
remains blocking; the repair does not click or recover any provider control.

Standards self-review against canonical e632696149841f9921cde4ab8246bb61207dc244:
six source lines, no dependencies or new exported test seam, existing browser-
expression conventions, VM execution at the actual context-reader boundary.
No accepted blocking findings.

Specification self-review: scoped repair of demonstrated warning-free false
positives; no blanket warning bypass or assertion that the earlier live failure
was false. No accepted blocking findings. The prior live cause needs matching
DOM evidence before it can be stated as confirmed.

Validation: 204 tests passed across retry visibility, adapter, and materialization
replay suites; typecheck and scoped lint passed. Additional context-deadline and
collector regression checks are recorded in the slice closeout.

Additional focused checks: 67 tests passed across retry visibility, context
deadline, and collector suites (three retry tests overlap the 204-test run).
Memory disposition: unavailable; atlas discovery returned only unrelated
Previews, Buffer CLI, and IM CLI routes. No qualified AuraCall route exists
in that readback; a machine non-write receipt was recorded.

## Canonical installation and replay

PR201 merged as `46c6bb3f9ee0bf0e8a33bb03090b4c225e98242c`. The exact
canonical checkout was built and installed. The installed adapter SHA256
matched the canonical build, and the same three VM scenarios passed against
the installed JavaScript context reader without provider access. API restarted
as PID37740; all six completions and global scheduler remained paused, zero
completions running, and exact managed browser process absence was verified.
The completion pass counts match the pre-install readback. This is installed
provider-free replay qualification, not successful live-refresh acceptance.
See `2026-10-04-plan0386-pr201-installed-replay.json`.

## Successful context replay and next live gate

The existing regression now completes the context reader instead of injecting
an action sentinel. Synthetic CDP responses supply readiness, payload, two
messages, an input file, and empty artifact/image/canvas surfaces; the actual
Retry expression still executes in the VM. Hidden/unrelated controls permit
normalized messages and file metadata to return. Two additional timing cases
prove an unrelated Retry appearing after canvas extraction does not reject the
result, while a genuine failed-turn Retry appearing there remains blocking.

The strengthened five-case command was run against the pre-PR201 adapter at
e632696149841f9921cde4ab8246bb61207dc244: three false-positive cases failed
with the observed retry signature, and both genuine-failure controls passed.
Restoring the repaired adapter passed all five. The adapter was restored in a
finally block; no production source change is part of this test-only slice.
199 focused tests (five replay plus 194 adapter), typecheck, scoped lint, and
diff checks pass. Serial Standards review found no blocking findings; Spec
review confirmed complete synthetic reads without claiming live acceptance.

Live accounting is five of five: the bounded-resumption plan records three
through PR195, PR197 records one, and PR199 records one. PR201 used zero live
provider passes. The original window ended; later merge/install/test authority
did not explicitly raise the five-pass cap. A request for one additional
ten-minute control is pending. Dependent live work must wait for the answer.
The proposed control resumes only completion
acctmirror_completion_328f88a8-56b9-4274-bbe0-bb20f3aea435 on wsl-chrome-3,
checks exact installed hash and six-paused preconditions, and stops on a
terminal pass, visible provider guard, or deadline. Global scheduler and the
other five completions stay paused. Always pause the owned completion after
the control and verify process/lease state. No bypass or warning dismissal.

Checkpoint: validation hardening; installed live refresh and automatic
materialization remain unaccepted. The next action is the single prepared
control after explicit cap extension, rather than another source-hardening
cycle. Memory disposition remains unavailable: fresh narrow atlas discovery
returned only unrelated IM CLI, Previews, and Buffer CLI routes.
