# Plan0474 — ChatGPT listing request attribution

State: OPEN
Owner: primary agent
Branch: research/chatgpt-list-traffic
Target: origin/main
Base: d17220fba

## Current State

Prior Plan0473 proved two callers share one listing, but observed 52 attached
backend events and 23 local admission rejections. Those aggregate counts do not
identify the endpoints, initiating actions or whether traffic is avoidable.
This packet begins with attribution, not a presupposed implementation fix.

## Scope and acceptance

Use existing installed source5c4b54512 and one read-only listing (history limit5)
with passive aggregate diagnostics. Keep raw evidence private, save no inventory,
credentials, URLs or arbitrary initiator stacks. Fixed route-family labels and
hashed unknown paths, method/resource/initiator enums are sufficient for the
first measurement. Passive subscriptions add no browser/network commands.
Do not change limits, force ownership, clear warnings or repeat a failed probe.
Establish a narrow local feedback loop for a measured avoidable call pattern,
then rank falsifiable hypotheses, fix with a regression and validate locally.
If evidence shows normal required traffic or a missing proof boundary instead,
record that outcome without inventing a regression.

## Evidence and non-goals

Private aggregate probe artifacts live outside Git under the user state directory.
No full network/provider count or causal429claim: coverage starts after attachment
and excludes non-backend traffic. No hosted CI, provider prompts, desktop takeover,
account changes, active workflow resume, broad browser cleanup or other-agent work.

## Measured feedback loop

Installed5c4b54512 probe returned five rows in33.03s:43attached backend events,
1response/42failures;32admission attempts,1admitted/31rejected. Observed requests
were script XHRs: accounts3, models2, me2, settings3, app/connectors3, files1,
system hints2 and other route families. No /conversations endpoint was observed.
This identifies page initialization/retry traffic, not repeated explicit inventory
fetches. A blocked POST in the conversation route family was also observed;
route-family classification does not establish a prompt or a completed effect.
No raw route or payload is retained in Git.

Public seam: runConfiguredChatgptUtilityOperation with the real file-backed registry
under two distinct process-owner identities and external target-operation fixtures.
The first in-memory attempt incorrectly represented both processes as one owner
and hit a different fence; it is not the red proof. Corrected red:
`pnpm vitest run tests/browser/configuredChatgptUtilityAffinity.production.test.ts -t 'read-only listing reuses' --reporter=dot`
returned fresh-root instead of retained-root. After implementation, the core
regression passed in65ms. Expanded final command uses `-t 'listing target reuse'`.
It proves avoidable target creation; real HTTP savings remain a live boundary.

Ranked predictions: stale-process target admission recreates a page despite a
settled retained target; adapter reloads existing pages; page retries occur without
new page creation. The utility-only fixture isolates the first cause. Narrow reuse
restores the retained target before the adapter runs; no limiter changes.

37focused cases across production utility, public service, sharing and policy pass.
A negative fixture initially used inconsistent owner-liveness functions in its
registry and reconciler; correcting both removed the misleading alive-owner
result. Keep this fixture failure distinct from source behavior. Custody/back-end
regressions and type checking are in progress. No deployment yet.

Source validation:37focused service/sharing/production cases plus110utility and
backend-admission cases pass; typecheck and scoped Biome lint pass. The110case
custody lane took70.94s. No hosted CI. Full build is running. A bounded source
review retains the narrow dead-process, exact tenant/route, known-effect and TTL
admission requirements; no limiter changes or generic pooling are introduced.
