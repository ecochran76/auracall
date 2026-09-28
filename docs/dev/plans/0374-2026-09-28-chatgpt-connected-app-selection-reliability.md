# ChatGPT Connected-App Selection Reliability | 0374-2026-09-28

State: OPEN
Lane: P74
Work item: #121
Source base: `origin/main` at `fe6375955848afabacd9ef554dc943529866bcd1`
Branch: `fix/issue-121-connected-app-selection`

## Objective

Select known ChatGPT connected apps through ChatGPT's composer tool drawer and
verify the inline connector object that selection inserts into the composer.

## Current State

- Session `mail-architectu-wake-1790608058` published verified terminal error
  receipt `evt_fa137ebe788e59b375a4cd027968e91f7ad108efbd376b0e6f7b433d887babcc`.
- GitHub was visible in the composer menu but fell through to generic
  persistent-tool selection and failed its stayed-selected proof before Send.
- The terminal session was not retried and no wake was armed.
- The retained browser is still protected by its installed API operation; this
  plan does not override that lease or clean up its state.

## Scope

- Recognize exact known connected-app labels from the bundled ChatGPT app
  manifest even when a menu row has no legacy icon, link, identity attribute,
  or Connect marker.
- With the drawer open, type the exact connector label into the composer,
  activate the filtered row once, and never click a `Connect` row.
- Require the resulting non-editable `[app-mention-name]` object to expose an
  exact label and `app://connector_...` path before returning a verified
  connected-app receipt.
- Leave the separate developer-app `@mention` path unchanged.
- Add provider-free regressions and update operator-facing documentation.

## Non-goals

- Treating an arbitrary label as a connected app.
- Relaxing ambiguity, connection, exact-label, provider-identity, or pre-Send
  selection checks.
- Retrying the terminal session, submitting a prompt, arming a wake, overriding
  the active browser operation, or performing broad process cleanup.
- Running GitHub Actions.

## Acceptance Criteria

- [x] Markerless rows for manifest-known apps remain available for connected-
      app resolution.
- [x] Drawer selection must expose an exact inline connector object or fail closed.
- [x] Unknown markerless rows remain on the generic-tool path.
- [x] Existing missing, ambiguous, disconnected, and identity-mismatch cases
      remain fail-closed before Send.
- [x] Focused tests, typecheck, scoped lint/build checks, planning audit, and
      diff hygiene pass.
- [x] One fresh installed acceptance remains a separate explicit authority
      gate after source validation.

## Definition Of Done

The provider-free correction is committed on the issue-backed branch with
current validation evidence, while the complete codex-wake path remains
explicitly unaccepted until a separately authorized fresh installed run.

## Validation Evidence

- Superseded source checkpoint: `098fc819e70bab95c8863d7ed9b48e3efa466fe5`
  used the wrong developer-app `@mention` interaction and is not acceptance evidence.
- Corrected source checkpoint: `423131184ab7f3b4876256e63f97402b6e8e1d5b`.
- Live screenshot/CDP inspection proved the current drawer contract without
  Send: opening `Add files and more`, typing `GitHub`, and activating the only
  filtered row produced `[app-mention-name="github"]` with
  `app-mention-path="app://connector_76869538009648d5b282a4bb21c3d157"`.
- Focused corrected selection suites: 28/28 passed.
- Adjacent prompt and developer-app behavioral suites: 26/26 passed.
- `pnpm typecheck`: passed.
- Scoped Biome lint: passed with only the pre-existing CDP naming warnings in
  `chatgptComposerTool.test.ts`.
- `pnpm build`: passed.
- Plan-library audit: 373 candidates, 0 validation errors.
- `git diff --check`: passed.
- `tests/browser/llmServicePromptStructure.test.ts` retains one baseline regex
  failure reproduced unchanged on the untouched issue-107 worktree; it is not
  caused by this packet and was not expanded into issue 121.
- The inspection changed only the unsent composer and then cleared it. No
  provider submission, session retry, approval, `Answer now`, or wake dispatch
  was performed.

## Installed Acceptance | Blocked Before Send

- Installed PR tip `01caa1b64b0442e768d16c667583d58984440227` into the
  user-scoped runtime and restarted only `auracall-api.service`; the installed
  composer-tool and ecosystem-mention JavaScript digests exactly matched the
  checkout.
- The loopback API restarted at PID `84906`, advertised the schema-v1 terminal
  receipt route, and the persistent codex-wake monitor remained ready for the
  exact AuraCall wake root.
- Required read-only `wsl-chrome-3` app-capability discovery produced no
  terminal output for more than five minutes and was interrupted. One bounded
  180-second verbose diagnostic retry reproduced the same silent stall and
  terminated at its external ceiling.
- A bounded browser doctor after the first cancellation proved the retained
  ChatGPT root page was loaded, focused, authenticated, and had one visible
  contenteditable. It did not establish GitHub capability identity or
  connection state, so the runbook's pre-Send gate remained unsatisfied.
