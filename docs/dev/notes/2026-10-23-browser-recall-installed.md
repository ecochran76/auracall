# Browser Recall — installed availability, 2026-10-23

Issue #240 / Plan0448. Operator clarified another agent borrowed the managed
browser profile and left it running after finishing. Recall makes recovery an
explicit rail action instead of requiring manual process cleanup.

## Contract and source

Recall appears only for an unavailable local managed browser profile with one
qualified same-user holder using the configured executable. Confirmation binds
to PID/start/boot/executable/directory. A changed or ambiguous holder is refused.
The operator confirms its open tabs can close; Recall sends SIGTERM, waits for
that holder to stop, then uses ordinary Wake/placement on the same managed data.
No profile reset, forced SIGKILL, guessed assignment adoption or new allocator.
If graceful stop or the subsequent launch fails, report the failure rather than
claiming recovery. Repeated/stale confirmations cannot terminate a replacement.

Source281f34102 / PR386 merged956dca970. Twelve focused tests pass across real
process stop/sibling isolation/data preservation, ambiguity and replay refusal,
inventory eligibility/privacy, operator HTTP authorization, rendered confirm/cancel,
and existing native CDP fences. Full build, typecheck, final compile, docs:list,
scoped checks and whitespace checks pass; two existing protocol-naming warnings.
Primary Standards/Spec review: no blocking findings against this bounded contract.

## Installed readback

Prefix ~/.auracall/user-runtime-issue240-recall-281f34102; API PID1283976.
Before restart the API selected zero run claims. Authenticated actual app shows
Recall on wsl-chrome-3. Its confirmation was opened and cancelled; zero Recall
requests were sent. The borrowed-holder fingerprint remains identical across
installation and UI inspection. The operator will perform the real Recall;
fixture stop/relaunch wiring is not a claim that the borrowed browser was recalled.

The exact owned inspection task335 closed; all14 captured process identities
are absent. Private UI screenshot, cancelled-dialog result, holder-preservation
result, process identities and cleanup are under
~/.local/state/auracall-recall-20261023/. Authentication values and browser pixels
remain private. Installed profileRecall.js SHA256:
32017bdb720de561d77acd43d36873e02178d39f13f11630e01b3516bea34f7a.

This completes the bounded Recall control. Physical root/input acceptance and
native typing/clipboard symptoms remain separate from this feature. Memory
forbidden: no explicit save request; non-write disposition retained privately.
