# Plan0478 — Developer-app composer and refresh diagnosis

State: CLOSED
Outcome: SOURCE_QUALIFIED_NATIVE_GATED
Owner: primary agent
Branch: fix/developer-app-composer-refresh
Target: main
Source baseline: e62b336e0

## Current State

Both readiness races are source-qualified: wait for the precise composer before
checking pristine state, and for the selected Permission value before capturing
refresh preservation state. Installed runtime is unchanged. Integration/deployment
and submitted native acceptance remain separate gates. The earlier one-shot live
refresh raised activation acknowledgement timeout; its effect remains unknown.
Preserve its retained lease fence and do not replay that request.

## Scope and acceptance

Diagnose composer first, then refresh preservation. Establish deterministic red
feedback through public seams using redacted provider evidence; rank falsifiable
hypotheses after reproduction. Apply minimal TDD repairs, preserve foreign drafts,
selection ambiguity, permission/account/endpoint guards and no-retry semantics.
Run affected local checks and one bounded code review against the source baseline.
Source, installation and live checks are separate proof boundaries.

No sharing changes, project mutations, scheduler resumes, foreign tab closures,
OAuth grant changes or unrelated refactors. One serialized owner; overlapping
source changes require reconciliation. Raw browser/account evidence remains in
user-scoped private diagnostics. Default hosted CI is skipped under operator policy.

## Definition of done

Record red/green commands, diagnosis, review findings and dispositions, source
custody and remaining installed/native acceptance gates. Close only the proven
scope; do not infer live success from fixtures.

## Evidence and diagnosis

Public seam: ensureChatgptEcosystemMention, using the existing captured-DOM harness
and real injected expressions. Risk: rejecting a fresh empty chat before React
mounts its editor; this fixture does not prove native picker or Send acceptance.
A guarded native owned-tab observation saw root/document complete, no load error,
no editor on two observations, then one visible precise rich editor with no pills
and whitespace-only text two seconds later. No prompt was entered or submitted.
Three hypotheses ranked after red: delayed mount (wait should pass), incompatible
selector (still fails after mount), restored draft/pill (must continue to refuse).
The minimized change is one mount delay in the existing successful picker case.

Red: pnpm vitest run tests/browser/chatgptAppComposer.test.ts --maxWorkers=1
returned 1 failed/16 passed, exact empty pill-free fresh-chat error (8.25s).
Green after readiness wait: composer/mention 24 passed; adding immediate draft/
pill controls and the lifecycle/refresh suite produced 80 passed across four
files (23.55s). Full pnpm run typecheck passed. Scoped Biome check passed after
formatting. Hosted CI skipped under operator cost policy; local Linux Node24.18,
pnpm10.23, frozen lockfile, no hosted runner or live tests in this selection.

The readiness wait lasts at most five seconds and retains the original separate
pristine/fresh-chat guard. It does not clear drafts or wait for pills to disappear.
Installed runtime remains unchanged; source acceptance is not native acceptance.

## Refresh boundary

One official installed refresh-tools operation with 90-second deadline and
passive private transport capture timed out before any settings observation.
Reported progress stage developer-mode is not sufficient evidence of the actual
wait. No replay: the operation did not produce a successful refresh result.
Earlier identical independent settings text is a later observation, not a capture
of the guard's actual before/after values. No trustworthy red replay of that
failure exists yet; no refresh snapshot or permission guard was changed.
Next bounded packet: capture actual pre/post values at the public refresh seam
once the installed inventory path reaches settings. Preserve ambiguous effects
and reconcile the retained operation before any provider retry.

## One bounded review

Fixed point e62b336e0ef83610e2875e0bef4141d543a29106; reviewed source checkpoint
3fe0132648549e4fab1dc037410d75d5d4dc6770 using
`git diff e62b336e0...3fe013264` and its one-commit list. Primary performed the
Standards and Spec axes serially under code-review; no delegated reviewer.

Standards: AGENTS, CONTEXT, testing/worktree/documentation/validation policies
and the skill smell baseline. No accepted violation or material smell in the
bounded source/test diff. Existing harness and precise lookup are retained.
Spec: Plan0478 composer criterion is source-qualified, including immediate
unsafe-state refusal. Native acceptance and refresh repair are still partial;
classify the missing refresh guard capture as needs_evidence, not a reason to
weaken preservation or claim completion. No new remediation finding; no second
broad review. TDD red/green precedes this review; no invented cleanup tests.

