# Plan 0386 diagnosis reanchor — 2026-10-13

State: OPEN. This is a diagnostic checkpoint, not materialization acceptance.

## Corrected restart point

The October 5 tab-lifecycle acceptance is superseded as an execution locator by
the October 8–9 acceptance branch. Its final recorded retry is journey 9 of 10:
HTTP429 followed by two conversation HTTP404 responses, zero message mapping,
no new completed refresh and no automatic child. One journey remains unused;
the old retry window expired. Preserve all historical charges and stop receipts.

Current acceptance worktree is branch `docs/issue165-messages-diagnosis` at
`f4e0cd7ae6f0c76bd6ce9dddc0a5a6c218a01e59`, initially clean. Root main has
unrelated dirty work and does not include these later acceptance notes.

## Current installed readback

API PID 98570 is active with zero restarts. API and CLI both execute
`~/.auracall/user-runtime-issue253-app-blocker-scope/node_modules/auracall`.
Installed ChatGPT adapter SHA256:
`bd4402299c608ea0b0d6380ca893dab8de3bae6d3ea9288917787cc580baa547`.
This differs from the historical PR238 adapter receipt; installed source parity
with the acceptance branch is not claimed. Browser profile and AuraCall runtime
profile are both `wsl-chrome-3`; browser-family display is `:0.0`.

Scheduler and all 17 active completion records are paused, queued/running 0/0;
background drain is unpaused/idle. The selected parent remains
`acctmirror_completion_7aeaa36f-60ad-49cc-9e29-7877ba6329ca`, pass count 13,
provider guard null. Strict argument-prefix native census found no selected
managed browser process before or after the diagnostic command.

## One bounded diagnostic read

User resumed diagnosis with `ok go`. Exactly one direct context read ran with
zero retries and a 30-second read deadline; no scheduler/completion resume,
prompt, upload, installation, or materialization job was requested. This read is
outside the automatic acceptance seam and is not a tenth acceptance journey.

```sh
auracall --profile wsl-chrome-3 conversations context get \
  6ac76440-d80c-83e9-8b84-df32c009247d --target chatgpt \
  --refresh --retry-attempts 0 --timeout-ms 30000 --json-only
```

Exit 1, zero stdout bytes. Exact signal, with ephemeral target ID omitted:
`ChatGPT target … is on https://chatgpt.com/, not the expected
https://chatgpt.com/c/6ac76440-d80c-83e9-8b84-df32c009247d.`
Failure occurs in `connectToChatgptTab` before the message-reader path. It does
not reproduce the historical missing-message symptom, establish provider
recovery, prove identity, or identify its cause. Private stdout/stderr captures:
`/tmp/auracall-0386-diagnosis-20261013.{json,stderr}` (mode restricted).

Afterward: scheduler still paused, all 17 completion records paused, no running
completion, no selected managed browser process; leases active 0, idle 1,
retiring 0, lost 0. The settled lease is preserved; no manual registry mutation.

## Feedback-loop boundary

Primary ran the historical acceptance branch's existing provider-free tests:
four single-visit context cases passed; the transient context-read retry case
passed separately (one selected, 15 skipped). The four context cases inject
successful messages, and the retry case injects the error. Neither reproduces
the historical DOM/payload failure. No production change or causal fix claim.

The diagnosing-bugs skill requires `No red-capable command, no Phase 2`.
The original symptom still lacks a captured failing conversation response and
DOM structure with trustworthy expected message content. The new direct-read
route refusal is a separate diagnostic access blocker. Next local packet:
reproduce the public ChatgptService context-read/utility-affinity route handoff
with actual coordinator and adapter wiring, preserving navigation policy. Only
after that gate can a bounded response/DOM capture establish an offline loop for
the original symptom. Do not relax exact-target refusal or substitute a mocked
successful message response for acceptance.

Full changed/quiet A/B, composed guard/reload, and dependent scheduler acceptance
remain OPEN. No live retry was run after the failed diagnostic command.
