# Grok440 — cursor-qualified rows survive public bounds

Frozen input: Plan0456/issue440 on e1bb4dbc94c5d50dc4f210dbd783cbfb2bbd3b5a.
Scope: legacy public Grok array discovery through readBoundedConversations and
real mirror checkpoints; no browser/provider action or runtime adoption.

Root inventory now inserts the qualified history window before supplemental
mounted/sidebar/open rows. Search-qualified titles remain authoritative; duplicate enrichment and project-
conflict checks still use the existing preferred-conversation logic. Search normalization now
matches the history reader before applying the public result filter/bound.
Configured identity, warnings, read limits and final account-proof ordering are
unchanged. The separately owned project branch and retained-history lifecycle
are not implemented by this slice.

## Causal evidence

Primary observed these separate red/green cycles at the real public adapter:

1. Six discoverable Chats rows, historyLimit2, repeated mounted a/b. Original
   second mirror cycle retained only a/b while cursor advanced after d. Repaired
   cycles persist a/b, then a–d, then a–f in an account-bound real disk checkpoint.
2. Supplemental c title overwrote a matching history title and caused final search
   filtering to drop c while its history cursor covered it. Repaired results keep
   the qualified title and c/d window.
3. A padded search query was normalized by history collection but not by the
   final array filter. It returned[] with a qualified cursor. Both boundaries now
   use the same trimmed query and retain the expected matching rows.

A public cancellation characterization aborts after advanced history progress is
observed. The durable checkpoint remains exactly the earlier a/b checkpoint;
recovery retains c/d rather than skipping them. This is not counted as another
new causal red.

Command: `pnpm vitest run tests/browser/grok440CursorCustody.test.ts --maxWorkers=1`.
Final focused selection adds grokIndexBackfill, grok401AdapterCleanup and
Grokadapter tests:59 passed across4files. Four new test cases exercise the actual
adapter/history expressions, real configured provider-session pre/post proof,
readBoundedConversations, index collector and isolated disk store. Legacy
root/sidebar extraction is modeled as a controlled CDP protocol response; this
is not native DOM/physical-opener acceptance or an installed-runtime claim.

An initial test-only type import named the wrong module; it was corrected. That
bootstrap typing failure is not behavioral red evidence. Required typecheck and targeted two-file lint pass. A final47-test adapter/
public-custody rerun also passes after preserving existing conflict checks.

Integration, complete ticket validation and tracker closure remain coordinator
steps; no closure follows solely from this source packet. Memory disposition:
forbidden; no explicit request authorizes a memory write.
