# Plan0473 — Listing custody and provider-call measurement

State: OPEN
Owner: primary agent
Branch: research/chatgpt-list-call-counts-20261031
Target: origin/main
Base: 08b8e337b

## Current State

The authorized read-only warm-up on installed source d4736f476 failed before
inventory delivery with `Provider traffic lease reservation failed: target-owned`.
No solo/concurrent call-count comparison has run. Private command outputs and
custody metadata remain outside Git. No lease was forcibly released, no warning
cleared and no provider retry made.

## Objective and scope

Unblock the bounded comparison of one ChatGPT listing with overlapping equivalent
listings. Repair only the reproduced generated-target custody defect first.
Preserve explicit caller targets, custom custody, cancellation, account boundaries,
provider pacing and retained browser processes. Do not claim provider-call savings
from synthetic observations or equate source tests with installed acceptance.

## Diagnosis and acceptance

Public seam: ChatgptService.buildListOptions followed by listConversations, matching
CLI option spreads. Real utility acquisition/settlement, registry, traffic authority
and provider adapter remain; only Chrome transport/target operations are simulated.
A prior utility leaves a retained tab. Generated options select that tab and the
sharing request treats it as explicit custody, bypassing utility admission. A new
provider authority then attempts a conflicting reservation.

Red: `pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t 'listing with generated options' --reporter=dot`
on pristine policy rejects with target-owned instead of reaching the fixture
identity sentinel. The same test with the correction reaches the sentinel in
267ms. An initial full-list fixture attempt timed out because listing DOM was
not modeled; the final test deliberately ends at identity to isolate custody.
It does not prove a full listing or real identity/provider acceptance.

Ranked predictions: generated discovered target preservation (removing only its
request target restores utility admission); live custody stripping (retaining its
governor would restore admission); invalid utility settlement (ordinary utility
re-entry would still fail). The first probe restores admission without changing
governors or lease settlement. Exact caller targets remain in the request.

## Remaining gates

111 focused custody/sharing cases pass; typecheck and scoped Biome lint pass.
The local focused run took 90.02s. No hosted CI. Complete build and bounded diff
review remain; source
integration and installation qualification if checks pass. Then resume the bounded
live measurement after current ownership and provider readiness are qualified.
Record actual counts or the exact remaining gate. Hosted GitHub CI is skipped.
