# Grok #413 bounded detail implementation evidence

Authority: issue #413, approved Plan 0452; base `ae21c97c907eb903360058c7b65c8bb267b70016`
includes merged #412. Worktree branch `feat/grok-413-resume`.

Implemented fresh/no-fallback/no-retry reads, bounded mounted-message continuation,
private contiguous cached context, exact route and positive index Bot provenance,
visit-bundle freshness, explicit observed-content versus history coverage, shared
operation admission, provider deadlines and cancellation fencing. Failed detail
reads preserve the unfinished cursor. Context/final cache publication has an
abort guard after project-enrichment work. Existing request admission stays on
annotated provider transports; no parallel governor was introduced.

Red: `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts -t 'retains bounded Grok' --maxWorkers=1`
failed because Grok omitted strict freshness/chunk options and visit custody.
Red: `pnpm vitest run tests/browser/llmServiceContext.test.ts -t 'Grok cancellation during' --maxWorkers=1`
resolved successfully and wrote cache after project-enrichment cancellation.
The fixed tests pass through real collector/LlmService interfaces. The later
cache-publication regression also went red because a pre-dispatched write could
finish after cancellation and the fallback path returned it; Grok now rejects
that cancellation with an aborted receipt, even when fallback was not disabled.

A 1000-card public-adapter transport fixture evaluates the actual extraction
expression. Text getters outside the requested 24-card slice throw; only 24
texts cross the CDP result. The DOM returns a compact row-inventory fingerprint
and count rather than transporting all mounted text on every chunk. Referenced
file extraction uses the same bounded card slice.

Focused integration selection: `pnpm vitest run tests/browser/llmServiceContext.test.ts tests/browser/grok413ContextAdapter.test.ts tests/browser/grokContextCoverage.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/accountMirror/grokIndexBackfill.test.ts tests/accountMirror/schedulerService.test.ts tests/accountMirror/refreshService.test.ts tests/browser/grokTrafficGovernance.test.ts --maxWorkers=1`.
Public adapter fixtures exercise exact-route rejection, mounted-content coverage,
cancellation before subsequent file reads, and shared operation denial. Existing
scheduler/collector fixtures cover foreground yielding and account checkpoint
continuity; shared governance fixtures include isolated stores and separate OS
processes. These are source tests, not installed/native provider evidence.

Separate native observation packet (unrun; not inferred from source fixtures): observe one explicitly selected authorized Grok conversation
with more history than its initially mounted cards, bind account/conversation/project
and any positively observed Bot ID, inspect the actual older-history control or
owned backend response and a terminal history boundary, then add a sanitized
controlled-transport regression before implementing that observed pagination.
Current `historyCoverage.partial` deliberately does not qualify this gate. No
provider effect, installation, shared config change, ticket closure or merge is
performed by this worker.

Source criterion matrix:

- Bounded resume and exact identity: collector chunk cursor + exact provider route,
  positive Chats Bot provenance, and retained snapshot/project/Bot validation.
- Outcome distinctions: observed-content complete/partial, history partial,
  explicit unavailable diagnostics, context-read terminal receipts and marked
  cache reuse. All mounted messages survive resumed cache publication.
- Cancellation/deadline: no later navigation/file read, cache pre/post-publication
  guards, no Grok abort fallback. A cache write already dispatched before abort
  may finish; it cannot publish a successful read receipt or return success.
- Shared guards/foreground: actual provider-read operation admission plus existing
  annotated request transport, per-surface traffic custody and scheduler/collector
  foreground-yield composition.
- Source/public validation and docs: focused controlled-transport tests and
  operator documentation updated. Installed and live are explicitly unrun.

The implementation preserves all observed mounted content and reports unobserved
history as partial; full hidden-history completeness is not claimed or added as
an unconditional ticket acceptance requirement.

Final focused source run: **180 tests in 8 files passed**, 22.09 seconds,
`--maxWorkers=1`, no retries. The retained-cursor regression was then extended
to assert a failed resumed Grok read preserves its exact unfinished cursor and
emits an unobserved/incomplete visit; its focused rerun passed. TypeScript
`pnpm exec tsc --noEmit --pretty false` and `git diff --check` passed. Biome check
on the new context module and new adapter/coverage tests passed without warnings.
Installed/native/live evidence is unrun; no runtime or shared settings were changed.

Closed-world card-inventory alignment follow-up: both primary response rows with
an extra non-message decoration and fallback bubbles with an earlier assistant
turn reproduced missing final attachment metadata. Exact red command:
`pnpm vitest run tests/browser/grok413ContextAdapter.test.ts -t 'same.*message inventory' --maxWorkers=1`
(two failures: content correct, files empty). Content and chunked file reads now
share one mounted-card inventory script before slicing; ordinary unchunked file
listing retains its existing selection. The full adapter fixture file passes
7 tests, including both missing-file reproducers and unchanged unchunked listing.

## Primary integration qualification

Accepted worker source7f97ddfa2 as09088ea87 on top of merged source wave
PR431/16dbd7218. Independent primary run:180 tests/8 files passed. Accepted
closed-world adapter follow-up4e08da07b as05fd60104: content and chunked file
selection share one mounted-card inventory, including primary decoration rows
and fallback assistant/user alignment; ordinary unchunked listing remains intact.

Primary reproduced and fixed these additional exact content/cancellation risks:

- cancellation during public receipt delivery could still return success; Grok
  now checks cancellation after that awaited boundary and retains an aborted receipt;
- first-chunk follow could erase a qualified cache tail from the same mounted-row
  inventory; compatible observed messages and indexed references now survive
  bounded refresh, while changed scope/inventory still rejects continuation;
- an unreadable mounted card could advance the row cursor despite missing text;
  it now returns explicit unavailable history without advancing qualified cache;
- project-prefix cleanup could alter a later assistant message in a resumed
  chunk; Grok continuation preserves the literal later message.

Exact causal commands were `pnpm vitest run tests/browser/llmServiceContext.test.ts
-t 'Grok cancellation during receipt' --maxWorkers=1`, `-t 'Grok resumed public'`,
`-t 'quotes project instructions'`, and `pnpm vitest run
tests/browser/grokContextCoverage.test.ts -t 'unreadable mounted' --maxWorkers=1`.
All were observed red, then green. A primary10-file selection including the
worker8-file list plus public HTTP/MCP index projection passed after remediation;
see central journal for final count and build receipt. No broad whole-program
review pass was consumed; this is implementation qualification of ticket413.

Final primary receipt: **187 tests/10 files passed**,14.29 seconds,maxWorkers2,
no retries. Exact project/Bot/changed-inventory rejection assertions were then
added to the existing2-case context coverage file; focused rerun and fresh
typecheck passed. Final build exit0 and targeted5-file lint exit0; logs/exit
receipts are user-scoped under /tmp/grok413-final-*. Sourcef76545f7e.
