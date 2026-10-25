# Full Grok implementation review — frozen dabde7caf

User-authorized review, not implementation or provider-effect authority. Comparison:

```sh
git diff c9beb45b687be636a43ca5bc2c3bc950c5efd2c8...dabde7cafe3ae9b0c64757b9a0f27c3e96a56a10
git log c9beb45b687be636a43ca5bc2c3bc950c5efd2c8..dabde7cafe3ae9b0c64757b9a0f27c3e96a56a10 --oneline
```

Both refs resolve; diff is nonempty:171 files,18657 insertions,855 deletions.
Original worktree was clean at the frozen head. These documentation changes are
on a separate review worktree/branch; production source remains unchanged.

Spec sources: canonical GitHub398 and399–414 bodies/comments, fetched during this
review; Plan0452 and published ticket drafts; Plan0453 execution/acceptance state.
Concurrent ChatGPT cleanup changes are attributed to368/Plans0451–0454, rather
than classified as unrequested Grok scope. Tracker remains eight CLOSED children
and eight OPEN; no tracker mutation was performed.

Standards sources: AGENTS, CONTEXT, README, docs/testing, configuration, agent
code-discovery/runtime-proof/tracker guidance, and effective policies0001–0034.
Relevant architecture0008, documentation0009, review/validation0018 and testing
0029 rules were applied. No repo-owned CONTRIBUTING/CODING_STANDARDS file was
found outside vendor/generated trees. Fowler's twelve-smell baseline was supplied
in full, with repo override and heuristic-only treatment; tooling-enforced style
was excluded.

## Standards

**STD1 — P3, nonblocking_backlog: possible Duplicated Code.** Account-reference
projection is copied across Bots/Build and Files/Connectors/installation. For
`{id:"u1"}`, Bots/Build hash `grok:u1`; the other family hashes `grok:id:u1`.
See grokBotsService.ts135–136, grokBuildService.ts136–137 and
`src/browser/grokConnectorsService.ts:84–95`.
This conflicts with no established reference-interchange contract, so it is a
maintenance heuristic, not a hard compatibility violation. Centralize the tagged
projection with a deliberate compatibility policy when that work is scheduled.
Architecture0008's owning-module direction supports the recommendation. No
blocking documented-standard violation was verified in the inspected changes.

## Spec

**SPEC1 — P1, blocking: returned rows can lag their committed cursor.**
`grokAdapter.ts:3799` slices the merged list to historyLimit; raw/sidebar rows
are inserted before resumed history at4026–4044. For limit2, raw `a,b` and
resumed history `c,d`, the actual finish/merge source returns `a,b` while retaining
cursor-after-d. Collector1766–1768 preserves that coverage; backfill139–160 commits
it with the wrong row set. `c,d` can be permanently skipped. This violates
Plan0452's “preserve cursor/phase/accounting across yield and restart” and closed
401/412 continuation custody. Retain cursor-qualified rows before unrelated
supplemental rows, or derive continuation only from the rows actually returned.

**SPEC2 — P1, blocking: nonempty projects prevent backfill completion.**
`grokAdapter.ts:3821–3837` skips history/coverage when mounted project rows exist.
The new checkpoint consumer at grokIndexBackfill154–163 cannot complete a scope
without coverage and resumes the same project forever. With root complete and
projects p/q, three cycles read p repeatedly; q is never read. The old project
branch predates this diff; its integration with the new checkpoint consumer is
the defect. It violates “Include project/Bot chats when discoverable” and closed
412's root/project inventory contract. Implement qualified bounded project
coverage; do not fabricate completeness from a mounted subset.

**SPEC3 — P1, blocking: restart can spend its whole budget finding the anchor.**
`grokHistoryInventory.ts:154` counts replay pages before the saved anchor
(224–229); continuation143–149 stores only its row ID. A restarted lazy-loaded
view with two-page budget returns a–d once, then returns zero rows and the same
cursor on every restart while e/f remain available. Dialog closure at adapter
10136 and dispose-new mirror list lifecycles make fresh-prefix replay relevant.
This violates “bounded resumable account-wide backfill” and closed401/412 restart
contracts. A continuation must permit bounded forward progress, rather than
merely preserve the same opaque token.

**SPEC4 — P2, nonblocking_backlog: follow rescans unchanged backfill.**
`grokIndexBackfill.ts:92–95` resets every scope when prior phase is follow;
retained rows never form an incremental stopping frontier. An unchanged archive
larger than a cycle becomes backfill again. This falls short of “backfill then
incremental follow” and consumes account capacity. Per-cycle bounds remain, so
this is separate from the P1 liveness failures; add an incremental frontier and
explicitly scheduled full sweeps.

## Primary adjudication and limits

| Candidate | Disposition | Verification |
| --- | --- | --- |
| STD1 | nonblocking_backlog | Primary inspected both hash projections; no cross-service interchange requirement established |
| SPEC1 | blocking | Primary ran the exact adapter finish/merge source in isolation: returned a/b with after-d; full CDP adapter regression still needed |
| SPEC2 | blocking | Primary reran real checkpoint function across3cycles; p repeated, q never read; adapter's no-coverage branch source verified |
| SPEC3 | blocking | Primary reran real history function across3fresh cumulative lazy-load views; cycles2/3 returned[] and identical cursor |
| SPEC4 | nonblocking_backlog | Primary reran real follow function; unchanged retained rows produced backfill and after-b |

