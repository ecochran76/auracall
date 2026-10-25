# Plan0456 — single post-closure review and bounded TDD

Frozen base:4ffe87be25d53dc5ec309ba011a7b53882f11bcf.
Frozen head:99e877d8acce80f59b06880f4f44df09cb131e78.
Command:`git diff 4ffe87be25d53dc5ec309ba011a7b53882f11bcf...99e877d8acce80f59b06880f4f44df09cb131e78`.
Sixteen commits,39changed files; all five repair tickets had closed through
PR447/448 before this one review began. Independent Standards and Spec reviewers
reported separately; primary adjudication follows. No second broad discovery.

## Standards

No hard documented breach found. Accepted `nonblocking_backlog`,P3: three
atomic admission paths in `tabLeaseRegistry.ts` repeat the exclusive-group
active/retiring/unknown-effect predicate. Possible Duplicated Code is a judgment
heuristic subordinate to architecture policy0008. No current discrepancy was
proved. A future private predicate extraction belongs to registry maintenance,
not this behavioral TDD repair. No extra ticket was published.

Standards sources:AGENTS.md,CONTEXT.md,README.md,docs/testing.md,
docs/agents/{codex-stack,codex-code-discovery,runtime-proof,domain}.md and
architecture/documentation/validation/testing policies0008/0009/0018/0029.
No CONTRIBUTING or CODING_STANDARDS file exists.

## Spec

Accepted `blocking`,P1,POST-SPEC1, against443 criterion: new or changed
conversations are discovered and the frontier is justified by available evidence.
`collectGrokHistoryInventory` stopped at the first unchanged fingerprint, ignoring
later changed/new rows already present in that fresh page. Without qualified
provider ordering, that row cannot justify discarding available evidence.
Reproducer: complete[a,b,c,d], change d.title without reordering; follow returned
stale d despite receiving its changed row. Confidence:high.

The reviewer also highlighted the broader limitation of older unobserved rows.
Primary adjudication retains the explicit partial-observation/full-sweep boundary;
there is no global-order or account-wide freshness claim. The accepted concrete
repair covers every available row in the bounded observed page. Changes outside
that page still require the existing explicit bounded full sweep. No provider
contract was invented or acceptance criterion silently rewritten.

443 was reopened after review, remediated through PR449/main69f953d77741694c45ccd8f01ea9e5d6daf389ce,
and reclosed after exact tracker/main readback.
Other four repairs remain closed; parent398 and original eight native-gated
tickets remain untouched.

## One bounded TDD findings pass

Public seams:actual metadata collector/history inventory/private checkpoint for
changed/new-row retention and restart; controlled-CDP public history service for
row/coverage/cleanup parity. These prove source behavior, not native ordering.

Causal red:`pnpm vitest run tests/accountMirror/grok443IncrementalFollow.test.ts
-t 'already observed' --maxWorkers=1`:1failed,4excluded; expected Changed observed
row, received d. Then process later rows instead of breaking at a known row, and
retain an item-limit cursor when later rows remain. Regression additionally spans
three observed changes across a two-row budget, using a fresh collector per call.

The old unavailable-window test now explicitly limits the fixture's visible
rows; its full sweep makes older evidence available. The public service fixture
now expects both observed changed/new rows and count2, rather than asserting the
old first-fingerprint truncation. Intermediate failing old expectations are
preserved in local logs; they were corrected to match the accepted criterion.

Final closed-world selection:44tests/8files pass in32.08s. Typecheck, local
build and focused three-file Biome check pass. Source remediation is verified; PR449/main integration and443 reclosure are verified.
No optional structural extraction was included.

Memory disposition:`forbidden`; developer prohibits memory writes without an
explicit request to remember. The canonical review source is this artifact; no
memory service write is authorized. Non-write receipt:
`/tmp/auracall-grok-review-repairs-final-memory-disposition.json`.

Standards:0blocking,1nonblocking(P3); Spec:1accepted blocking(P1), remediated on main and closed-world verified.
