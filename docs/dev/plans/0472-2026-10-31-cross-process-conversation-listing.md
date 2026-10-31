# Plan0472 — Cross-process in-flight ChatGPT conversation listing

State: CLOSED
Owner: primary agent
Branch: feat/chatgpt-cross-process-listing
Target: origin/main
Base: ed3ec65fc

## Current State

PR524 merged at33e5df84d6d4e021372f0a4451d6b63352c43f1b. User-authorized
installation/activation is accepted on the immutable
user-runtime-shared-list-d4736f476 prefix, source d4736f476c0ec6e04ef8f807941ecd389026dbc3.
All661compiled files match;10installed coordinator/policy checks pass, including
real child processes and the public service seam. Fresh MCP initializes65tools
and exits0; CLI0.1.1; API1466575serves status/desktops/console200. The native
browser generation observed before promotion is preserved, as are scheduler
pause,23paused completion identities/states and config/environment bytes. Only
API restarted25612to1466575. No browser restart, provider prompt or live HTTP/
429causal proof. Existing custom traffic/custody/session/callback policies remain
independent; installed eligibility is not universal cross-workflow sharing.

## Historical source checkpoint before authorized deployment

Operator chose sharing across separate agent and CLI processes. Source coordinator,
service integration, local validation and one bounded review are complete.
No installation, provider call, browser action, infrastructure daemon or hostedCI.

## Objective and contract

Equivalent overlapping Linux/WSL ChatgptService.listConversations calls share one
physical listing, rather than one promise per service instance. The elected caller
runs the normal authorized/governed listing using a dedicated operation signal.
Each subscriber cancels independently. The last subscriber's departure aborts
the operation. Owner process death fails current subscribers explicitly without
automatic provider retry; a subsequent new request can elect a new owner.

Private authenticated Linux abstract sockets supply atomic kernel election and
vanish on process death. The coordinator is transient, not an installed daemon.
Mutual nonce/HMAC authentication uses an atomically published0600secret within
an owner-only0700directory under the existing AuraCall home. No conversation data,
credentials, config or response/error payloads are written to disk. Auth handshakes
are5s bounded; wire frames/results are8MiB bounded. Nothing serves settled results
as a reusable cache. Local and remote subscribers receive independent JSON values.

## Equivalence and authority

The key binds exact serializable runtime configuration, account expectation,
managed browser directory, browser profile, browser PID birth/boot generation,
DevTools endpoint/target, root/project request, history limit/since and navigation
policy. The immutable runtime module path/source hash namespaces implementations.
Keys are hashes, never raw configuration. Missing positive account/generation
provenance, nonportable config or unsupported OS follows the existing path.
Local generation resolution is passive (ensurePort:false), precedes joining,
and is rechecked before delivery. Cold starts follow the original independent
launch path rather than starting browsers to qualify sharing.
Only the elected operation makes its normal fresh provider identity check; a
shared list does not invent a fresh proof for a separate operation or cache identity.

Caller-provided traffic plans, governors, custody, retained provider sessions,
audit callbacks and observation callbacks keep the independent path. They cannot
be silently borrowed by another workload. Generated service options are marked
with an enumerable symbol that survives CLI spreads; only unchanged generated
objects may be stripped/rebuilt with the shared operation's own cancellation.
Overrides of those objects disable sharing. This deliberately limits eligibility:
custom account-mirror traffic-plan calls are not made equivalent by this packet.
No claim that every concurrent mirror/CLI request can share or that live429s stop.

## Scope boundaries

No provider-wide limit increase, retry expansion, durable result cache, new daemon,
authentication weakening, profile takeover, warning clearance, browser restart,
Windows coordinator or target lease bypass. Already-issued browser commands cannot
be undone. A slow/failed owning transport returns failure rather than starting a
second provider request on behalf of an admitted subscriber.

## TDD and validation