Review summary: Standards0accepted findings; Spec1needs_evidence criterion,
refresh preservation remains unqualified. Plan remains OPEN. No install/merge
or native submitted test is claimed by this source checkpoint.

## Continuation — configured waiting and suspended observation

Read-first reconciliation: no earlier diagnostic process remains. The original
90-second attempt's transport monkey-patch produced no usable settings capture;
its missing observations do not prove that activation never occurred. No blind
refresh replay was performed. A new process-local Node loader hook records actual
refresh method/guard stages and unconditionally throws before the unique trusted
Refresh tools activation call. It changes no installed file or production source.
The60-second fenced observation reached refresh-enter after inventory, then timed
out without guard input. Thus developer-mode progress is stale after inventory.

Current configured backendRequestBudgetWaitMs is600000; both earlier custom60/
90-second limits were shorter. A deadline alone does not diagnose preservation.
A second fenced observation uses the existing default690000ms deadline and logs
client, network, navigation and settings stages. No capacity limit was changed.
It is live diagnostic work, not a hermetic test, native acceptance or rollout.

Restart locator: private user-scoped directory
`~/.local/state/auracall-composer-refresh-20261101/` contains budget-job.private.json,
refresh-budget-trace.private.jsonl, budget-result.private.json or
budget-error.private.json and the unique budget-observation.done.json marker.
The marker is written only after a terminal artifact or the bounded monitor
expiry; inspect its status and the actual child state before claiming completion.
Source checkpoint for the probe:1c81638962b0b93a6f5dea49bf9361cfc3628e6c.
A detached bounded monitor owns completion observation. Codex Wake verified this
thread and armed completion intent wake_intent_962292367e584a16811ec1a3071b5e2c;
monitor.ready=true, lifetime persistent, exact existing-tab route. Registration
is not delivery or result consumption. On wake, inspect once; do not start a
duplicate or infer permission-state preservation from elapsed time. Plan OPEN.

## Continuation — route correction and full guarded capture

The fenced observation terminated with DIAGNOSTIC_STOP_BEFORE_REFRESH_ACTIVATION.
It captured actual pre-activation guard input; navigation86seconds and settings
read68seconds explain why short custom deadlines were inconclusive. No Refresh
tools click occurred in that observation.

The first completion wake did not deliver: caller selected active_tab, freezing
existing_tab, while the installed adapter reported active_attachment_unavailable.
An installed-function replay changes only the route: existing_tab unsupported,
background supported; changing busy to ready alone does not repair the mismatch.
Monitor healthy; zero submission attempts/native delivery absent. Exact-self
cancellation initially encountered a busy scheduler lock, later succeeded through
the supported CLI and was independently read back via MCP as cancelled. No lock
clearing, monitor restart, private-state editing or code fix was needed.

One actual refresh capture now runs with the original guards and default690000ms
operation deadline. Only process-local tagged instrumentation captures actual
before/after guard inputs; production/install bytes unchanged. Maximum one refresh
activation; no prompt, grant, sharing, project or scheduler mutation authorized.
Private restart locators in the same diagnostic directory: full-job.private.json,
full-run.private.log, refresh-full-trace.private.jsonl, full-result.private.json or
full-error.private.json and full-observation.done.json. A detached supervisor
bounds missing-marker observation; terminal:false requires child/log reconciliation.
Do not replay this request after an ambiguous result.

Corrected completion wake wake_intent_787b09876c0b4662b158172b97ee0bb7 uses exact
same-thread background_saved/background, persistent lifetime. Scheduling armed
and monitor ready; dispatch/consumption remain unverified. This is a new live
observation, not a replay of the already consumed fenced completion. Prior source
checkpoint0c1f43e745626bc89602141cfc3b4e28e9dd1223 remains the probe baseline.
On result, privately compare the actual guard snapshots and produce deterministic
public-seam red feedback before hypotheses or preservation-guard changes.

## Native wake consumed — terminal capture and ownership gate

Background completion wake delivered this exact conversation's native continuation,
submission6514cea5-8ea9-418a-821d-60aa61a2376d; the completion predicate was still
true and its result consumed. This verifies delivery/consumption for this wake,
not every route, queue deadline or idle-expiry scenario. Old wake remains cancelled.

The one actual guarded refresh did not return a catalog/preservation outcome.
It raised PredicateEvaluationTimeoutError: trusted pointer click activation after
21ms. The trace contains one guard input before activation; no after input.
Node job and supervisor exited. A timeout after activation starts does not prove
no click or no provider effect. Retain the exact lease's outcome-unknown fence.
The local request ledger lacks endpoint attribution; its generic request outcomes
cannot qualify a particular refresh POST or authorize replay.

