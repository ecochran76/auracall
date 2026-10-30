# Plan0466 — Full installed runtime upgrade

State: OPEN
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
