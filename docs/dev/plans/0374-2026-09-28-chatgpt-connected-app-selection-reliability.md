# ChatGPT Connected-App Selection Reliability | 0374-2026-09-28

State: CLOSED
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
