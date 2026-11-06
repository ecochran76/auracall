# Plan0481 — Install inventory preflight fix and qualify before submission

State: CLOSED
Outcome: INSTALLED_NATIVE_PREFLIGHT_QUALIFIED
Owner: primary agent
Branch: fix/developer-app-composer-refresh
Source: 30129698bc86e0f1a01174940e246882f3667d97 / PR535
Authority: operator ok go after the narrow installation and fenced qualification proposal

## Current State

Installed user-runtime-app-preflight-30129698b. Exactly one of661runtime artifact
files differs from the prior readiness runtime: the CLI submitted-test inventory
options. All47CLI tests pass against the actual compiled candidate (12.15s), using
synthetic external adapters and the exact installed dependency graph. Temporary
canary source/config retained privately outside Git. Source57tests/typecheck were
qualified in Plan0480; no hosted CI runs.

Fresh CLI0.1.1, stdio MCP65tools and API408005healthy. The initial immediate API
probe hit a connection timeout during startup; later readiness and final readbacks
pass. Same23active completion IDs/statuses paused, zero running/queued and idle
foreground. Configuration/env hashes and both browser process generations retained:
ChatGPT275110/start2074859; Grok1156715/start866957. No browser restart or closure.

## Bounded scope and acceptance

Copy the current immutable app-readiness runtime into a new immutable prefix.
Change only the submitted-test CLI inventory read to the source-qualified API
options; preserve every other runtime byte and all existing overlays. Run compiled
CLI regressions before adopting. Back up launcher bytes, record artifact and config
hashes, atomically repoint CLI/MCP and restart only the existing API service with
KillMode=process. Retain the prior prefix for rollback. Verify fresh CLI/MCP/API
identity and unchanged browser generations, configuration, completion IDs/states
and paused scheduler. Stop before adoption if work or identity changes conflict.

Run one bounded actual installed public CLI preflight with the real authenticated
adapter and real utility settlement. Intercept submitTest at the adapter boundary
and throw a distinctive fence before app selection, prompt input or Send. Do not
fake account or inventory. Reaching that fence proves preflight, not submission or
tool invocation. No refresh replay, project/sharing/OAuth changes, scheduler resume,
foreign browser closure, desktop ownership override or arbitrary new native prompt.

## Definition of done

Record assembly comparison, compiled checks, fresh installed identities and exact
native fenced outcome. Keep raw evidence private. Close this packet for installed
preflight qualification or the precise refusal; native prompt acceptance is a
separate boundary. No second broad review. Single serialized critical-path owner;
no delegated or parallel provider actions.

## Actual fenced qualification

The actual installed runChatgptDeveloperAppOperationForCli used the real browser
factory, adapter, authentication and inventory. A bound proxy intercepted only the
submission boundary and prohibited mutation methods. One actual API read returned
complete inventory; normal account/app validation and utility settlement then
reached the submitTest sentinel in40625ms. Exact sentinel identity, one inventory
read and one boundary call establish preflight qualification. Zero actual
submitTest implementations, app selections, prompt input, Send or project tools
were invoked. The progress label developer-mode still appears but is not evidence
of a UI observation; actual options were includeDeveloperMode:false and
inventoryTransport:api. No deadline was increased or default provider guard removed.

Native process417162exited. A690second process-identity-bound diagnostic monitor
was installed for bounded observation, but the command completed normally before
its deadline. Exact-self persistent background_saved/background completion wake
was armed through MCP and cancelled after manual result consumption. CLI wake
registration refused unverified permission identity; no permission override was
attempted. No pending wake is needed for this completed packet.

Private evidence root: ~/.local/state/auracall-composer-refresh-20261101/.
preflight-assembly.private.json binds source/module/config/launcher hashes;
preflight-acceptance.private.json records final verified installed state;
native-preflight-inventory.private.json and native-preflight-result.private.json
retain actual inventory and fenced result. Baseline readiness prefix and launcher
bytes retained for rollback. Full native prompt-and-tool acceptance remains a
separate unqualified boundary. The original uncertain refresh remains unreplayed.
