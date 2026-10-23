# Browser rail correction — installed acceptance, 2026-10-23

Work item #240; Plan0448 under Plan0391. Operator requires browser navigation
by account or browser profile, dormant browsers ready to Launch, and transparent
background desktop placement. The previous terminology-only cleanup did not
correct the rail or embedded login failure.

## Cause and change

The retained-desktop fallback included every empty allocation and repeated
represented browser rows for mixed desktops. Profile grouping used runtime IDs
instead of browser-profile IDs; ready-row metadata exposed allocation names.
The corrected client hides empty/unavailable allocation records, includes only
unmatched running browsers in its fallback, groups by configured browser profile
or account, and labels dormant actions Launch. Allocation semantics are unchanged.

Live authenticated inspection independently reproduced the broken-document
surface: Remote View redirects to cooper-auth, whose login has frame-ancestors
none. The client hid the embed helper's access link and status even on failure.
Show them when unavailable/disconnected, hide the failed iframe and offer an
explicit observation Retry after top-level sign-in. Existing authorized agent
credentials used once at top level restored the stream. Do not weaken CSP/auth.
User browser sessions may separately need the displayed top-level sign-in link.

## Source and installed proof

- Source PR380, commit a223d3878, merged178e21701.
- Rendered regression red before fix: expected zero allocation rows, received two.
- Ten focused tests across rendered rail/fallback/retry, runtime-profile inventory,
  operator HTTP boundary and automatic pool pass. Build, final compile, docs:list,
  formatting and whitespace checks pass. Existing naming warnings remain.
- Installed prefix: ~/.auracall/user-runtime-issue240-rail-a223d3878.
  Compiled desktopClientPage.js SHA256:
  dc4e02f161c2afe705765f454194b56b7394f07c734844a7450af25c10d315b0.
- API restarted with PID2161290. Both captured existing native browser identities
  still verify ready; no existing browser lifecycle or account data changed.
- Authenticated installed DOM: seven runtime-profile rows, five enabled Launch
  actions, one disabled Windows action with explicit local-runtime explanation,
  zero desktop allocation rows. Profile grouping matches all six distinct
  configured browser-profile IDs; Account grouping restored after the check.
- Actual stream reports ready and screenshot shows browser pixels. No framing
  policy error remains after sign-in. One unrelated HTTP400 console message was
  observed; connected-stream acceptance does not claim every request succeeded.
- Exact owned inspection task329 closed; all14 captured process identities gone.
  Authenticated inspection profile retained privately. No provider prompt, native
  control grant, historical marker preparation or assignment adoption performed.

Private screenshots, credentials-free summaries, installation log, runtime hash
and process receipts: ~/.local/state/auracall-desktop-simplification-20261023/.
Private browser pixels and authentication material are not published to Git.
Primary Standards and Spec review: no blocking findings against this bounded
correction; source, installed readiness and physical root/input remain distinct.
#240 remains open for the older physical root/input acceptance. Memory disposition
forbidden: no explicit save request; machine-readable non-write receipt retained.
