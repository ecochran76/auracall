# Plan0460 — App inventory latency

State: OPEN
Branch: fix/issue464-app-inventory-latency
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
