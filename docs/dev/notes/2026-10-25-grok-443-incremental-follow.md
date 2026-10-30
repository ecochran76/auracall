# Grok443 — durable incremental head observations

Issue: https://github.com/ecochran76/auracall/issues/443
Plan: [Plan0456](../plans/0456-2026-10-25-grok-review-repair-execution.md)
Source base: `0b8eda9af`; branch: `feat/grok-repair-443-20261025`.

## Behavior and qualification

Completed backfill scope state survives steady-follow cycles. Follow reads a
fresh bounded head window, using stable ID/title/project/update-time fingerprints
from previously retained provider rows. After the post-closure repair, it processes every available row in the bounded
observed page, skipping unchanged rows while retaining later changes. A fully
processed page containing an unchanged row ends the head observation;
`incremental-frontier` remains **incomplete**, with no continuation cursor. No
provider-wide ordering is inferred from row order, timestamps, mounted rows or a
fixture. A changed row behind that observed boundary is unobserved until an
explicit full sweep. Public progress exposes `observationCoverage: partial` and
`requiresFullSweep: true`, rather than account-wide freshness/completeness.
Changes without observable provider-row changes likewise require a full sweep.

A new head portion larger than the cycle budget retains its account-bound
continuation, separately from completed backfill state. It resumes in later
cycles until a known row or qualified visible boundary. Follow rotates bounded
work fairly across scopes, so a long head window does not starve newly discovered
projects. New projects backfill without resetting completed scopes. Fingerprints,
frontier IDs and cursors stay private; public progress contains only counts,
phase, explicit partial coverage and the full-sweep requirement.

Cursor-null observations rewind the existing observed Chats scroll surface
before enumeration. The reset requires two rendering frames, confirmed zero
scroll position and a connected surface, with a one-second failure bound and
caller cancellation. Cursor-bearing continuations do not rewind. Reaching the
incremental frontier closes the dialog and retires the owned target; budget-limited
continuations retain normal owned history custody.

Explicit `full_sweep` resets sweep work once and resumes it durably across bounded
cycles until qualified visible completion. Prior catalog rows remain retained.
The existing public operation is `POST /v1/account-mirrors/completions` or MCP
`account_mirror_completion_start`, with `provider: grok`, `sweepMode: full_sweep`,
`maxPasses: 1` (or another explicit bound) and `materializationPolicy: metadata_only`
when only metadata is intended. Completion service passes sweepMode through the
refresh service to the actual metadata collector. The ordinary refresh MCP tool
does not expose sweepMode; no new alias was added.

## Evidence

Focused red command:
`pnpm vitest run tests/accountMirror/grok443IncrementalFollow.test.ts --maxWorkers=1`

Before the repair, the public metadata collector reset a completed four-row
account to backfill during the next two-row cycle: one failed regression.
After repair, four collector tests pass through the actual history inventory:
unchanged follow; multi-cycle new head, changed head and new project; old changes
requiring bounded explicit sweep; and yield/cancellation/fresh failure preserving
the account-bound durable checkpoint. A newly constructed collector is used for
each cycle. A failed fresh observation throws instead of returning cached success.

`tests/browser/grok443HeadFrontier.test.ts` exercises the real public history
service, auth/history DOM expressions and governed head reset through controlled
CDP. It proves the new row is returned, the observed page containing the unchanged frontier bounds traversal without
dropping later rows in that page,
partial coverage remains explicit, and target cleanup occurs. This fixture is
provider-free; it is not native UI or provider-ordering acceptance.

Public parity red: the existing MCP schema stripped the new partial-observation
fields while HTTP/CLI retained them. The updated MCP schema preserves the same
sanitized fields. HTTP/CLI/Ops and registered MCP tests also prove the existing
bounded Grok full-sweep entry points. No private frontier is added to those schemas.

Final affected selection passed 67 tests across 11 files in 73.70 seconds:
`pnpm vitest run tests/accountMirror/grok443IncrementalFollow.test.ts tests/browser/grok443HeadFrontier.test.ts tests/http.grokIndexProgress.test.ts tests/mcp.grokIndexProgress.test.ts tests/accountMirror/grokIndexBackfill.test.ts tests/browser/grok441ProjectHistory.test.ts tests/browser/grok442RestartProgress.test.ts tests/browser/grokHistoryInventory.test.ts tests/accountMirror/grokIndexCoverage.test.ts tests/cli/apiMirrorCompletionCommand.test.ts tests/mcp.accountMirrorCompletion.test.ts --maxWorkers=1`.

`pnpm typecheck`, focused Biome lint on all 12 changed TypeScript files, and
`git diff --check` passed. No validation retry was needed; red failures above are
causal regression evidence.
No provider effect, installation, native browser launch, global runtime change,
or broad review occurred in this worker slice. Intended-target integration and
issue closure belong to the primary lane.

Memory disposition: `forbidden` — the delegated task and Plan0456 prohibit memory
writes without an explicit save request. No memory write was attempted.

## Primary integration qualification

Cherry-picked as90f36eccc after the442 retiring-target fence. Primary final
selection:112tests/15files passed in77.18s, covering all five repair regressions,
registry/factory ownership and public CLI/HTTP/MCP progress/sweep paths. Local
typecheck, build and focused lint pass.

The first112-case run, concurrent with compilation, passed111 and hit the5s
default timeout in the existing442 foreground-exclusion case. The isolated
diagnostic passed in1.35s; the final serial selection passed that case in1.16s.
No source behavior or timeout changed. Disposition: contention-associated timing
flake retained, not erased by retry; primary owns verification with compilation
serialized from this durable-filesystem selection at subsequent presubmits.
The source cause was not reproduced; no test was skipped or quarantined.
