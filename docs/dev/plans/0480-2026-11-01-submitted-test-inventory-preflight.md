# Plan0480 — Submitted test inventory preflight diagnosis

State: CLOSED
Outcome: SOURCE_QUALIFIED_NATIVE_PENDING
Owner: primary agent
Branch: fix/developer-app-composer-refresh
Predecessor: Plan0479

## Scope and current state

Diagnose the observed submitted-test inventory timeout without replaying a prompt,
changing deadlines, overriding desktop custody, or changing installed files.
The public CLI regression reproduces the exact preflight timeout when authenticated
API inventory is available but settings UI does not settle. Two red runs reproduce
it, including the minimized 14ms test. The submitted-test preflight used the default
UI transport, including an unnecessary Developer Mode settings observation.

Ranked predictions: switching only inventory transport should reach the submission
fence if the UI dependency is responsible; unavailable authentication/inventory
must still refuse; utility settlement failure must still prevent submission.
Use the existing authenticated API inventory transport, matching list and refresh,
with Developer Mode omitted. Keep account, inventory completeness, unique app,
confirmation, custody settlement and submission guards intact. Create/replacement
Developer Mode requirements are unchanged.

## Acceptance and validation

The regression calls runChatgptDeveloperAppOperationForCli and advances its real
deadline with fake time. It expects the explicit submitTest sentinel rather than
a preflight timeout; no browser, prompt input or Send occurs. Before the fix it
fails twice; after the fix all47CLI tests and10direct authenticated inventory tests
pass (57 total, 3.57s). Full `pnpm run typecheck` passes; scoped Biome
formatting was applied to the new regression, and `git diff --check` passes.
Validation is local; no hosted CI was requested. Source parent is
692c736c4cd095d35c2375ea7689964c3cdaf09a; the fix commit contains this plan. The latter cover account/workspace/session, malformed and
unavailable inventory, rate limits and captcha refusals. This establishes the
unnecessary UI dependency under the reproduced conditions, not the precise cause
of every native settings delay. Source qualification does not establish installed
native acceptance. No broad review repeated; verification is limited to this
preflight boundary and existing critical refusal controls.

## Definition of done and next boundary

Preserve the regression and source fix, record typecheck and scoped validation,
and retain private native timeout evidence from Plan0479. Installation and a new
native retest remain separate. Any installation must preserve existing runtime
overlays; do not replace the whole compiled adapter or replay the old uncertain
refresh. No project/sharing/OAuth edits, scheduler resume or browser closure.