Initial public coordinator implementation ran each caller independently. The real
child-process overlap test failed with2provider-start effects rather than1. Kernel
socket election and in-flight subscription made it green. The same test proves a
later call starts fresh. Other public coordinator contracts cover cancelling leader
and follower, distinct keys, owner death/no retry, all-caller cancellation and clean
re-election. A fixture IPC disconnect initially prevented releasing retained work
after the leader caller cancelled; unref the fixture IPC channel while retaining
its server fixes the harness, not production semantics.

Domain-key/policy tests cover generated option spreads, custom policy exclusion,
request/account/generation isolation and missing provenance. Existing public service,
pagination, recovery, context and request-admission suites are selected as adjacent
checks. Tests simulate provider operations; no live rate limit or HTTP savings
claim follows. Commands/results and material hosted-environment differences are
recorded in the final validation receipt.

## Acceptance

- Real child processes perform one synthetic provider operation for equivalent overlap.
- Cancellation and process death preserve the stated independent/failure contracts.
- Scope/key controls prevent sharing across different authority/coverage policies.
- No persisted response cache or installed daemon.
- Local selected tests, full typecheck/build and scoped lint pass; one bounded review.
- Source commit/push and docs record eligibility and installed/live limits.


## Review and local validation — source only

Frozen base ed3ec65fcdcbb431a3aec096e347463a852d7e60, staged source packet;
one primary serial review. Standards: AGENTS.md, CONTEXT.md, code-discovery and
runtime-proof docs, policies0008/0018/0029 and code-review smell baseline;0accepted
findings. Spec: this contract and the operator's cross-process decision;1accepted
P2finding: eligibility preflight could request a browser launch. Public service
regression observed [true,false] instead of [false,false]; passive resolution
repairs it. Closed-world validation only after adjudication, no second discovery.

- Initial selected provider-free7files:156passed in84.47s, including backend-request
  admission, context, service, pagination and recovery. This is a focused selection,
  not the comprehensive suite; the backend-admission cases dominate its duration.
- Final changed coordinator/policy selection:10passed in2files,7.88s; includes the
  two additional service/failure cases and passive-preflight regression. The
  unchanged adjacent suites were not repeated merely to increase the count.
- Full pnpm exec tsc --noEmit and pnpm run build both pass on restored final
  source; final receipts retain terminal outcomes.
- Scoped biome lint and changed-file format checks pass; diff check passes.
- Service dispatch sensitivity probe deliberately bypassed only sharing dispatch,
  recorded the changed hash, saw the public regression fail, then restored exact
  original bytes. A typecheck mistakenly overlapped that temporary bypass and
  reported lost null narrowing; it is invalid harness-state evidence, retained
  privately. Restored-source typecheck is the acceptance check.

Commands/logs are held in the user-scoped auracall-shared-listing-20261031 receipt
root. Local environment: Linux/WSL, Node24.18.0, pnpm/Vitest, single worker, no live
provider calls, external browser operations represented by synthetic fixtures.
HostedGitHubCI is skipped under operator cost policy. Local passes satisfy CI
validation; hosted platform matrices, installed integration and real HTTP/429
qualification remain unexecuted. No merge, deployment or runtime restart follows
from this source closeout.


## Installed qualification — 2026-10-31

Current-main composition adds Grok research docs only; the lone journal conflict
preserves both histories. Source production inputs remain identical to the
reviewed implementation. Production build and installer/runtime contract pass.
The installed compiled modules execute with private synthetic fixture requests;
no managed browser operation or real provider traffic is generated by the tests.
The first installed-fixture run failed8coordinator cases before the child could
start: a private .ts fixture outside the repository ESM package was compiled as
CommonJS and rejected top-level await. Explicit .mts preserves its original ESM
contract; all10cases then pass with no production package edit. Both first failure
and corrected acceptance remain in private receipts. This is a harness correction,
not a flaky production pass-on-retry.

All661compiled files match the qualified build. The previous prefix/wrappers
remain available for rollback. Current baseline has1native browser parent, not
the historical4; the exact observed process birth survives promotion. Local
Linux/WSL Node24.18.0validation substitutes for hostedCI under cost policy.
No claim that observed live rate limits are resolved. Next bounded qualification
is real request-category accounting for equivalent concurrent listings; distinct
mirror traffic plans remain deliberately independent.
