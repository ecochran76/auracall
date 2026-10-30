# Plan0466 — Full installed runtime upgrade

State: CLOSED
Lane: P466
Branch: ops/runtime-upgrade-20261030
Target: main
Integration: merge
Base: 7efea3746db7c4ea9372db36622570af82292f9d
Owner: primary Codex / ac1

## Current State

The user authorizes a full runtime upgrade, preservation of deployed-only fixes,
and restart of other old AuraCall processes after installation. ac2's coding
checkout and active Grok tooling are protected. Its PR498/499 reconciliation is
merged at the base above. A clean isolated deployment checkout avoids changing
ac2's source/build. The previous CLI and API prefixes are retained for rollback.

The first full main build passed. The installed issue374 composite carries the
source from0f7836643/c5018ca84/2cfc59231 in three production files. Apply only those
source/test changes onto current main; do not replay their older TTL commit or
replace newer Grok behavior. Validate the composed source and compiled carry,
merge it, then install a fresh immutable prefix through the supported installer.
Use staged wrappers until source/package/desktop-client checks pass.

## Acceptance and ordering

1. Preserve exact current API/CLI/MCP identities, config/scheduler/paused work,
   browser generations, managed data, and ac2 path/process custody.
2. Qualify the selected deployed carry with focused existing public tests,
   typecheck/build and runtime contract; retain immutable source/package hashes.
3. Integrate the composed source with CI excluded. Stage the new package with
   separate prefix and wrapper directory; compare compiled source to installed.
4. Promote wrappers and restart the existing API service without replacing its
   private environment or enabling paused work. Verify status/desktops/console,
   supported CLI behavior and fresh installed MCP initialization.
5. Restart only qualified old AuraCall processes the user permits, preserving
   ac2 and unrelated agents. Verify the replacement browser/runtime and managed
   state, then remove old worktree holds only after no live reference remains.
6. Record actual remaining holds, source versus installed/live evidence, rollback
   locators and one qualified memory disposition. No provider prompts, warning
   clearance, consent, account migration or automatic retry is included.


## Qualified delivery

Source carryfdc2f05ea merged in PR500 atbe2344da0. This selects only the already
deployed production/test changes; current main's newer Grok and TTL ownership
code remains.195 focused checks across12 suites, full typecheck, production build,
scoped lint (one warning), diff hygiene and the installed runtime contract pass.
All657 compiled files in the staged package match the validated source. Two
standalone carry modules also match the previous installed bytes exactly; the
CLI entrypoint additionally retains newer integrated Grok code.

The supported installer created the complete immutable prefix
`~/.auracall/user-runtime-full-fdc2f05ea` with separate staging wrappers. Both live
CLI/MCP wrappers now select it. Fresh installed MCP initializes and advertises65
tools; installed invalid/supported selector dry-runs give exit1/exit0 as expected.
The existing API unit/environment were retained and restarted1329614→2521540.
Status, desktops and console return200. Config/private env bytes are unchanged,
scheduler pause is preserved and all23 active paused completion identities/states
match. No provider prompt, warning clearance, scheduler resume or profile reset.

One supported exact-native close and ordinary runtime-profile Wake replaced the
old wsl-chrome-3 ChatGPT browser1414440→2543066 from cwd outside all worktrees.
Kernel/assignment/window guards qualify the replacement with the same managed
browser profile. A passive installed DOM read confirms complete ChatGPT page,
one visible editor and no visible sign-in control; it submits nothing. ac2's
Grok browser, retained companion browser and launcher generations are unchanged.
No generic process kill or unrelated-agent termination was needed.

PR481 is closed as source delivery superseded by PR500. Its original historical
nested-wait attribution is not claimed resolved and Plan0462 preserves it. The
idle account-readiness PR385 source remains unmerged in its published branch;
removing its unused checkout does not close the PR or discard its code.

Three additional old worktrees are removed after clean/ref/live-reference checks:
TTL hold, utility-diagnosis source and account-readiness source. All branches and
commits remain. The temporary deployment checkout can be removed after this
closeout merges; the installed prefix is independent of it. The primary ac2
coding checkout and its two actual runtime/dependency holds remain. Those holds
are not upgrade failures and are not removed by terminating ac2.

## Provenance and rollback

Private evidence: `~/.local/state/auracall-runtime-upgrade-20261030/` contains the
full source/package manifest, build/check logs, accepted promotion, CLI/MCP proof,
exact native restart/DOM proof, preserved wrappers/config and removal receipts.
Chromium may flatten its argv representation; only the explicitly verified
native binding authorized the browser restart.

Retain the previous CLI prefix `user-runtime-issue374-4fa2f3ac9` and previous API
prefix `user-runtime-p464-mode-capture-1cb828564`. Wrapper backups and source IDs
qualify rollback; observation timeout alone does not prove candidate regression.
This delivery installs AuraCall only, not a new Chromium or Agent Browser binary.
Source composition and installed/runtime acceptance are complete; the final docs
merge, custody readback and one qualified Graphiti receipt finish closeout.


Final custody normalization retains P458H as an integrated runtime-only hold,
without closing P458's broader native capability gates. P458411's ARCHIVED record
now names its existing matching local/remote retained research refs. The primary
ac2 coding checkout and its branch were not switched; local main was only
fast-forwarded as an unassigned ref to reflect canonical integrated source.
