# Plan0451 — Govern developer-app bootstrap (#368)

State: OPEN
Lane: issue368
Owner: primary agent for ecochran76
Branch: fix/issue368-post-refresh-timeout
Target: main
Integration: pull request
Base: 89800c458
Work item: ecochran76/auracall#368

## Current State

Existing backend-admission fixtures pass but start with a target/factory. A new
public CLI regression through the real ChatgptService utility dispatch and shared
physical target guard fails with the exact provider:chatgpt:connect-tab missing-
governor error when serialized discovery needs its first tab. The factory cannot
acquire target-bound authority before a target exists.

Serialized explicit utility commands now request target custody through the
existing ephemeral-tab acquisition/governor pipeline before identity/inventory
or catalog refresh. Prompt concurrency configuration is unchanged. No synthetic
target identity, guard bypass, automatic provider retry or warning clearance.
Configured account scope remains authoritative; serialized discovery without
configured identity uses the existing managed-browser scope convention, not an
inferred account. Affinity-mode identity requirements remain unchanged.

## Scope and acceptance

- Red/green public command regression at real utility + physical target guard.
- Prove list and confirmed refresh-tools use the exact utility tab/governor;
  preserve adapter cleanup and ledger/lease settlement and warning fences.
- Run consumer/utility/governor tests, typecheck, build, review and integration.
- Qualify installed read-only discovery separately from one named in-place app
  refresh. Operator selected OpenSign on wsl-chrome-3; no provider prompt,
  app replacement or warning clearance is allowed.
- Keep #368 open until its installed target/account/endpoint/connection evidence
  is qualified. Do not claim source tests prove provider catalog refresh.

## Non-goals

No repair of pending approval #377, account-load error #384, model-selector #374,
or borrowed-profile/control/input issues. Preserve unrelated branches and work.

## Validation and next action

Initial targeted existing connection fixtures: 3 pass. Refined command regression
is red with the exact error. Minimal repair reaches governed target reuse; fixture
transport was completed for that real reuse branch. 91 focused command/service/utility checks and 103 backend-admission/utility
checks pass in separate overlapping selections. Mandatory ungoverned creation
still raises the original error. Typecheck, build, scoped Biome, docs:list and whitespace checks pass.
PR390 mergedfb026941f; CLI installation and compiled serialized-utility contract
pass. API PID1777322 and its adopted clipboard helper remain unchanged. See
[installed CLI boundary](../notes/2026-10-23-issue368-cli-governor.md).
Operator selected OpenSign on wsl-chrome-3. Installed read-only discovery exits0,
observes30 apps and one enabled exact OpenSign match on the expected account.
One guarded in-place refresh exits1/unconfirmed: trusted activation and settings
preservation checks passed, but no attributable successful catalog was observed.
retrySafe=false; no replay. #368 remains OPEN at this precise acceptance gap.
Endpoint expectation comes from the OpenSign ingress inventory and OAuth docs;
the refresh must independently match the saved app setting before activation.
Private live receipts: ~/.local/state/auracall-issue368-opensign-20261023/.
Memory disposition: forbidden; user has not requested saving memory.

## 2026-10-24 — Bounded observation diagnosis

Read-only inspection of the retained exact OpenSign settings page found an enabled
Refresh tools control and no visible success/error alert or retained refresh resource.
The OpenSign service journal contains no entries during the attempt window. This
cannot reconstruct the response or authorize replay. No refresh was repeated.

The existing observer discards failure reasons. Provider-free regressions reproduce
this diagnostic defect for HTTP500, malformed catalog and foreign connection.
Retain explicit bounded reason messages for missing request, missing completion,
unreadable/unmatched identity, HTTP failure, unreadable/invalid catalog and duplicate
tool names. Preserve exact attribution, success criteria, one activation and
retrySafe=false. The earlier live outcome remains unknown; these diagnostics do
not retroactively qualify it. Focused adapter/CLI selection:67 pass (three assertions
observed red before repair); no-request diagnostic also covered.
Full typecheck/build, scoped Biome, docs:list and whitespace checks pass.
Primary review of the patch against cfe778d24: Standards and bounded diagnostic
spec have no blocking findings; source does not establish the live root cause.

## 2026-10-24 — Actual-symptom reproduction packet