- No fresh session slug was allocated, no prompt was submitted, no terminal
  receipt was expected, and no codex-wake source or wake was armed. The prior
  terminal session was never retried.
- Next blocker: diagnose the installed `capabilities` command's non-terminating
  lifecycle without weakening connected-app discovery or bypassing its browser
  operation lease, then request a distinct fresh acceptance.

## Corrected Installed Run | Terminal Before Connector Selection

- Installed corrected PR tip `b5f8c46f7f06ee837190665380bef9769c7d5314`
  into the user runtime, restarted only `auracall-api.service`, and verified
  byte parity for the changed composer-tool and ecosystem-mention modules.
- Submitted exactly one fresh authorized read-only run:
  `github-wake-1790616900`, using AuraCall runtime profile `wsl-chrome-3` and
  stable capability `chatgpt.apps.github`.
- The run terminated before connector selection or Send because the model
  switcher exposed `6Pro` while the configured selector requested `6 Pro`.
  The provider boundary remained `pre_effect` and `retrySafe=true`.
- AuraCall published verified terminal error receipt
  `evt_45d98dd41979596590b284b8cc8d49494059c4e26a8e38bd19eebfbe7091f7a0`.
  The receipt was already terminal at the first authenticated observation, so
  no wake was armed and the session was not retried.
- Result: receipt publication passed again; the corrected connector selection,
  provider response, and automatic Codex resumption remain unexercised in one
  complete installed run. The new independent blocker is model-label drift,
  not connector selection.

## Current Installed Reproduction | Exact Label Extraction

- Submitted exactly one new installed run, `github-wake-1790631700`, with
  `--browser-model-strategy current` so issue 121 acceptance did not depend on
  the unrelated `6 Pro` selector drift.
- The run remained pre-Send and retry-safe, but exposed the remaining issue-121
  defect: inventory observed `GitHubTriage PRs, issues, CI, and publish flows`
  as selectable while resolution reported the GitHub capability missing.
- Screenshot/CDP inspection proved the row contains an inner exact `GitHub`
  span followed by a description span. The comma-separated primary-label
  selector returned the earlier outer wrapper in document order, concatenating
  the label and description.
- Regression coverage now requires primary selectors to be queried in explicit
  priority order. The same extraction contract is used for initial inventory,
  filtered drawer readback, and row activation.
- Terminal error receipt:
  `evt_66eef8046cb8b3048b22e2f5ffbac831af918898fd575d5492e164e77ba7a3ff`.
  The session was not retried and no wake was armed against its terminal receipt.

## Post-fix Installed Acceptance | Admission Race

- Installed commit `b46044aff613b5a6ca324266dff0a3c5c8c7d684` into the
  user runtime, restarted only `auracall-api.service`, and verified exact byte
  parity for the changed composer-tool JavaScript.
- Session `github-wake-1790631985` terminated before browser startup with
  `tab-leases-active`; verified receipt event:
  `evt_9b058e33d09d70666bd078c8ad7a7dce6590b87251e93ed75a2ca81be1622155`.
- A fresh read-only control-plane snapshot immediately afterward reported zero
  active browser operations and zero tab leases. One new uniquely identified
  session, `github-wake-1790632021`, nevertheless reproduced the same startup
  denial; verified receipt event:
  `evt_1697bba0c1638d2030ad55f5f4272348817e7e31419b77d6ad6ad5af8058033a`.
- Both failures were pre-provider and neither session was retried. No wake was
  armed against either terminal receipt. Further provider attempts stopped.
- Source correction is complete, but installed connector selection, response,
  and automatic Codex resumption remain unaccepted behind the independent
  tab-lease admission race. Issue 121 therefore remains open.

## Installed Connector Success | Committed-turn False Negative

- The legitimate idle lease expired normally without deletion or override.
  Installed session `github-wake-1790632645` then selected the GitHub connected
  app, submitted the prompt, and received the exact expected issue title.
- Screenshot and CDP readback prove the committed user turn retained the GitHub
  connector plus the complete prompt, and ChatGPT replied
  `Select ChatGPT connected apps through filtered drawer rows`.
- AuraCall nevertheless emitted verified terminal error receipt
  `evt_7f792f71e5c0e712d01290f7df6cfed7f76e267cd174807c8520e52e979f611f`
  because committed connector markup changes from `[app-mention-name]` in the
  composer to `[data-prompt-link-href="app://connector_..."]` in the user turn.
  The verifier counted the presentation-only `GitHub` label as prompt text and
  falsely reported that the prompt did not appear.
- The exact terminal event matched wake
  `wake_94e56c971e3c406aafda2d93bf5b5e1f`, but its single app-server dispatch
  attempt encountered an active writer and failed. The session was not retried
  and its terminal receipt was not re-armed.
- The committed-turn reader now excludes connector presentation nodes whose
  `data-prompt-link-href` starts with `app://`. A provider-free regression uses
  the observed committed markup and proves the retained prompt text is read
  exactly. Fresh installed acceptance remains required for both the corrected
  terminal classification and automatic Codex resumption.
