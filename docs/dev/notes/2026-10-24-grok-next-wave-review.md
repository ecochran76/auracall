# Grok next wave review and acceptance

Frozen review: d3f3d8a29573aadb887d8a7f9705923eebe1b45d...6a3cb677f3bbf0433fe47a73ef722026dbb7e802.
One read-only Standards/Spec pass per ticket; no repeated broad review. The
primary adjudicated candidates and performed one bounded remediation pass.

## Issue407

Standards: no actionable candidates. Spec B1 accepted blocking: selected Bot
identity could change during the baseline await or through an in-place same-name
ID mutation, then be attributed to the originally selected Bot. Remediation
5dd0a3569 atomically validates expected Bot ID/name inside prompt preparation and
adds data-bot-id/href to dispatch token evidence. Three real text-pipeline
regressions reproduced red then green. The primary post-completion TDD also
reproduced account discovery before cap rejection and moved it after operation
admission;14 service/public Bot tests pass. Source public interfaces are wired;
installed/live UI evidence and artifact materialization are separate boundaries.

## Issue403

Standards: no actionable candidates. Spec F1 accepted blocking: progress write
failure could replace an unknown-effect operation error and erase its retained
target. Public configured-wrapper regression reproduced red then green; operation
errors survive diagnostic persistence failure and successful returned outcomes
report progressPersistence failed when needed. Applies to shared Bot diagnostics
as well. Post-completion TDD reproduced Ops misreporting uncertain files as no
effect; the projection now retains unknown custody.

Spec F2 was initially needs-evidence, then reproduced and accepted blocking:
unrelated newly ready IDs could falsely confirm a selected native upload. The
current surveyed provider evidence does not bind native File/content to provider
ID. Remediation ef9c1be83 withholds complete upload results and reports
unconfirmed/source_binding_unavailable. Recent exact-ID selection remains
executable. Issue403 is PARTIAL and must remain open; its dependents remain locked.
This is an outstanding acceptance gap, not a weakened completion criterion.

## Other custody

Issue405 partial source is retained separately at66e1b4327fe7c60b1395b133400279d238958519,
branch feat/grok-405-install. Worker reports25 focused tests and typecheck/lint
passed. It is not integrated or criteria-complete: durable service/public wiring,
saved identity/grant proof and built-in support remain open. No live/provider,
installation, OAuth, Bot mutation, Mail canary or publication effects occurred.

## Validation and monitoring

Integration run before review:88 tests across12 files passed. Focused remediation:
50 tests across6 files passed. Build passed. Final presubmit/lint receipts are
recorded in Plan0453 ledger. Full-suite green is not claimed; previous unchanged
ChatGPT baseline assertion remains documented. Initial HTTP file endpoint test
failed404, then passed after registration. CLI help runs exercise parser only.
Manual monitoring is explicitly user-authorized after Codex Wake issue319;
original2MM ceiling/deadline20:17:24Z remain, without stop-record mutation.


Final custody verification: a previously noted Bot cleanup error could lose its known target through the public wrapper. The reproducer returned targetId null before repair; the bounded repair wraps failures with the verified target and preserves it in sanitized public unknown outcomes. Fifteen Bot tests and19 focused service/HTTP/diagnostic tests pass. Final presubmit before this extra custody case:93 tests across13 files passed. Build passed; merged-main lint passes249 warnings18 infos. No resource/control records were altered under manual monitoring.

Final main integration verification:145 tests across6 files passed, including backend request admission/native continuation. Typecheck/lint passed with249warnings18infos. Additive testing-doc conflict preserved both Grok source qualification and backend cancellation proof.
