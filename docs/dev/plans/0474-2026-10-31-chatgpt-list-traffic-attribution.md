# Plan0474 — ChatGPT listing request attribution

State: CLOSED
Owner: primary agent
Branch: research/chatgpt-list-traffic
Target: origin/main
Base: d17220fba

## Current State

Complete: source46a31c14580926484b4acacf8ebd8e2a7675ef0b merged through PR529 at
9ba492bb03e678a0e71cafbeb70b650f0a729565 and is active in a qualified runtime
assembly preserving the other agent's native-lock diagnostics. Same-candidate
live observations show five rows in20.39s with40attached backend events and32local
rejections on initial page creation; a later process reuses the same physical tab
and returns five rows in4.64s with zero attached backend events/admission attempts.
No broad provider-call or429-relief claim. Exact acceptance appears below.

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

## Installed acceptance and runtime custody

The active runtime changed during this packet to native-lock source4ddb39e91,
owned by the other agent. Do not replace it with an older full build. The isolated
candidate copies that installed runtime and replaces exactly two compiled modules
from46a31c145: configuredChatgptUtilityAffinity.js and chatgptService.js. All other
compiled files remain byte-identical to the active native-lock base;661compiled
files total. This is an explicit composite assembly, not a claim that all deployed
files derive from one source commit. User-scoped assembly metadata records both
inputs. An initial prefix-parent assertion prevented assembly before any copy;
the corrected locator was then verified. No provider action occurred in that
failed preparation step.

Desktop runtime contract PASS. Fresh MCP initializes65tools and closes cleanly;
CLI0.1.1. Full source build, typecheck, scoped lint, diff check and147selected tests
pass. Build/probe Node24.18.0; installed API Node25.9.0; Linux/WSL local checks
replace hosted CI. No hosted billing/capacity changes. Private passive observer
scripts are retained as diagnostic evidence outside Git; no temporary debug
instrumentation was added to production diagnostics.

Two sequential candidate processes exercised the public service and real provider:

| Observation | Rows | Elapsed | Attached backend events | Local admission rejections |
| --- | ---: | ---: | ---: | ---: |
| Initial listing/new target | 5 | 20.39s | 40 | 32 |
| Later process/retained target | 5 | 4.64s | 0 | 0 |

Lease readback confirms the same hashed target identity: previous settled lease
released as preserved; new settled idle lease records one adoption and zero
creations. First-run response observations:0responses/40failures,32admission
attempts/0admitted. These failures include local cancellation and denial and are
not provider429evidence. The comparison is one bounded pair, not a latency SLA.
Counters exclude pre-attachment/non-backend traffic and authentication/session
reads; zero observed backend events does not mean zero provider calls. Reuse
reads the current retained DOM and still verifies account identity, without an
implicit full page refresh or a new disk inventory cache. Cold/expired/missing
pages can still incur normal bootstrap traffic; current limits stay unchanged.

Promoted only after live acceptance and an unchanged-active-wrapper check.
API restarted2406461to2711942; status healthy; /desktops and /console HTTP200.
All23active completion IDs/states remain paused, scheduler paused, config.json
and api.env hashes unchanged. Scoped Grok1156715 and ChatGPT2647408 process births
survive promotion. Runtime prefix user-runtime-list-reuse-46a31c145 preserves the
native-lock base. Raw receipts and metadata remain in user-scoped state.

A bounded final source review found no additional accepted blocking findings on
this packet. The next distinct performance boundary is cold-start/expired-tab
bootstrap and larger history pagination; this packet does not expand those probes.
