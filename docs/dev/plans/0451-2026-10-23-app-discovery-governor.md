# Plan0451 — Govern developer-app bootstrap (#368)

State: OPEN
Lane: issue368
Owner: primary agent for ecochran76
Branch: fix/issue368-settings-recovery
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

## 2026-10-24 — Recovered settings and saved acceptance baseline

One gated page reload recovers the exact retained OpenSign settings. Native
process identity verified; stale coordination left by our own failed helper was
preserved by rename before normal dead-owner reconciliation. Current exact app,
endpoint, connected-account section and permissions are present. This does not
retroactively prove the older before/after equality. Save this current baseline
and run one captured final refresh on the installed044009ea0 CLI, comparing saved
settings afterward. Current packet permits only this one tool-refresh activation.
Private receipts: ~/.local/state/auracall-issue368-settings-recovery-20261024/.

### Recovery and final-attempt outcome

Recovery succeeds: one reload, zero tool refreshes, exact app and endpoint,
connected-account section, permission section and one enabled Refresh tools
control. Private connection/permission fingerprint28deb6881123168f134a36c621b7abd10a0c56baac2af85dd2d0d2b5a43dfa6a.
The original recovery timeout receipt incorrectly named identity verification;
isolated verification passes and the preserved own-dead transition establishes
coordination as its blocking stage. Preserve both receipts with this correction.

The subsequent single final acceptance attempt exits1/unconfirmed/retrySafe=false:
“Developer-app operation and owned cleanup failed.” Independent capture sees no
refresh_actions request in this attempt; do not infer a repeated catalog refresh.
The aggregate primary/cleanup causes were not serialized by the CLI, so the
precise primary cause remains unknown. Read-only ledger reconciliation for
operation chatgpt-service-0a250962-a706-4515-b7a8-8320f971ea2c finds90 settled
backend records (74 succeeded/16 failed), three successful navigations and one
successful list-read admission. No unsettled request records; the utility lease
is nevertheless idle/outcome-unknown. Request settlement does not qualify clearing
that separate custody fence. No new provider action or manual fence clearance.
#368 stays OPEN. Next bounded work is owned-cleanup reconciliation, not another
refresh. No source change in this operational packet. Docs:list and whitespace
checks pass. Memory forbidden: no explicit save request.

## 2026-10-24 — Cleanup reconciliation packet

Branch fix/issue368-cleanup-reconciliation. Refine the prior ledger summary:
one of90 backend records is settled with effectState outcome-unknown;15 failed
records have effectState none and74 succeeded with settled effects. A settled
ledger transition alone does not establish a settled provider effect. The
unknown request key contains a random in-memory namespace, so saved metadata
cannot reconstruct its URL. No historical fence clearance or provider refresh.

One read-only public app-list probe retains recursive, redacted errors and stage
transitions; passive capture retains backend path/method/status/shape only. This
can reproduce preflight/cleanup behavior without invoking Refresh tools. Do not
select a repair before obtaining the probe verdict and a minimized failing loop.
Private evidence: ~/.local/state/auracall-issue368-cleanup-20261024/.

### Cleanup packet outcome

The installed read-only public-command probe succeeds (observed26 apps); identity,
attachment, inventory and cleanup complete. No refreshed catalog or provider
mutation was requested. The previous aggregate failure did not reproduce; no
root cause is invented and no source repair/regression is justified by this run.

Normal expired-lease retirement moves the old failed utility to lost, preserving
effectState outcome-unknown, finalDisposition preserved and the physical tab.
The new probe lease ends lost without a retirement disposition; its effectState is settled and
its operation succeeds. The old lease is no longer an active/idle custody fence;
the historical unknown request outcome remains intact. No manual fence reset or
claim of retroactive provider settlement. Reconciliation receipt is stored in
the cleanup state directory. This supersedes the active-cleanup-blocker wording
above. #368 stays OPEN for final catalog/preservation acceptance.

No code change or new tests: operational reconciliation only. docs:list and
whitespace validation pass. Memory forbidden: no explicit save request.

## 2026-10-24 — Fresh captured acceptance after custody reconciliation

Saved healthy settings baseline from the exact retained OpenSign page, under
verified native-browser ownership and automation hold, without navigation.
Expected app/endpoint, connected-account/permission sections and one enabled
Refresh tools control are present. Connection/permission fingerprint remains
28deb6881123168f134a36c621b7abd10a0c56baac2af85dd2d0d2b5a43dfa6a.
One installed public-command refresh now retains nested errors, progress and
independent backend metadata, so failure cannot silently discard primary causes.
Compare the exact current settings against the saved baseline afterward.
Private evidence: ~/.local/state/auracall-issue368-qualified-20261024/.

### Guarded attempt stopped pre-effect; bounded recovery revision

The044009ea0 attempt exits with the exact explicit error “Couldn't load plugin
settings; Refresh tools was not activated.” No refresh_actions request was
captured. This is a qualified pre-effect stop, not a repeated catalog mutation.
The recovered retained page and current saved baseline remain healthy.

The earlier operator-controlled one-reload recovery provides a concrete bounded
path. Reproduce at the public adapter seam: error before activation becomes
healthy after one reload, but current code stops without trying that recovery.
Red observed. Add a single shared page-reload allowance across before/after
settings reads. Require an exact settings URL, verified account identity and
unchanged identity across reload; stop for missing/changed identity, human
approval or persistent settings errors. Existing exact app/endpoint and final
connection/permission comparison still govern activation/completion. Refresh
tools remains one trusted activation; this retries only the settings read.
This intentionally supersedes the prior source slice's no-automatic-reload
policy with one qualified read-only recovery; no consent, warning clearance,
app replacement or catalog-mutation retry is introduced.

76 focused adapter/CLI/governor checks and typecheck pass. Recovery, account
change and post-error cases prove one reload maximum, zero clicks on account
change and one click with unconfirmed status if the second read fails.

Full build, scoped Biome, docs:list and whitespace pass. Primary Standards/Spec
review of this bounded recovery patch against87c4910ba has no blocking findings.
The previous pre-effect receipt remains preserved; recovery-source tests do not
qualify a live catalog refresh.
