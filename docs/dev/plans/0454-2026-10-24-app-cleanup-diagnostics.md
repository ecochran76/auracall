# Plan0454 — App cleanup failure diagnostics

State: OPEN
Branch: fix/app-cleanup-diagnostics
Target: main
Owner: ecochran76
Base: 2d82d97d0
Work item: Plan0454 (operator-approved diagnostic slice)

## Current State

Nested cause projection and actual CLI routing pass 60 focused tests. Build and
compiled qualification remain. The historical intermittent cleanup cause is unknown.

## Scope and acceptance

App operation failure receipts retain bounded sanitized cause/aggregate leaves
on JSON and text CLI surfaces, accurate action/status, nonzero exit and existing
cleanup/retry uncertainty. Preserve original Error objects. Prove red/green at
the actual CLI catch and formatter seams, redaction of credentials/URLs/email,
cycle/size bounds, typecheck/build and compiled fixture acceptance.

No provider operations, inventory replay, warning clearance, cleanup suppression
or claim to repair the historical intermittent transport failure.

Done when the qualified change is committed, integrated and its installed CLI
formatter passes provider-free nested-error qualification.