A bounded read-only inspection of the exact originating tab through the installed
SDK was refused by DesktopControlBusyError. An initial local lease-field check
was corrected before connecting: process identity lives in processBinding.processId,
not legacy ownerProcessId. No navigation/input, lock clearing, custody transfer,
profile reset, or additional refresh was issued in reconciliation. Need the current
desktop owner to release access before reconciling retained DOM click proof and
connection state. Do not bypass that ownership gate or start another refresh.

No deterministic red replay of the original false-preservation symptom exists:
the latest run stopped at a different error. Diagnosing-bugs therefore does not
justify preservation hypotheses, guard changes or another broad review. Composer
source remains qualified by its earlier80affected tests; no new executable change
or tests in this documentation-only checkpoint. Installed adapter SHA256 remains
c6c946db58ad1990904ea33880013eddfd941887fb852eda30e0e85cca385448, identical to the
captured original hook input. Original ChatGPT/Grok kernel generations remain
2074859/866957. No installed files changed. Full raw captures and the compact
full-closeout.private.json receipt remain outside Git in the diagnostic directory.
Plan remains OPEN; refresh/native composer acceptance and integration are not done.

## Direct CDP evidence and completed source repair

Operator explicitly authorized read-only inspection through the Chrome development
port. Exact original target and app settings route were verified before evaluating
DOM; no Input, navigation, refresh, consent or ownership mutation was sent. The
retained click marker had no positive trusted-click proof, which does not prove
no effect. Current page still showed two connected accounts. Comparing the actual
pre-activation guard input with this readback found exactly one inserted line:
Allow low-risk. The connected-account section was byte-identical. The first guard
snapshot had the Permission heading/help but no selected permission value.

Public seam: adapter.refreshTools through existing external CDP/DOM/network fixture.
A minimal delayed-permission fixture reproduced completed expected versus
unconfirmed observed. Command:
`pnpm vitest run tests/browser/chatgptDeveloperAppRefreshTools.test.ts -t permission-loading-before --maxWorkers=1`
Red:1failed/27skipped,6.98s; full initial fixture variant retained27passing/1failing.
Ranked after red: premature permission readiness; changing account rendering;
genuine policy change. Exact account text excludes that change in this capture;
one-variable readiness correction plus a genuine changed-policy control resolves
source behavior without weakening preservation comparison.

Fix: require an observed selected permission value, excluding the known help and
loading text, before accepting settings as ready. Missing selection waits to the
existing read deadline and prevents activation. Existing approval/load-error
handling remains terminal. Exact account/endpoint/app/policy comparisons and
single-activation/no-retry semantics remain. Fixtures now include the observed
Permission section; delayed selection passes, unavailable selection makes zero
clicks and disposes timers, actual changed policy remains unconfirmed.

Unminimized private replay reads the complete actual captured text without copying
private account/app material into Git. Command:
`node ~/.local/state/auracall-composer-refresh-20261101/replay-permission-readiness.mjs --baseline`
reproduces readiness=true for incomplete state and fails the expected false
assertion. Candidate command without --baseline passes with beforeReady=false,
currentReady=true. A temporary replay extraction syntax error was corrected before
these recorded behavioral red/green verdicts; it was not treated as defect proof.

Focused validation:30refresh cases pass. Affected presubmit selection:
`pnpm vitest run tests/browser/chatgptDeveloperAppRefreshTools.test.ts tests/browser/chatgptAppComposer.test.ts tests/browser/chatgptEcosystemMention.test.ts tests/browser/chatgptDeveloperAppLifecycle.test.ts tests/cli/chatgptDeveloperAppsCommand.test.ts --maxWorkers=1`
129passed across5files,34.95s. Full `pnpm run typecheck` passed; scoped Biome and
`git diff --check` passed. Linux Node24.18/pnpm10.23; hosted CI skipped under cost
policy. Selection is not the comprehensive suite. No provider refresh was replayed.

Closed-world verification addresses the prior review's one needs_evidence item:
actual partial state now captured, red public-seam replay, minimal readiness fix,
and retained true-change/no-input controls. No second broad review or unrelated
pointer/ownership refactor. Plan CLOSED for diagnosis/source qualification only.
Native deployment, successful fresh apps-test/refresh acceptance, and the retained
unknown activation are not declared resolved by these fixtures. Private diagnostic
loaders/prototypes remain clearly named outside Git; installed bytes unchanged.
