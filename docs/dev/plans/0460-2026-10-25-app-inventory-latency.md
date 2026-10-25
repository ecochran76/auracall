# Plan0460 — App inventory latency

State: OPEN
Branch: fix/issue464-ledger-snapshot-reuse
Target: main
Work item: ecochran76/auracall#464
Base: 97b49ced127f6a48c72487c4df0514e6e6651538

## Current State

Issue427 diagnostics are deployed. A source-native complete30-app inventory took
347.649s; its delay cause remains unqualified. Live read-only inspection of five
existing Apps tabs found three healthy pages and two failure pages. One main
Plugins panel visibly says Failed to load plugins / signal timed out / Retry.
Read-only DOM and screenshot capture took481ms on that tab. Peer tabs and browser
were preserved. The first browser-tools invocation stalled; its owned helper
processes were stopped, and exact-target CDP read-only inspection succeeded.

## Scope and acceptance

Compare live Apps UI with the inventory adapter and measure the slow boundary.
Establish a fast real-adapter reproducer before changing behavior. Preserve
complete successful inventory and distinguish visible terminal page failure
from active loading, hidden text and unrelated sidebar failures. Explain what
is proven separately from the historical347.649s delay. A successful-run speedup
requires before/after measurements; failure detection alone does not prove it.

No prompts, app CRUD, browser restarts, deadline reduction, capacity bypass,
ledger/history pruning, CI, unrelated Grok edits or broad architectural work.
One serialized live inventory probe if needed; existing retained evidence first.
Raw DOM/screenshots/account data remain outside Git in private issue state.

## Diagnosis track

The actual adapter navigates Plugins for installed response, then Home for
linked metadata; no per-app detail loop was found. Its waiting poll recognizes
account-load errors but not the observed Plugins failure. A real-adapter fixture
using observed main-panel text now tests prompt termination of that failed read.
This is a candidate contributor to wasted waiting, not attribution of the
previous successful long run. Next: qualify red fixture, ranked predictions,
one-variable tests, bounded remedy and regression validation if supported.

## Qualified failed-page finding

Red: `pnpm vitest run tests/browser/chatgptDeveloperAppReadiness.test.ts -t
'inventory account failure' --maxWorkers=1` failed one observed Plugins case:
expected developer_app_inventory_load_error, received still waiting; five controls
passed. Test bodies52ms. The minimized real adapter keeps identity/attachment,
actual DOM probe, network listeners and virtual time; no provider call is made.
The error wording is the only changed input. Ranked checks: missing failure
recognition predicts prompt termination after the fix; hidden/sidebar-only text
must remain nonblocking; a separate cause may explain successful long reads.

The patched source guard was also run read-only against the exact retained failed
page. Old source returned without detecting failure in97ms; patched source
reported developer_app_inventory_load_error in20ms. Focused readiness, inventory
and navigation-budget tests pass27checks. Primary Standards/Spec review found no
blocking change; renamed the shared helper to reflect inventory scope. This
finding improves failed reads, not successful inventory latency.

One installed unmodified baseline read completed with existing debug stage
messages and unchanged budgets. Its private process identity is retained. A10s
CPU sample of only that owned CLI process was requested to distinguish frontend
waiting from local computation. No browser process was restarted or profiled.

The installed baseline exited0 with complete26-app inventory in321.643s. A10s
CPU sample during its inventory stage attributed about25percent to ledger
load/persist,16percent to GC and34percent idle. Counts/environment differ from
the earlier30-app run, and profiling perturbs timing; these are not a controlled
before/after comparison. The file ledger reloads a full snapshot for each locked
batch and serializes full history for mutations. This is a measured performance
lead, not attribution of the whole delay. In particular usage summaries can
expire reservations, so simply making them non-persistent would lose effects.
No ledger cache, history pruning, admission bypass or speculative optimization
was made. Source/fixture failed-page checks and typecheck/build passed. Full
successful-read latency remains OPEN and issue464 must not close with this patch.

Final source validation:34tests across readiness, inventory, navigation budget
and CLI failure diagnostics pass. Typecheck, build, scoped test lint, docs:list
and diff checks pass. Standards review: no blocking findings; shared probe name
updated for its scope. Spec review: qualified failed-page termination; successful
latency criterion remains open. No CI run was requested or performed.

## Failed-page deployment checkpoint

PR465 merged at46e1306c29fb1ba50f5126b10e054f7aed14d8ab. Installed CLI and
adapter bytes match the built source. The installed compiled guard was evaluated
read-only against the retained failed panel: old guard missed it in18ms; new guard
raised developer_app_inventory_load_error in16ms. This checks the guard against
the actual DOM, not a full installed failed-inventory transaction. Version/help
smokes pass. Only the CLI wrapper changed; API PID4185922 and MCP wrapper remain
unchanged. Browser PID2122493 survives, peer tabs were preserved, and the baseline
CLI exited normally. Private deployment/hash receipts stay in user state.

Plan remains OPEN for successful-read latency. Next bounded measurement should
replay ledger processing off-provider with a representative history, count
reads/commits, and preserve expiration, cross-process ordering and full history.
A change requires its own red/green evidence and controlled timing; do not treat
this profile as permission to prune history or to omit durable state effects.

