# Plan0478 — Developer-app composer and refresh diagnosis

State: OPEN
Owner: primary agent
Branch: fix/developer-app-composer-refresh
Target: main
Source baseline: e62b336e0

## Current State

Native connector acceptance is complete in Overleaf MCP. AuraCall apps test
refused selection as non-pristine before sending; refresh observed an attributable
catalog but reported preservation unconfirmed. A delayed editor reproduces the composer symptom; refresh root cause remains unproven.
Original checkout and installed composite runtime are preserved.

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
