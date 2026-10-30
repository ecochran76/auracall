# Explicit pre-effect Connector target continuation

State: OPEN
Lane: PL-GROK
Branch: fix/connector-pre-effect-target
Base: be2344da0db668323ec9a0511c38c3efa67a8998
Target: main
Integration: PR; no automatic merge or global runtime install

## Current State

A confirmed installation can already continue one recorded unsupported endpoint observation with a durable one-shot claim. It always selects the old target. A correctly owned fresh context cannot be selected even when the journal positively proves Add was never dispatched. This packet adds an explicit expected-old/new target selector only for that existing supported pre-effect continuation.

## Scope and acceptance

The public installation-service seam must preserve operation/account/profile/input identity and the continuation claim. Explicit expected-old target must match; current unknown or dispatched effects cannot retarget. Resolve the new target through the same configured session resolver, governor and account checks before preserving target lineage. No private journal editing, intent replacement, peer navigation, duplicate-guard bypass, new Add replay or global runtime change. Only the programmatic service API is extended; transport UI/CLI flags are unchanged.

Own src/browser/grokConnectorInstallationService.ts and its service tests, plus focused operator/API evidence. Work in an isolated branch; unrelated active worktrees remain untouched. One vertical regression first demonstrates stale target selection, then the minimal change; negative tests cover unqualified and concurrent continuations. Existing provider-free test harness, typecheck and relevant style checks apply. Native qualification remains separately bounded by the calling project's authority.

## Validation and API contract

Use `install({...request, confirm: true, preEffectTarget: {expectedPreviousTargetId, targetId}})` only for the same canonical intent after `grok_connector_install_existing_endpoint_unobserved`, with journaled `effectDispatched: false` and `retrySafe: true`. The expected previous target must match the journal. Supply the existing exact-target session resolver; the service checks target attribution and the original provider account before preparing and committing in one lifecycle. Do not pre-open a form: prepared tokens belong to one client instance. Subsequent reconciliation omits this selector and follows the newly recorded target.

A missing intent, stale previous target, unknown outcome or dispatched Add cannot use this route. The existing durable continuation claim allows one contender; it is not a general retry or retarget API. The private journal preserves previous target/result lineage.

Regression: `pnpm vitest run tests/browser/grok405InstallationService.test.ts -t 'explicitly fenced fresh target' --maxWorkers=1` failed on stale target selection before implementation, then passed. The three focused installation/service/native-binding files pass 31 tests; `pnpm run typecheck` passes. No installed runtime promotion or native Add is claimed by these source checks.

## Revision: bounded form readiness and explicit recovery

Native single continuation reached its verified fresh target and opened the custom form but returned custom_form_unverified before any Add. Later exact read-only predicates pass and fields remain blank; historical timing attribution is unproven. A delayed-mount public-client fixture reproduces this failure pattern RED. The client now observes readiness for at most1500ms before one fill; it never repeats the opener or retries failed value readback. Missing, ambiguous and foreign form fixtures preserve no-fill/no-Add.

The original .continuation claim is immutable. An explicitly selected preEffectTarget.reason='form-readiness' accepts only a recorded unsupported custom_form_unverified with effectDispatched=false and retrySafe=true, expected previous target and the same canonical input/account/runtime profile/operation. A separate fixed .form-readiness wx/fsync claim permits one contender on a verified fresh target, preserving previous target/result lineage. Ordinary install never selects this recovery. Unknown or dispatched outcomes remain ineligible. No journal deletion, replacement intent or additional Add authority. This explicitly extends the earlier source-only packet for the caller's existing single-Add acceptance boundary, without global installation.

RED: public delayed-form preparation returned unsupported; public service separate-fence recovery returned no successful result. GREEN commands use the existing installation/client/service/native-binding test selection.