## Ledger admission packet — 2026-10-25

Current packet base: ca3d632588f046616d521cd502e234b68b3aed69.
The first candidate replay targeted usage summaries and demonstrated unnecessary
writes, but call-site qualification found no production inventory caller. Its
candidate patch was set aside privately and is not part of the repair. Earlier
summary-specific tests/timings are not inventory acceptance evidence.

The real owned backend-request authority calls ledger reserve/start/settle. An
isolated replay of that public sequence against copied history measured10.884s
and9.957s with zero provider calls. Compact JSON alone measured8.919s and7.956s;
serializing the lock-owned records/warnings/events directly to an immutable
string, without cloning history again just for encoding, measured5.202s and4.581s.
Host timing varies: a later unchanged-source replay measured7.125s and6.439s,
so an8s absolute timing gate was rejected as unreliable. These are samples, not
a controlled end-to-end speedup claim or a product latency SLO.

The deterministic regression extends the real backend-burst fixture: retain the
account ceiling and one durable commit, while bounding encoding overhead to10%
above the same semantic JSON contents. Against unchanged main, the test fails:
12151bytes exceeds10066.1; body70ms. The candidate stores the same complete schema1
snapshot compactly. A legacy-indented snapshot test also preserves all prior
records, warnings and event prefixes across restart and a cross-instance race.

Ranked predictions tested one variable at a time: pretty encoding adds avoidable
bytes; clone-before-encode adds avoidable allocation; durable I/O remains a
possible residual cost. Current repair retains full history, JSON schema1,
ordering, file lock, fsync, atomic rename and publish-after-commit semantics.
No caching, admission bypass or dropping expiry/warning/unknown-effect evidence.
The immutable string is produced synchronously while the file lock is held;
mutable internal references do not escape the serialization method.

Pending: final source checks/review, integration, installed artifact qualification
and one serialized native inventory read. Successful inventory latency remains
OPEN until those outcomes are qualified. CI remains excluded.

Source checkpoint:125checks across ledger, traffic governor and backend admission
pass, along with typecheck/build and scoped test lint. Primary frozen-patch review
against ca3d63258: Standards has no blocking findings; Spec qualifies encoding
cost reduction and full-history/durability preservation, with installed native
latency still pending. No summary-only candidate code remains in the patch.

## Native result and snapshot-reuse packet

PR467 merged at544db831f0e16e1c71abd203d8aac74943ec598f; installed CLI and ledger
bytes match source. Installed replay measured5.968s/4.238s. CLI-only activation
preserved API PID4185922 and the MCP wrapper. One native read returned complete
26-app inventory in297.628s, exit0, with no outer timeout. Encoding mitigation
did not resolve the slow successful read; issue464 remains OPEN. Private stage
timestamps distinguish identity24.679s from later inventory work. Attempted
second CPU capture raced process exit and produced no profile; do not infer a
new CPU distribution from it.

A108ms real backend-admission regression exposes three full snapshot reads for
one reserve/start/settle sequence. Current packet base is544db831f. Ranked
prediction: a cached lock-owned snapshot avoids unchanged rereads; peer changes
must invalidate before admission; failed operations/commits must discard in-memory
mutations; post-commit metadata failure must not relabel a durable effect as a
failed operation. Every batch still acquires the existing cross-process lock.
File identity includes device/inode/size/mtimeNs/ctimeNs, read under that lock.
A successful local commit refreshes identity; missing/error identity discards
reuse. Records/warnings/events and all admission/expiry computations stay intact.

The private in-memory event history is append-only and public reads/observations
return copies. Cache its encoded prefix and encode new events only; every durable
snapshot still contains the full event history in schema1. Peer replacement
loads a fresh ledger and prefix. Copied-history replay with snapshot reuse alone
measured3.552s/3.144s, then2.937s/2.482s with the event-prefix optimization. Samples
are supporting timing evidence, not a host-independent speed guarantee.

Focused tests cover one load across self-owned admissions, metadata failure after
commit, same-size in-place peer edit, file deletion, cross-instance warning/cap
visibility, immutable public event copies, complete retained event prefixes and
same-instance reads after failed commit. No global cache, stale-read admission,
history pruning, schema migration, dropped fsync or API/browser restart.

Because the first native outcome remained slow, one additional serialized native
read after this packet is justified. It must use the installed hash-qualified
artifact and original provider/capacity deadlines; no concurrent probe or CAPTCHA
retry. Final source validation, integration and native outcome remain pending.

Snapshot-reuse source validation:127checks across ledger/governor/backend
admission pass; typecheck/build, scoped test lint, docs:list and diff checks pass.
Primary Standards review has no blocking findings. Primary Spec review validates
own-state reuse, peer/error invalidation, non-failing cache refresh after durable
commit, immutable public event copies and complete history serialization.
Native acceptance remains pending. No speculative usage-summary patch is present.

Final snapshot-reuse validation is green (127checks, typecheck/build and scoped
lint). The next native run will also passively record backend-request counts and
endpoint timing on its newly created utility tab, without reading bodies or
headers or issuing provider requests. This distinguishes residual request churn /
provider waiting from local ledger work without starting another live command.
