# Plan 0386 cycle 2 installed control and tab recovery

Work item #165. Installed canonical source:
`44b75206ab25233558e3af4c38a137450eb0c8c9` (PR #169).
Counter: 2/5 installed materialization attempts. Scheduler not resumed.

## Tab feedback loop

A bounded direct CDP `Page.enable` probe failed repeatedly on the exact retained
root target after two seconds. It has no provider fetch, page navigation, or
materialization dependency. Browser-level getVersion and a newly created
about:blank page succeeded. A debugger-resume command timed out; activation did
not restore the old root. Memory availability was approximately 28 GiB.

Closing only the two task-owned unresponsive ChatGPT tabs, preserving the same
browser, and opening one new root restored Page.enable (2 ms). Installed identity
preflight then matched the expected account. This is observed runtime recovery,
not proof of the underlying renderer failure cause or a source regression fix.
No source code or temporary debug logging was added for this runtime recovery.
The original probe and recovery receipt remain in private /tmp diagnostic paths.

## Installed control

Job `hmj_d7e5f7dc358e4288985896ec230f5fea` started at
2026-10-03T19:15:30.738Z. One conversation, artifacts only, maxItems=1,
force=true, no snapshot refresh, provider work timeout 120000 ms. Identity passed
before submission; installed adapter SHA matched canonical source
`572f43d825fd9d8a1bf4c5a882058c72876e273c5f9d24a3f40d263dd65ead5b`.

The monitoring projection first reported the 120-second stale threshold.
The final persisted job instead records cleanup failure: managed browser profile
remained owned by PID 4126772. Its current result is null. The artifact manifest
at 2026-10-03T19:17:33.851Z records a timeout enabling the transfer page target.
Do not treat the earlier projection as the final cause or a null result as proof
that no browser action occurred. No verified file was produced by this control.

## Cleanup gate

Main browser PID 4126673 exited. Fresh OS readback found two exact-profile orphan
subprocesses: GPU PID 4126772 and on-device-model utility PID 4135266. Both had
one thread, running state, parent 696, and SIGKILL pending (SigPnd 0x100).
The GPU's exact executable/profile/start identity was checked before scoped TERM
and KILL; it remained present. The utility also already had SIGKILL pending.
This does not prove a particular driver/kernel cause. Cleanup remains incomplete.
Do not launch another browser on this directory or retry materialization while
these process identities remain unresolved. No host restart, broad process kill,
profile deletion, provider prompt or scheduler resume was attempted.

Native runtime recovery is incomplete and has no trustworthy provider-free
source regression seam yet. Further cause attribution requires OS/host evidence;
fabricating a mocked renderer-failure test would not establish that cause.
Incremental unchanged/new-asset acceptance and installed successful ZIP proof
remain open.
