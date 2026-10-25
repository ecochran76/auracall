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
