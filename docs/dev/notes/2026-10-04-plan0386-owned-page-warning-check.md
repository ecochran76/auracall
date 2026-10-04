# Plan0386 owned-page warning check

Authority: user requested a bounded rate-limit check on AuraCall's own ChatGPT
page and removal of cross-tab scanning from this path. This successor is source
implementation and provider-free validation; it does not resume the paused live
runtime or claim automatic refresh/materialization acceptance.

Worktree: auracall-follow-continuation; branch fix/issue165-owned-page-warning.
Baseline: canonical origin/main 76d7e81137b5b7db610f27ba4e9e942a8edde942.

Refresh supplies the exact affinity crawler endpoint and target to its guard.
The ChatGPT guard bypasses browser registry and target census, reads only that
page, and has a ten-second outer deadline covering connection, DOM evaluation,
and client cleanup. Abort initiates client close. Read failures/timeouts fail
refresh; they are not converted to no-warning results. Visible warnings retain
cooldown persistence, without invoking persistent-warning target closure.
Non-affinity collection retains existing loaded-page adapter checks. Gemini
census and its prior best-effort failure handling remain unchanged.

Red command:
`pnpm vitest run tests/accountMirror/refreshService.test.ts -t 'checks only the owned'`
After ensuring the fixture was a resolved config, this timed out at 5000ms
because the real guard awaited the deliberately hung registry census. After
the change the same command passed, connecting only to crawler-1 and making
zero registry calls.

Green focused command:
`pnpm vitest run tests/accountMirror/refreshService.test.ts tests/accountMirror/configuredLiveFollowAffinity.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts`
105 tests passed. Additional assertions prove warning cooldown, deterministic
ten-second timeout with target identification and close initiation, and exact
crawler propagation through the refresh-service public seam. `pnpm run
typecheck`, touched-file Biome lint, and `git diff --check` passed.

Serial review against the pinned baseline: Standards has zero accepted
findings; Spec has zero accepted findings. Review retained Gemini behavior,
failed-check propagation, exact owned-tab selection, and existing cooldown
semantics. No delegation or live provider effects occurred.

Progress: blocker_reduction. The cross-tab dependency is removed and bounded
owned-page checks are verified. The earlier live stall's cause and eventual
fresh refresh/materialization remain unproven. Installation and a fresh live
acceptance pass belong to the broader Plan0386 acceptance work.

Memory disposition: unavailable. Prior narrow atlas discovery supplied no
qualified group routing manifest; repository evidence is preserved without a
Graphiti write.
