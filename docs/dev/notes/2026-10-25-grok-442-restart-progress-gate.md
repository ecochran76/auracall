# GitHub 442: bounded owned history continuation

Authority: Plan 0456, ticket `docs/dev/plans/0456-grok-review-repair-tickets/442.md`, accepted SPEC3. Base: `e1bb4dbc94c5d50dc4f210dbd783cbfb2bbd3b5a`. Scope expanded by the primary to the necessary source-only owned connection/authority lifecycle. No provider, native browser, installation, tracker or memory effects were authorized or performed.

## Causal red

The initial controlled-CDP public-service regression started a fresh cumulative lazy dialog for each call: initially a/b; its observed scroll reveals c/d and then e/f. Three public `createGrokConversationsService().list()` calls, each limited to two history page probes, returned `[a,b,c,d]`, `[]`, `[]`. Owned target cleanup succeeded each time. The acceptance assertion expected `[a,b,c,d,e,f]` and failed.

Command: `pnpm vitest run tests/browser/grok442RestartProgress.test.ts`.
Initial outcome: 1 test failed, 2.56 seconds; received only `[a,b,c,d]`.

A row token cannot extend the observable prefix of a repeatedly discarded lazy view under an unchanged page bound. The repair therefore retains the exact owned view across bounded calls; it does not conceal extra replay reads, increase time/page bounds, guess a seek control, or mistake a changed token/error for forward progress.

## Implemented behavior

`grokHistoryContinuation.ts` binds the existing durable browser-tab lease registry to configured account, runtime, managed browser, browser generation, query/since and project scope. It creates an owned blank target, and subsequent calls acquire only its exact leased target. Fresh authorization is cloned for that connection before provider account verification. The service and legacy adapter acquire this connection before action admission; there is no second provider socket hidden inside the reader.

An incomplete result closes its CDP socket after governed cleanup and leaves the owned target/dialog idle with its loaded prefix. The next bounded call can discover older rows. Complete results close and retire that owned target. Missing target or a qualified expired idle target reconstructs the anchor prefix incrementally across bounded retained calls; `cursor-rebuilding` reports that phase. A changed target route/browser generation or unknown cleanup refuses reuse. A terminal missing anchor produces explicit incomplete `cursor-restart-required` with no continuation, rather than silent skipping.

Owned cursors are version 2 and account-bound. Unowned collector version-1 scope hashing remains compatible. A valid old unaccounted version-1 query cursor produces a structured restart-required result before target I/O; the mirror clears that cursor, safely replays and deduplicates retained rows. It is never accepted as target ownership proof.

The existing tab registry now supports optional `exclusiveGroup`. Reserve and acquire atomically exclude another active or outcome-unknown fenced owner in that account group; settled idle retained views may coexist. All new Grok utility authorities and history leases use `grok-serialized-utility`. The provider factory refuses unreleased older fixed-workload records without that group. There are no provider-specific rules in the generic registry.

The configured traffic authority can borrow a verified active history claim. It checks configured scope, actual target, revision, operation, owner process/instance and group. Borrowed cleanup reconciles backend and interaction state without releasing or rewriting the stable claim; uncertain cleanup throws. The history owner then records meaningful use and idles or retires it. Thus ordinary foreground utilities, query races and unknown outcomes retain the account-wide exclusion.

The adapter retains its existing root/project merge authorities. Its continuation changes are limited to initial connection custody, dialog preservation, avoiding retained-view re-navigation, and final cleanup. Root/project row qualification fixes remain the separately owned 440/441 changes.

## Controlled validation

The dedicated public test uses real account-preflight and history DOM expressions over a controlled lazy CDP view, the actual configured traffic authority/ledger, isolated AuraCall homes, and deterministic injected pacing. It proves:

- service recreation returns a–d then e/f with two page probes per call;
- lost target reconstruction progresses across bounded retained calls;
- removed anchors terminate with a restart-required partial outcome;
- durable public mirror checkpoints reach all six rows and follow phase;
- foreground admission blocks history reacquisition without destroying its view;
- stale claims, foreign targets and asserted foreign account scopes are refused;
- concurrent query scopes cannot both acquire active account admission;
- persisted old cursors restart and replay without duplicating retained rows;
- real `GrokService.buildListOptions()` global configuration maps custody to the configured factory;
- uncertain socket cleanup fences other query and foreground admission;
- CLI, HTTP API, MCP and Ops retain the same restart-required status without exposing the cursor.

An affected-suite run exposed the existing one-millisecond deadline race: monotonic expiry could return incomplete before its abort timer fired. The collector now aborts and rejects consistently at that boundary. The deadline/cancellation suite then passed; no timeout allowance changed.

Final command/count receipts are recorded in the worker handoff. Native/provider acceptance was not run. Public legacy-adapter root/project reconciliation and its outer controlled transport fixtures must be verified after integration with 440/441; the worker's mirror regression uses the public service and public checkpoint collector with their actual shared history reader.

Memory disposition: `forbidden`, under this worker's explicit no-memory-write boundary.

## Final worker receipts

- Dedicated regression: `pnpm vitest run tests/browser/grok442RestartProgress.test.ts` — 11 passed, 16.58 seconds total.
- Affected selection: `pnpm vitest run tests/browser/grok442RestartProgress.test.ts tests/browser/grokHistoryInventory.test.ts tests/browser/grok401ConversationServiceSidecar.test.ts tests/browser/grok401ConversationSurfacesSidecar.test.ts tests/browser/grokProviderSessionBinding.test.ts tests/browser/configuredProviderTrafficAuthority.test.ts tests/browser-service/tabLeaseRegistry.test.ts tests/accountMirror/grokIndexBackfill.test.ts tests/accountMirror/grokIndexCoverage.test.ts tests/http.grokDiscovery.test.ts tests/http.grokIndexProgress.test.ts tests/mcp.grokIndexProgress.test.ts` — 12 files, 93 tests passed, 18.50 seconds total.
- After the final no-input-mutation cleanup, `pnpm vitest run tests/browser/grok442RestartProgress.test.ts -t 'removed anchor|CLI, API'` — 2 passed, 9 excluded by the explicit selection.
- `tests/browser/backendRequestAdmission.test.ts` additionally passed all 95 tests in a broader run that also exposed the subsequently repaired global-runtime fixture/custody failure. It is not represented as an entirely green broader run.
- `pnpm typecheck` passed. Focused `pnpm exec biome lint` over the changed module/type/authority/collector/test paths reported no warnings or errors (9 checked paths; repository ignores remain effective). `git diff --check` passed.

These are worker-reported source/controlled-boundary receipts, not primary integration or native/provider acceptance.
