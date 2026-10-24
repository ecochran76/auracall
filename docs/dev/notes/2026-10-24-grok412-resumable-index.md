# Grok412 — resumable index collection

Plan0453; issue https://github.com/ecochran76/auracall/issues/412.
Source base83e0951e8; renewed user allowance, primary owner.

## Implementation and acceptance

The production account-mirror collector now traverses root and discovered project
history through a shared bounded page/row budget. Scope-bound continuations and
qualified rows commit together in a private account/runtime-profile checkpoint.
A restart resumes an unfinished scope before advancing; a failed/cancelled scope
cannot publish a cursor without its rows. Completed scope commits survive later
collector failure. Visible scopes finish into incremental follow, which starts
from current scope heads on subsequent cycles while retaining older rows.

Observed Bot provenance survives through existing provider inventory. Public
omissions explicitly retain the hidden/undiscovered Bot boundary; visible scope
completion never proves the entire provider account. Project discovery retains
up to10,000 observed projects rather than permanently limiting every cycle to
its first25 rows; larger/unproven inventories remain partial.

Foreground yield is checked before project discovery, each history page/scope,
and the account-file/detail phase. Existing provider deadlines and dispatcher
custody bound cooperative drain; no second coordination mechanism is introduced.
Existing persisted target eligibility/failure backoff remains authoritative.
Public status, refresh, MCP declared output contracts, HTTP/Ops and CLI summaries
retain sanitized Grok progress; continuation tokens are omitted from that
projection and retained conversation metadata. Fresh read failures still throw
through the existing refresh failure path; retained cache cannot become success.

## Verification

Invariant seams: public metadata collector with controlled provider client;
provider history inventory with controlled pages; real private checkpoint store;
public registry/MCP declared schemas/actual local HTTP status and CLI projection.

Observed red then green:

- completed root checkpoint incorrectly pointed back to root instead of project;
- hydration dispatched3 pages despite foreground yield after page1;
- private continuation leaked through conversation grokInventory metadata;
- foreground yield still started project discovery and account-file inventory;
- per-scope counters let2 scopes consume more than one shared page budget;
- resumed final anchor stayed incomplete forever with no later rows;
- observed project26 was dropped by the legacy25-row inventory window;
- MCP declared schemas and CLI target summaries discarded Grok progress;
- a page-level foreground yield was reported as ordinary partial work.

Commands:

```
pnpm vitest run tests/accountMirror/grokIndexBackfill.test.ts tests/accountMirror/grokIndexCoverage.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/accountMirror/statusRegistry.test.ts tests/accountMirror/refreshService.test.ts tests/accountMirror/cachePersistence.test.ts tests/accountMirror/schedulerService.test.ts tests/accountMirror/backfillLedger.test.ts tests/browser/grokHistoryInventory.test.ts tests/mcp.grokIndexProgress.test.ts tests/http.grokIndexProgress.test.ts tests/mcp.accountMirrorRefresh.test.ts tests/mcp.accountMirrorStatus.test.ts tests/cli/apiStatusCommand.test.ts --maxWorkers=2
pnpm typecheck
pnpm run build
```

Focused presubmit203 tests/14 files passed before the final page-yield state case;
after that change,28 tests/4 causal files passed. Typecheck and build passed.
Targeted Biome lint passed with one pre-existing HTTP Location naming warning.
One earlier parallel run timed out while importing the collector inside a test;
imports moved to suite collection and subsequent runs passed. A transient
concurrent typecheck observed a newly edited test before its implementation;
the fresh post-edit check passed. No retry hides an unchanged failing test.

No whole-suite, installed runtime, provider account traversal, scheduler enablement
or native UI acceptance is claimed. Existing cache-persistence tests independently
prove retained retry horizon and fresh failure/backoff persistence. The HTTP
fixture proves local status and its Ops binding, not a rendered native browser.
The user-requested single whole-program code-review/TDD findings cycle remains
pending completion of the ticket work; no new broad review was consumed here.

Memory disposition: forbidden — developer prohibits memory writes without an
explicit user memory request; this is source implementation authority only.
