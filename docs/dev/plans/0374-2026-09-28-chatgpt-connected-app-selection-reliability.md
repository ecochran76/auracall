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

- Installed session `github-connector-1790645332` selected the exact connected
  GitHub object, submitted once, returned the expected issue title, and
  published verified succeeded receipt
  `evt_59a5c1f7a6e650b31b6a364e574c0f3592063ebb941986b581a2d3c49ca6ccef`.
- A second authorized session, `github-wake-1790647330`, also completed the
  exact connector request and published verified succeeded receipt
  `evt_a90be7c8f0b433bb45632e3f145f2d6546eab591a94f1aa5576acc4ee59a11a4`.
- Automatic Codex resumption is still unaccepted because both wakes forced the
  app-server transport into the active writer even though the originating
  Codex TUI exposed tmux pane `%28`. The recipe and skill now preserve
  codex-wake's default current-pane capture for tmux and reserve explicit
  app-server targeting for headless workflows.
- Both failed wakes were single-attempt and were not retried. They are archived,
  their sources and temporary service credential are removed, and active wake
  count is zero.
- Authorized session `github-tui-wake-1790650111` then failed closed before
  provider effect because two valid unexpired idle tab leases fenced browser
  startup. No wake was armed. One fresh tmux-targeted installed acceptance
  remains open and requires new retry authority after the leases retire.

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

## Exact-tip Installed Acceptance | Connector Passed, Wake Missed

- Built and installed exact PR tip
  `94323efcaafe80483cca516bf47868e667098123`; the complete installed `dist`
  tree matched the checkout byte-for-byte and `auracall-api.service` restarted
  active at PID `28623`.
- The existing read-only capability inventory again emitted no output and hit
  its single 240-second ceiling. It was not retried. The one authorized request
  instead used the previously proven stable capability ID
  `chatgpt.apps.github`, with the installed path retaining every pre-Send
  account and connector verification.
- Session `github-connector-1790645332` used AuraCall runtime profile
  `wsl-chrome-3`, managed browser profile
  `~/.auracall/browser-profiles/wsl-chrome-3/chatgpt`, ChatGPT Pro personal
  identity `eric.cochran@soylei.com`, and an exact connected/available/verified
  `chatgpt.apps.github` object. It submitted once and returned exactly
  `Select ChatGPT connected apps through filtered drawer rows`.
- Terminal receipt
  `evt_59a5c1f7a6e650b31b6a364e574c0f3592063ebb941986b581a2d3c49ca6ccef`
  verified succeeded with result digest
  `sha256:dbf1bbc9fe31b74e8dc913fff16d0cdaf426c6b3494d9440e5b568171bee7ef0`
  and 73 bytes.
- The pending observation was captured before completion, but the fixed source
  check raced and returned terminal `succeeded`. The same chained command then
  incorrectly armed `wake_1a94b101f2dc4867bfbc6885b0ba92bf` after terminal
  completion. Its sole app-server dispatch failed with `active writer`; no
  automatic Codex resumption occurred and no second wake was armed.
- Cleanup archived the failed wake, removed source
  `auracall-github-connector-1790645332`, removed the temporary
  `AURACALL_API_KEY` user-manager credential, restarted the existing wake
  service, and confirmed zero active wakes. Scheduler and materialization
  controls were not paused, resumed, or otherwise changed.
- Result: issue 121's installed connector and corrected committed-turn
  classification are accepted. PR merge and issue closure remain blocked on
  the still-required automatic Codex resumption proof.

## Second Wake Attempt | Wrong Transport

- Fresh authorized session `github-wake-1790647330` again selected and
  verified the exact connected GitHub object, returned the expected issue
  title, and published verified succeeded receipt
  `evt_a90be7c8f0b433bb45632e3f145f2d6546eab591a94f1aa5576acc4ee59a11a4`.
- Wake `wake_c0fa53414f6f49708bcb41ef8f3630fb` was correctly armed while the
  receipt was pending and matched its exact terminal event. It did not resume
  Codex because the recipe forced app-server dispatch into the active writer.
- The executing Codex runtime was a tmux-hosted TUI with `TMUX_PANE=%28`.
  Installed codex-wake 0.6.0 defaults to capturing that pane; the explicit
  `--app-server-thread-id` option overrides the appropriate TUI transport.
- The failed wake was not retried. It is archived, its source and temporary
  service credential are removed, and active wake count is zero.
- The canonical recipe and browser skill now select the actual runtime:
  default tmux capture for a live TUI, explicit validated app-server targeting
  only for a headless workflow. A published-doc regression preserves this
  transport split. One fresh tmux-targeted installed acceptance remains.

## Tmux-Targeted Retry | Pre-Effect Lease Fence

- Restarted the authorized installed API service after its prior PID remained
  active without a listening socket. The old process required systemd's
  bounded stop timeout and `SIGKILL`; the replacement became healthy at PID
  `48758` on configured loopback port `18095`.
- The complete installed `dist` tree still matched the tested checkout, the
  schema-v1 terminal receipt route was ready, the persistent wake monitor was
  active, and the executing Codex TUI exposed tmux pane `%28`.
- Fresh session `github-tui-wake-1790650111` selected AuraCall runtime profile
  `wsl-chrome-3` and stable capability `chatgpt.apps.github`, but browser
  startup failed with `tab-leases-active` before opening or submitting to
  ChatGPT. Verified terminal error receipt:
  `evt_0dd700113a904028d83b30c15e5fdc83680a417d6bb58f87d44e74491a691249`.
- Read-only tab-concurrency evidence showed zero active, lost, retiring, or
  uncertain leases and two settled idle leases with about 95 and 228 seconds
  remaining. They were legitimate fences, so the run did not override or
  retire them.
- No wake or HTTP/JSON source was created. The temporary user-manager API
  credential was removed, the wake service was restarted without it, and the
  persistent wake root again reported zero active wakes.
- Result: the corrected tmux transport was selected but not exercised because
  the request ended pre-effect. Do not retry this terminal session. A distinct
  fresh run needs explicit authority after the idle leases retire.
