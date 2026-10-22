# Plan0445 — Developer-app readiness (#357)

State: VALIDATED
Branch: fix/issue357-plugin-readiness
Base: d28adfff7

## Current State

Fixture reproduces visible account-load failure being ignored while inventory
consumes its capacity allowance. No provider mutation or live browser probe.

## Scope and acceptance

Report observed main-page account-load errors promptly without shortening valid
capacity waits. Recognize the Plugins Add dropdown/combo; refresh at most once
when disabled, before opening/filling Create app, and revalidate account identity.
Never refresh/retry after submission. Preserve cancellation and existing blocking
surfaces. Provider-free public adapter fixtures establish failure, delayed success,
single recovery, persistent disabled and account mismatch boundaries.

## Delivery

Targeted tests, typecheck/build, scoped lint, primary review, PR integration.
Source acceptance is separate from installed/live proof. No provider creation,
provider prompt, browser closure or memory write authorized by this slice.

## Diagnosis and verification

Ranked hypotheses: (1) visible account-load failure is ignored while installed
network observation spends capacity allowance; (2) identity lookup itself stalls;
(3) delayed successful inventory is misclassified. The public fixture returns
identity immediately and still reproduces the stall; scoped DOM observation fixes
it while the existing 20-second delayed-success fixture remains green. This
qualifies the source failure pattern, not the historical provider-side cause.
The disabled Add fixture reached form input without any refresh before the fix.

91 focused tests across five suites pass serially; typecheck/build/scoped Biome
and diff checks pass. One earlier concurrent lifecycle run timed out on manual
approval; isolated and final serial runs pass unchanged. New fixtures cover a
10-second stalled DOM probe bound and no retained timers. No live/browser/create
or installed acceptance is claimed; active runtime remains issue226-readiness.

Primary review fixed point: d28adfff7; governing spec: #357 plus user-authorized
one-refresh disabled Add recovery. Standards: provider-local helpers reuse bounded
CDP/trusted pointer seams, no generic service change or retry abstraction.
Accepted review finding: selector suppresses label matching in trusted pointer;
mark the exact unique observed control. Spec: account failure is prompt without
shortening capacity wait; before/after identity, readiness and blocking checks
fence recovery before form input; persistent/ambiguous/unknown states stop. No
accepted blocker remains. Both review axes performed by primary, no delegation.
