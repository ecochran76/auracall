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
