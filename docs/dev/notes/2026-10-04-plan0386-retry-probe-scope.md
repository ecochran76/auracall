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
