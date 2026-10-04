# Plan 0386 scheduler resume runner repair

PR #190 merged at `866d1cd74cae34d165b261b8842c7d3ee70e8486` and was built from the canonical worktree and installed. Root main is anchored to that merge. Installed completion-service SHA256 is `c4c73fd675936566265c292b23d8eb313330705789340b11e9614c1035cf36c5`; HTTP server SHA256 is `f3649511ff642733d042eb56556fc26f1914dc5088ba819a840564c6b6987462`; both match the canonical build.

## Proven repair

Persisted scheduler pause suppressed completion runners on API startup. The HTTP scheduler resume handler only restarted the scheduler timer, leaving restored runnable operations idle. The regression failed with zero refresh calls before the fix, then passed after reuse of guarded, idempotent runner activation. Explicitly paused operations remain paused and repeated resume does not duplicate runners. All 71 completion-service tests and 38 selected startup/resume/shutdown checks pass, along with typecheck, build, scoped Biome (existing warnings), plan audit and diff check.

The old passive observer ended at 20:02:29 UTC with zero passes; its timeout is retained as failed acceptance evidence, not erased. After installation, the API restarted while scheduler pause remained persisted. HTTP resume returned 200 with the existing wsl-chrome-3 completion running under API PID 44386. Five other active completion records remained operator-paused.

## Remaining acceptance gate

The first automatic pass failed at 20:06:41 UTC before refresh: `Live-follow browser startup returned multiple compatible unowned targets.` The cold browser census has three ChatGPT page targets: one root and two retained conversation pages. No ambiguous target was adopted. The managed browser Preferences report a crashed previous exit; that is a lead, not proof of the restoration cause. The browser-service cold launch goes through manual-login startup and same-origin login-tab opening before the crawler coordinator evaluates its target census. That seam must expose reliable target custody or prevent ambiguous restoration without discarding unrelated tabs or bypassing warning/identity/traffic guards.

Scheduler resume and runner activation are proven; successful unattended continuation and cold desktop-display acceptance remain unproven. Existing provider warning and ambiguity guards must remain intact. No prompt, Answer now click, warning dismissal, or forced retry was performed. The consolidated JSON preserves separately verified positive queued-worker capture, automatic selection, RDP integration and this failed automatic pass.

Private runtime evidence: `/tmp/auracall-pr190-resume.json`, `/tmp/auracall-pr190-autonomous-observer.json`, and the earlier `/tmp/auracall-autonomous-follow-observer.json`. These are local locators; the curated facts above are the durable receipt.