Owner: primary agent; branch fix/issue368-catalog-repro in isolated worktree.
User invoked diagnosing-bugs after diagnostic-only qualification. The next gate
is a red-capable loop for the actual missing-catalog symptom, not another test
of failure wording. Prior generic receipt remains unknown. One new guarded exact
OpenSign refresh is captured passively (path/status/body structure only) through
the installed public command; no headers, secrets or body values captured.
No additional activation/retry is permitted within this packet. Capture preserves
independent request/response events so the observer result can be reconciled.
If it reproduces, minimize the observed event sequence at the public adapter seam
before ranking hypotheses or changing catalog logic. If it succeeds, report that
the earlier failure remains unreproduced rather than inventing a cause.
Private evidence: ~/.local/state/auracall-issue368-repro-20261024/.

### Captured result and minimized timing defect

One new attempt exits1/unconfirmed at the690000ms command deadline. Independent
Network capture records POST refresh_actions at15:15:01Z, HTTP200 at15:15:09Z
and31 catalog actions; the later links/list_accessible request aborts. The exact
terminal stage is not preserved, so no post-settings acceptance is claimed.
This is a different terminal message from the earlier missing-catalog receipt.

The public-adapter fake-timer loop adds only25 seconds of pre-release activation
latency to the existing successful fixture. It goes red (unconfirmed instead of
completed) despite the same exact linked-app identity and valid catalog. Removing
that delay restores the passing control. Ranked predictions: early observer
deadline, attribution loss, separate post-read timeout. Moving only deadline
start from pre-activation arm to post-activation completion makes the loop green.
Listening/attribution still starts before activation; no-event timeout, one click,
outer command bound and retrySafe=false remain intact. This confirms a source
timing defect, not historical causality for either live receipt. No second live
activation in this packet. Full live completion remains unqualified.

Validation:71 focused adapter/command/governor tests, typecheck, scoped Biome,
docs:list and whitespace checks pass. Primary Standards/Spec review of the
bounded patch against421c6cd7 has no blocking findings. Live state is not graded
as completed. Memory disposition forbidden: no explicit save request.

PR394 source99ad14308 merged9d076ebf0; full build passes. CLI-only adoption
uses ~/.auracall/user-runtime-issue368-timing-99ad14308. The API remains on its
existing Recall/clipboard runtime; no API restart or further live refresh.

## 2026-10-24 — Post-refresh settings error, red/green

No new provider refresh. Read-only inspection of the retained utility target
D4B53D1123550B487E6673350C78CF69 finds the exact visible error “Couldn't load
plugin settings” and Try again controls, with no connected-account section or
Refresh tools control. Current source waits for those readiness conditions and
does not recognize the terminal error. The captured response had HTTP200/31
actions; the retained error explains a reproducible post-read timeout mechanism.
The historical capture did not record the precise transition to this error state.

Feedback loop: existing public-adapter fixture changes only the post-response
visible text to the retained error. Red: read waits to its deadline and throws a
generic settings timeout. Minimal fix returns the explicit terminal-error probe
immediately; before activation it refuses with zero clicks, after activation it
returns unconfirmed/retrySafe=false and says preservation remains unverified.
No Try again, reload, consent, warning clearance or provider retry. Existing
human-approval and exact endpoint/app checks remain. The exact patched predicate
also recognizes the retained real DOM in a read-only CDP evaluation (zero refresh
buttons). Private receipt: retained-settings-error-predicate.json in the repro
state directory. This is real error-recognition proof, not a new completed refresh.

Validation:73 focused adapter/CLI/governor tests and full typecheck pass; scoped
Biome, docs:list and whitespace pass. Primary Standards/Spec review against
18cbb4d39 finds no blocker: exact visible error recognition tightens fail-closed
behavior and does not weaken attribution or permit a retry. Memory forbidden: no
explicit request to save memory.

PR396 source044009ea0 mergedae8a95cc7; full build passes. CLI-only adoption
uses ~/.auracall/user-runtime-issue368-settings-044009ea0. The running API remains
on its existing Recall/clipboard artifact; no API restart, settings retry or
additional provider refresh. The remaining live gate is recovery/readback of the
provider settings surface and preservation acceptance, not an unexplained poll.