Known incomplete OPEN tickets403/405/406/408/409/410/411/414 remain separate from
these newly identified defects. Connector installation public source wiring
exists; actual saved Connector/grants and native qualification are missing.
Bot editing/resources, Mail Receipts qualification, Build app/version/export/
publication and artifact-byte materialization remain missing/partial as recorded.
Mounted-only conversation detail explicitly retains partial history; closed413's
“complete observed” wording is not full unloaded-history acceptance. No supported
new scope-creep finding was accepted.

Review is bounded, not exhaustive certification of all171files. Independent
Standards reviewer `/root/review_standards` and Spec reviewer `/root/review_spec`
completed; primary adjudicated their candidates. Remaining low-level DOM, public
surface and unrelated cleanup paths were not all exhaustively executed. This
review performed no browser/provider calls, installation, source fixes, tracker
changes or repair TDD pass. The prior two-hour implementation allowance was not
reset. This is the user-requested broad review; future remediation verification
should stay closed-world on these accepted findings and their critical regressions.

## Reproduction evidence

Frozen packet: `/tmp/auracall-grok-review-20261025`, including immutable ref
metadata, full diff/commit/file inventories, fetched issues, reviewer reports,
`index-spec-probe.ts` and `adapter-row-custody-probe.cjs`. Both probes were run by
the primary and exited0; their output demonstrates failed invariants, not a green
implementation. All provider pages and returned rows were in-memory fixtures. The documented
code block below was also independently executed by the primary (exit0) and
reproduced the same three failed invariants.

Observed compact output:

```text
anchor-budget: cycle1=[a,b,c,d]; cycle2=[]; cycle3=[]; cursor unchanged on2/3
project-no-coverage: cycle1=[root,p]; cycle2=[p]; cycle3=[p]; nextScope=1
follow-rescan: completed[a,b,c,d] -> backfill, cursor=after-b, unchanged retained rows
exact-source-adapter-row-custody: returned[a,b], cursor=after-d, omitted[c,d]
```

The first three can be reproduced from any checkout of the frozen revision with
`pnpm exec tsx --input-type=module` and this provider-free input:

```typescript
import {collectGrokHistoryInventory} from './src/browser/providers/grokHistoryInventory.ts';
import {collectGrokMirrorIndex} from './src/accountMirror/grokIndexBackfill.ts';
const row=id=>({id,title:id,provider:'grok'});
const coverage=cursor=>({state:cursor?'incomplete':'complete',source:'visible-chats',scope:'root',reason:cursor?'row-limit':'visible-bottom',loadedCount:2,pages:1,nextCursor:cursor,observedAt:'2026-10-25T00:00:00Z'});
let cursor=null;
for(let cycle=1;cycle<=3;cycle++) {
  let page=0;
  const r=await collectGrokHistoryInventory({options:{historyMaxPages:2,historyLimit:100,historyCursor:cursor},readPage:async()=>({items:['a','b','c','d','e','f'].slice(0,++page*2).map(row),atBottom:false,loading:false})});
  console.log('anchor-budget',cycle,r.items.map(x=>x.id),r.coverage.nextCursor===cursor);
  cursor=r.coverage.nextCursor;
}
let checkpoint=null;
for(let cycle=1;cycle<=3;cycle++) {
  const calls=[];
  const r=await collectGrokMirrorIndex({projects:['p','q'].map(id=>({id,name:id,provider:'grok'})),maxRows:10,maxReads:4,checkpoint,read:async(id,cursor)=>{calls.push(id);return id?{items:[{...row(id+'-chat'),projectId:id}]}:{items:[row('root')],historyCoverage:coverage(null)}}});
  checkpoint=r.checkpoint;console.log('project-no-coverage',cycle,calls,checkpoint.nextScope);
}
const prior={version:1,phase:'follow',nextScope:0,scopes:[{projectId:null,cursor:null,complete:true}],items:['a','b','c','d'].map(row),updatedAt:'2026-10-25T00:00:00Z'};
const r=await collectGrokMirrorIndex({projects:[],maxRows:2,maxReads:1,checkpoint:prior,read:async()=>({items:['a','b'].map(row),historyCoverage:coverage('after-b')})});
console.log('follow-rescan',r.checkpoint.phase,r.checkpoint.scopes);
```

SPEC1's reproduction extracts the exact `finish` line and final merged-map block
from frozen `listConversations`, transpiles them with TypeScript, supplies raw
rows a/b and history c/d, and stubs only auth/duplicate-preference collaborators.
For unique IDs these collaborators cannot affect the demonstrated ordering or
bound. This is stronger than a hand-written model of slicing, but is explicitly
not a full controlled-CDP public-adapter test. That is the next causal regression
seam for remediation. Source lines and input/output above make the finding
independently reconstructible if the temporary script is unavailable.

Memory disposition: forbidden. No explicit user request authorizes a memory
write; curated review evidence does not override that boundary. Non-write receipt:
`/tmp/grok-full-review-memory-disposition-20261025.json` (zero Graphiti writes).

Summary: Standards1 accepted(P3, nonblocking); Spec4 accepted(highestP1, three blocking).
