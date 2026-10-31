# Plan0475 — Concurrent 50-row history listing qualification

State: OPEN
Owner: primary agent
Branch: research/chatgpt-list50
Target: origin/main
Base: a7ce692ba

## Current State

The paired live observation proves sharing and subscriber cancellation but does
not qualify50-row delivery: both callers returned matching9unique rows. The
instrumented follow-up identified real paging10to39, two failed native history
XHRs and local admission rejection. A provider-free public adapter regression
then established a specific defect: a known exhausted backend governor was ignored
while the pager still needed rows. Source correction and typed cross-process
error propagation are implemented; local validation is complete; installed qualification remains.

## Bounded objective and acceptance

Run two overlapping public ChatgptService.listConversations calls, each requesting
history limit50, on AuraCall runtime profile/browser profile wsl-chrome-3.
Require identical50-row inventories with50unique IDs and one observed owned
provider connection. Measure aggregate attached-backend route-family events,
admission rejections and elapsed time. Raw rows/configuration/credentials stay
out of artifacts and Git; inventory equality uses only a private digest.

A temporary authenticated coordinator subscriber joins that same active observation,
then cancels immediately after follower acknowledgment. Its callback refuses to
start provider work. This tests cancellation of a waiting subscriber without
issuing another provider operation; it is not a separate service-level identity
or browser cancellation test. Retain the owner process until surviving callers
receive their results, so the harness does not turn caller cancellation into
owner process death. Existing provider-free pager/cancellation fixtures supplement
the live observation.

## Bounds and hard stops

One live paired listing, no automatic replay. Stop on cooldown, identity/human
verification/ownership failures or missing positive browser generation. Keep
limits, configuration, scheduler pause and completions unchanged. No prompts,
provider mutation, browser restart, lease override, warning clear or other-agent
work. Coverage excludes pre-attachment/non-backend/authentication traffic. A low
row count is an acceptance failure requiring diagnosis, not proof of an empty
or complete provider account. No hosted CI or deployment unless a proven defect
requires a separately qualified correction within this objective.

## Live evidence and missing proof

First run: matching keys and private inventory digests; owner9unique rows in
97.27s, follower9unique rows in10.38s,1/0owned connections. Zero attached backend
events/rejections. The temporary authenticated follower cancelled in0.83ms and
both service callers completed. Roughly87s elapsed before the follower was started
at the owner's owned-backend attachment; the cause of that pre-attachment delay
is not established. No claim that9rows exhausts current provider history.

Local mirror count376has lastSuccessAt2026-10-18T21:33:17.847Z; it is stale, not
fresh provider count authority. A bounded exact-target DOM inspection failed:
Chrome could not resolve its WebSocket target. Later registry evidence identifies
the settled test lease as released/already-missing; browser PID/port still match.
No fallback to another target and no lease override. Capture evidence in-flight
instead of relying on a retained tab surviving a later inspection.

One changed-instrumentation follow-up was admitted to resolve this gap: a solo
history-limit50operation with passive Runtime.evaluate tracing and a1.5s bounded
DOM/cache-count snapshot before normal connection close. No new fetch/click/scroll
was introduced by instrumentation; source paging still drives its normal scrolls.
The overall physical-observation bound is2(one paired, one instrumented), not an
unbounded replay. The trace found39unique rows in24.91s,1.88s before attachment,
57backend events,30responses/27failures,57admissions/30admitted/27rejected. Two
/conversations GETs failed; local quota errors and cleanup cancellation are not
HTTP429proof. History observations grew10,15,20,25,30,35,39; later reads remained39.
The owned DOM showed an auto-scrolling DIV at its bottom and39conversation links.
One globally visible Show more control was not qualified as history-specific and
was not clicked. No further provider probes are part of this packet.

## Source regression and narrow correction

Public createChatgptAdapter seam, external DOM transport fixture, real public
createProviderTrafficGovernor rejection. The fixture models an asynchronous native
request denial by freezing the actual governor during an existing DOM read; its
read/action view is supplied to the adapter (native Fetch is not emitted by this
fixture). Original command:
`pnpm vitest run tests/browser/chatgptConversationPagination.test.ts -t 'history that still needs rows' --reporter=dot`
returned partial rows with no error. The smallest state check made it green.
Expanded cases showed red at final-read, scroll and sleep boundaries; corresponding
state checks made them green. A fulfilled limit still succeeds.

A real two-child-process coordinator regression showed the follower losing the
backend-budget classification. Only errors already accepted by the existing
isKnownBackendRequestBudgetDenial predicate get a typed wire tag/reconstruction;
other failures keep existing serialization. No generic error-classification or
unknown-effect policy is relaxed. No automatic provider retry or limit change.

The first four-file default-parallel validation timed out one child-process test
at5s. The focused test passes under the documented --maxWorkers=1 setting; serial
presubmit subsequently passed all 124 cases (5 files, 109.55s). Preserve that timeout as a harness/resource uncertainty,
not a passing retry. Typecheck and scoped lint (adapter size allowance3MB) pass.
Private observer scripts remain diagnostic artifacts outside Git.


## Local validation and fixture budget decision

Blocking presubmit selection (serial):
`pnpm vitest run tests/browser/chatgptConversationPagination.test.ts tests/browser/chatgptConversationListRecovery.test.ts tests/browser/sharedConversationListing.test.ts tests/browser/conversationListSharingPolicy.test.ts tests/browser/backendRequestAdmission.test.ts --maxWorkers=1 --reporter=dot`
passed 124/124. This is a selected local lane, not the comprehensive suite.
The initial serial run had 118 passes and six failures (timeouts and subsequent
fixture assertions). A pristine-production control reproduced the retained-timeout
failure and following teardown assertion. Raising only the two retained-session
fixture matrix deadlines to 15 seconds made that pristine control pass, then the
complete selected lane passed. No production deadlines or assertions changed.
The fixture covers real socket draining with independently bounded three-second
closes; retaining this distinct custody risk warrants explicit harness headroom.
Owner: primary maintainer; review this fixture budget by 2026-11-07. No quarantine,
waiver or hidden retry. The earlier parallel timeout remains recorded above.

Deployment must preserve the active attachment-admission/native diagnostic fixes.
The packet-specific runtime assembly verifies the active history/coordinator hashes,
replaces only the compiled history function/import and coordinator, and verifies
all other compiled bytes are unchanged. Full 50-row live acceptance remains open;
no additional provider probes are authorized by this packet.

Full `pnpm run build` passed (TypeScript, both Vite apps, vendor/config assets).
`pnpm run typecheck` and six-file scoped Biome lint with the 3MB adapter
allowance passed. Hosted CI skipped under operator cost policy.
