# Plan0454 — App cleanup failure diagnostics

State: CLOSED
Branch: fix/app-cleanup-diagnostics
Target: main
Owner: ecochran76
Base: 2d82d97d0
Work item: Plan0454 (operator-approved diagnostic slice)

## Current State

PR434 merged569f4b907. Source4c9b4985c passes60 focused CLI tests, full
typecheck/build, scoped lint and compiled fixture. A fresh user CLI runtime
passes the actual compiled CLI catch/formatter fixture with zero provider calls;
its adopted wrapper and installed module bytes are verified. MCP/API adoption
was outside this CLI slice. Historical intermittent transport causality remains
unconfirmed; no live browser loop was run.

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
