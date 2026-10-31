# Plan0473 — Listing custody and provider-call measurement

State: CLOSED
Owner: primary agent
Branch: research/chatgpt-list-call-counts-20261031
Target: origin/main
Base: 08b8e337b

## Current State

Complete: both reproduced defects are merged and the corrected installed runtime
is active. Source 5c4b54512b6170b9da71a2dab813c509da3a388e; PR526 merge
79a0be7e3c7efba4d9d591eaa553f55916ffc17f and PR527 merge
35c55ea5bdd3ed24d4900b2805b49ff8e5fee115. The final live concurrent pair delivered
the same five-row inventory to both callers through one observed provider
connection. Background request churn remains a separate efficiency target.
No provider cooldown/429-resolution claim is made.

Historical warm-up failed with target-owned. No lease was forcibly released,
no warning cleared, and no unchanged live retry was made. Private raw outputs
and custody evidence remain outside Git. The warm-up browser later exited with
unknown attribution; the subsequent retained browser survived final promotion.

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

## Installed candidate observations and second correction

Custody correction 8ffe234e6 merged in PR526 at
79a0be7e3c7efba4d9d591eaa553f55916ffc17f. Isolated candidate installation
matches all 650 compiled JavaScript files; global wrappers/API were not promoted.
One candidate listing returned five rows in 20.03s. Aggregate attached-backend
coverage observed 49 request events, 10 responses and 39 failures; 47 admission
attempts, 10 admitted and 37 rejected. The ledger reports local
minute-backend-request-limit denials; no provider cooldown/warning was recorded.
These counters exclude pre-attachment and non-backend traffic and are not HTTP
429 evidence or a complete provider-call count.

Two synchronized candidate processes shared one observed transport (1 versus 0
connections), but both rejected delivery with Browser generation changed during
shared conversation listing. The elected process observed 47 request events,
10 responses/37 failures, 34 admission attempts/11 admitted/23 rejected. No
successful concurrent inventory comparison is claimed. The private harness also
reported IPC already disconnected after saving results; that harness cleanup
error did not cause the service rejection. Guard duplicate disconnect in the
harness before any further run.

Second red: `pnpm vitest run tests/browser/sharedConversationListing.test.ts -t 'public ChatGPT service' --reporter=dot`
fails with the same generation-change error when only discovered target selection
changes during utility work. PID, endpoint, account and config remain fixed.
Bind the context target to the explicit portable request target, not whichever
service tab passive resolution currently selects. Keep browser birth/boot,
endpoint, account/configuration and explicit target dimensions intact.

No unchanged live retry is authorized by these results. Finish and qualify this
correction before another bounded concurrent observation.

Second correction green: 11 sharing/policy cases pass in 11.19s; scoped lint
and diff check pass. The first attempted edit did not alter the source (verified
by diff); its red run remains retained. A subsequent explicit patch landed and
the tests then passed. No forced-red mutation is being used as acceptance.

## Final acceptance and closeout

Corrected installed two-process run: both return five rows with identical private
inventory digests in 16.28/16.32s. Owner observes one connection; subscriber zero
connections and zero backend/admission events. Owner observes 52 backend events,
11 responses, 38 failures and three unresolved response events; 34 admission
attempts, 11 admitted and 23 rejected, zero pending admissions. These aggregate
counters cover only owned backend interception after attachment. They exclude
pre-attachment and non-backend requests and must not be interpreted as complete
network counts. Failed/unresolved response observations do not establish provider
failure or leaked active requests. The observed count differs from the earlier
single run, so no exact backend-request savings percentage is claimed. What is
proven: two callers share one physical observation and receive identical results.

Final installed prefix: user-runtime-list-generation-5c4b54512. All661compiled
files match the completed build. CLI0.1.1; fresh MCP initialization exposes65tools
and exits cleanly. Global wrappers promoted only after corrected live acceptance.
API restarted1466575to2124267 and resolves the final prefix. Status healthy;
/desktops and /console HTTP200. The exact23active completion IDs/states remain
paused, scheduler remains paused, config.json/api.env bytes unchanged. Scoped
Grok1156715 and ChatGPT2057773 PID birth identities survive promotion.

Validation: custody correction111focused cases, typecheck, scoped lint and full
build passed. After the generation correction, all11affected sharing/policy cases
pass; scoped lint, diff check and `pnpm exec tsc -p tsconfig.build.json` pass.
Static UI/vendor output was retained from the complete preceding build because
only the TypeScript key changed. Hosted CI skipped; local Linux/WSL Node25 build,
Node24 probe parent differ from any hosted runner. No hosted billing changes.
A bounded final diff check against08b8e337b found no additional accepted source
findings on the custody/generation objective. No delegation or extra review round.

The next bounded efficiency investigation should attribute background backend
routes and demand versus incidental bootstrap work. Do not increase limits or
infer 429 relief from deduplicated listing executions. Preserve the failed
warm-up, failed pair, fixture timeout and harness cleanup error as historical
observations rather than replacing them with the successful run.
