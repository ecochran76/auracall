# Ticket452 — stable incremental relative timestamp evidence

Scope: https://github.com/ecochran76/auracall/issues/452, Plan0457.
Worker base: `b509d45fa52a605d0ba647554decf6d2344dad73`.
Worker branch: `feat/grok-repair-452-20261025`.

The production visible-Chats DOM expression now distinguishes relative-clock
estimates from absolute timestamps. Relative values remain available to the
existing `since` filter, but do not become `Conversation.updatedAt` or stable
fingerprint evidence. Parseable absolute timestamps still become `updatedAt`;
the relative parser no longer consumes absolute dates before qualification.
Trusted numeric readers that omit the optional qualification keep their existing
absolute timestamp behavior. No qualification or fingerprint field is added to
public conversation metadata. Existing partial coverage, cursors and row/page
bounds are unchanged.

## Causal red and green

All tests use controlled provider-free documents/transports and isolated writable
AuraCall homes. The new DOM fixture executes the actual public production reader;
the restart fixture invokes the actual metadata collector, constructs it afresh
for each cycle, and reloads its account-bound disk checkpoint.

- Red: `pnpm vitest run tests/browser/grok452StableTimestamp.test.ts` against the
  unchanged base source: four failures, one each for `today`, `yesterday`,
  `2 hours ago` and `5m`. Advancing the clock by one minute returned the unchanged
  row as changed instead of reaching the incremental frontier.
- Red: `pnpm vitest run tests/accountMirror/grok443IncrementalFollow.test.ts -t
  'relative-only public DOM'` against the unchanged base source: one failure;
  completed four-row account with a two-row cycle reported `changedRows: 2`
  instead of zero after advancing the clock. Five unrelated tests were skipped.
- Final focused green: `pnpm vitest run
  tests/browser/grok452StableTimestamp.test.ts
  tests/browser/grokHistoryInventory.test.ts
  tests/browser/grok443HeadFrontier.test.ts
  tests/accountMirror/grok443IncrementalFollow.test.ts
  tests/accountMirror/grokIndexBackfill.test.ts --maxWorkers=1`: five files,
  41 tests passed. The relative-only persisted account remains in follow with
  four retained rows, completed scope and null continuation despite later clocks.
  Genuine absolute date changes, title changes and new rows after a known row
  remain observable across the two-row bound and resumed cursor. Existing
  full-sweep, yield, cancellation, fresh-failure and account-isolation cases now
  also run with the actual relative DOM reader.
- Public projection green: `pnpm vitest run tests/http.grokIndexProgress.test.ts
  tests/mcp.grokIndexProgress.test.ts --maxWorkers=1`: two files, three tests passed.
  HTTP, CLI, Ops and MCP retain partial/full-sweep qualifications and explicit
  bounded full-sweep requests.
- `pnpm exec tsc --noEmit`: passed (serialized compiler slot).
- Selected changed-file `pnpm exec biome lint`: passed, no errors or warnings.
- `git diff --check`: passed.

Ephemeral raw logs: `/tmp/auracall-452-red.log`,
`/tmp/auracall-452-restart-red.log`, `/tmp/auracall-452-final-focused.log`,
`/tmp/auracall-452-parity.log`, `/tmp/auracall-452-typecheck.log`.
The committed deterministic tests preserve the reproducible evidence beyond
these temporary logs. No retries erase causal failures; an early date expectation
was corrected to use an explicit GMT input rather than assuming local midnight
was UTC.

## Limits and integration

An old persisted checkpoint cannot identify which unqualified `updatedAt`
values were relative estimates. It may therefore normalize those values once
through existing bounded continuation. The legacy-checkpoint regression proves
two rows per cycle, retained completed state, then a zero-change stable frontier
under a subsequently advancing clock. This is not an archive-order guarantee.
Unobserved older changes still require an explicit bounded full sweep.

This is source/provider-free qualification only. No installation, native/provider
smoke, account mutation, issue closure or tracker change was performed. Primary
owns operator docs, CONTEXT, journal, ledger, integration and intended-main proof.
Memory disposition: `forbidden` because the task explicitly prohibits memory
writes.

## Acceptance correction: actual root adapter window

The preceding core-reader and metadata-collector fixture proof did **not** qualify
the root adapter merge. Primary acceptance inspection found that root
`includeHistory` subsequently enriched qualified rows with raw relative-clock
`updatedAt` values and could refill a correctly empty incremental frontier.
This followup is based on integration `d3629f4915e11e632d41a577bdb4dc60e194e114`.

For `includeHistory`, root discovery now returns only the qualified, bounded
history window, matching the existing project mode. It does not merge mounted,
sidebar or open-tab rows into that window. Thus unknown/relative timestamps
cannot be re-enriched and a zero-row frontier remains empty. Existing history
transport, account custody, final proof, configured-route handling, callback
coverage, failures, cancellation and cleanup remain in the same control flow.
Non-history root discovery retains its mounted/sidebar/open merging behavior.
This is explicit mode authority, not a claim that qualified Chats covers every
provider conversation or that mounted rows can establish history freshness.

`grok452PublicAdapter.test.ts` copies the existing controlled transport seam from
Ticket440 without changing its fixture or tests. It calls actual
`createGrokAdapter().listConversations` through configured guarded traffic
admission and executes the **production history and raw DOM expressions** against
the same controlled timed document. Fresh transports/adapters and the real
private checkpoint store exercise collector restart rather than bypassing the
adapter merge.

- Causal red: `pnpm vitest run tests/browser/grok452PublicAdapter.test.ts
  --maxWorkers=1` on the unfixed integration adapter: two failures. A qualified
  known relative-only history frontier returned raw rows instead of `[]`; the
  persisted four-row/two-row-cycle account reported `changedRows: 2` instead of
  zero after a one-minute clock advance. An initial harness-only head-reset gap
  was corrected to execute the production reset expression, then the genuine
  two failures were observed (`/tmp/auracall-452-adapter-red3.log`).
- Green: the same public adapter seam now proves an empty frontier, no relative
  re-enrichment, persisted bounded restart, and genuine absolute-only/title/new
  changes after an unchanged row across a two-row continuation. A fourth case
  confirms non-history root mounted discovery retains its previous behavior.
- Final focused: `pnpm vitest run tests/browser/grok452PublicAdapter.test.ts
  tests/browser/grok440CursorCustody.test.ts
  tests/browser/grok441ProjectHistory.test.ts tests/browser/grokAdapter.test.ts
  tests/browser/grok401AdapterCleanup.test.ts
  tests/browser/grok452StableTimestamp.test.ts
  tests/accountMirror/grok443IncrementalFollow.test.ts --maxWorkers=1`:
  **seven files, 69 tests passed** (`/tmp/auracall-452-adapter-final.log`).
- New/changed fixture and test Biome lint: passed, zero errors or warnings.
- `pnpm exec tsc --noEmit`: final pass
  (`/tmp/auracall-452-adapter-typecheck-final.log`). Its first run found a
  test-only optional-method/unknown-array return inference error in the new
  non-history case; explicit method/array guards corrected that fixture type.
  The production patch did not change after the 69-test pass.
- Final new adapter test rerun after the fixture type guards: four tests passed
  (`/tmp/auracall-452-adapter-final4.log`).
- `git diff --check`: passed.

The earlier partial/full-sweep public projection evidence remains applicable;
these seven source lines change the root history result's authority, not the
CLI/API/MCP/Ops progress schemas. Primary owns the corresponding operator and
CONTEXT documentation. Native/provider effects and memory writes remain excluded.
