# Foreground priority over live follow

Date: 2026-08-30
Status: product requirement recorded; `wsl-chrome-3` live follow disabled pending repair

## Observed failure

An explicit foreground ChatGPT developer-app run could not acquire the
`wsl-chrome-3` managed browser profile because a persisted account-mirror
`live_follow` completion repeatedly acquired exclusive browser operations for
detail inventory and history materialization. The API process was healthy, but
the browser was unavailable to the operator for extended intervals.

The completion used an unbounded pass count, released one background lease,
then reacquired another after its cadence delay. A foreground request therefore
experienced a healthy service as unavailable. Operator pause eventually
drained the in-flight read and released the browser and provider-work leases.

## Required scheduling contract

Foreground work always has priority over live follow. Live follow must never
delay an admitted foreground request beyond the bounded time needed to reach a
cooperative cancellation point.

When foreground work is queued or admitted for the same managed browser
profile and provider, AuraCall must:

1. prevent new live-follow phases, child materialization jobs, and browser
   operations from starting;
2. signal any active live-follow provider read to stop at a safe bounded
   checkpoint and release both its browser-operation and provider-work leases;
3. preserve its cursor, phase, accounting, and retry state without converting
   the graceful yield into failure or completion;
4. admit the foreground request immediately after drain; and
5. resume live follow from the preserved checkpoint only after the foreground
   request reaches a terminal state and releases the profile.

Foreground priority applies across API restart and persisted-completion
recovery. Startup must not resume background work ahead of an already queued
or reserved foreground request.

## Acceptance evidence required

- A provider-free race starts live follow, queues a same-profile foreground
  request, and proves cooperative background yield, bounded lease release,
  foreground admission, and cursor-preserving background resume.
- The same contract passes while live follow is inside a conversation read and
  while a completion-owned materialization child is active.
- Restart recovery preserves the foreground reservation and does not let a
  persisted background completion win the first post-start lease.
- Different managed browser profiles remain independent.
- Cancellation, timeout, and failed foreground work still release the profile
  and permit the paused background completion to resume exactly once.

## Current operational disposition

The exact completion
`acctmirror_completion_8cec5bd0-24a7-4bba-bd5f-bc523c028881` was paused
through the public control surface. Its in-flight work released cooperatively,
and `profiles.wsl-chrome-3.services.chatgpt.liveFollow.enabled` was set to
`false`. Re-enable only after the foreground-priority contract is implemented
and validated.
