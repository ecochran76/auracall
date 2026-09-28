---
name: auracall-chatgpt-browser
description: Configure, validate, and diagnose AuraCall ChatGPT browser runs while preserving composer-mode and third-party tool-approval contracts. Use for ChatGPT browser CLI/config changes, model-selector or tool-approval work, provider-free selector tests, live DOM inspection, browser canaries, or related operator docs.
---

# AuraCall ChatGPT browser modes

Keep Chat as the normal AuraCall path. Enter Work only when the request names
Work explicitly, and never cross the two model-selector systems.

## Establish the boundary

1. Read the repo `AGENTS.md` and the policies relevant to the requested change.
2. Read the current contract in `README.md`, `docs/testing.md`, and
   `docs/wsl-chatgpt-runbook.md`.
3. Classify the work as provider-free or live before running a command.
4. Record the exact AuraCall runtime profile and browser profile for any live
   work. Do not use plain `profile` when the meaning is ambiguous.

## Choose the composer mode

| Requested behavior | Composer mode | Model path |
| --- | --- | --- |
| Normal ChatGPT prompt | `chat` (default) | Chat picker through `--model`, `--browser-model-strategy`, and optional Chat thinking controls |
| Explicit Work request | `work` | Dedicated Work slider through `--browser-work-model` |

Use Chat without a mode flag for the normal path:

```bash
auracall_runtime_profile=wsl-chrome-3
pnpm tsx bin/auracall.ts --profile "${auracall_runtime_profile}" --engine browser \
  --browser-model-strategy current \
  -p "Reply exactly with: AURACALL_CHAT_MODE_OK"
```

`--browser-model-strategy current` opens the Chat model picker read-only,
preserves its checked model, and records the observed picker label separately
from the requested model. It does not mean “skip model observation”; use
`ignore` for that behavior.

Use both Work flags when Work and a named Work model are required:

```bash
auracall_runtime_profile=wsl-chrome-3
pnpm tsx bin/auracall.ts --profile "${auracall_runtime_profile}" --engine browser \
  --browser-chatgpt-mode work \
  --browser-work-model "GPT-5.6 Terra" \
  -p "Reply exactly with: AURACALL_WORK_MODE_OK"
```

Reject or repair these invalid combinations:

- Do not use `--browser-work-model` unless the mode is `work`.
- Do not use the Chat picker, Chat thinking-time controls, or Chat composer
  tools after selecting Work.
- Do not infer Work from sticky browser state. Omitted mode means Chat.
- Do not fall back to the Chat picker when the Work selector is absent.
- Do not classify composer mode from `[data-animated-slider-trigger="true"]`;
  that selector is shared by Chat thinking controls and Work model controls.

## Preserve selector separation

Keep mode selection in
`src/browser/actions/chatgptComposerMode.ts` and Work model selection in
`src/browser/actions/chatgptWorkModelSelection.ts`.

Support the verified mode-control families without broad text matching:

- A persistent `radiogroup` exposes exact `Chat` and `Work` radios.
- A compact exact `Chat` or `Work` menu trigger exposes exact
  `menuitemradio` choices.
- On an established route without either control, explicit Work is proven only
  by the visible active conversation link whose `href` resolves to the current
  pathname and whose descendant `span` has exact normalized text `Work`.
- Established Chat may use the exact visible enabled prompt editor only when
  that active Work badge is absent. A visible `High` thinking control does not
  disqualify Chat.

Treat Work's model selector as a separate nested surface:

1. Open the button containing `[data-animated-slider-trigger="true"]`.
2. Select **Show advanced options** when the compact menu omits the model row.
3. Open the exact **Model ...** submenu.
4. Select and verify the exact Work model `menuitemradio`.

If current DOM evidence does not match either contract, stop and capture
bounded diagnostics. Keep provider-specific trigger and label heuristics in the
ChatGPT adapters unless the same shape repeats in another provider.

## Preserve tool-approval preference

Default `--browser-chatgpt-tool-approval` to `manual`. Use `allow-once` or
`always-allow` only when the operator explicitly selected that preference.
During post-submit response waiting:

1. Require one visible approval surface containing exact `Allow once` and
   `Always allow` controls.
2. Click only the configured exact action with trusted pointer input.
3. Verify that the surface disappears and never click the same surface twice.
4. Fail closed on missing, duplicate, ambiguous, or unconfirmed surfaces.
5. Never click ChatGPT's `Answer now` button.

## Validate provider-free first

Run the focused contract suite before any installed or live proof:

```bash
pnpm vitest run \
  tests/browser/chatgptToolApproval.test.ts \
  tests/browser/chatgptComposerMode.test.ts \
  tests/browser/config.test.ts \
  tests/cli/browserConfig.test.ts \
  tests/runtime.configuredExecutor.test.ts \
  tests/schema/chatgptMode.test.ts \
  tests/schema/resolver.test.ts
```

For a source change, also run the affected typecheck, lint, build, CodeGraph
readback, diff hygiene, and planning audit required by repo policy.

## Continue one long request with codex-wake

For a Pro, Deep Research, or connected-capability request that should resume
the current Codex thread later, follow
[`docs/codex-wake-chatgpt.md`](../../../docs/codex-wake-chatgpt.md). Read that
recipe completely before sending the prompt. Its required authority chain is:

1. Enable schema-version-1 terminal-session receipts and confirm the private
   root is ready.
2. Verify the installed AuraCall CLI and loopback API share the same user,
   build, config, and `AURACALL_HOME_DIR`.
3. Validate the real `CODEX_THREAD_ID` through `codex-wake app status
   --resume`; require an active monitor for the exact wake root.
4. Submit one browser request with an explicit AuraCall runtime profile and a
   unique three-to-five-word `--slug`. Capture the actual session ID from one
   session inventory readback.
5. Read `GET /v1/terminal-receipts/{session_id}` once while it is pending and
   capture the exact `eventId`, `idempotencyKey`, `sessionRef`, and relative
   `receiptLocator`.
6. Configure one fixed `codex-wake http-json` source with `/status`,
   `/eventId`, and `/completedAt`; select the exact observation object and
   event kind; treat `succeeded`, `error`, `cancelled`, and `integrity_error`
   as terminal.
7. Arm one app-server wake with the receipt `idempotencyKey`,
   `--max-attempts 1`, and `--require-monitor`, then yield. Do not have the
   agent sleep or poll.
8. On the resumed turn, read the observation and session once, match both
   identities, verify `browser.config.auracallProfileName`, ChatGPT target,
   managed browser profile path, and terminal-receipt intent, then continue
   only for verified success.

Never substitute `/v1/runs/{run_id}/status`: it does not attest publication of
the CLI session receipt. Never resubmit after an ambiguous exit or a terminal
`error`, `cancelled`, or `integrity_error`. A wake acknowledgement proves turn
submission, not successful resumed work. `codex-wake cancel` cancels only the
continuation; it does not cancel provider work.

Connected apps use a stable discovered `chatgpt.apps.*` composer-capability ID
and must already be connected. ChatGPT Library files use the separate
`auracall.libraryFiles` API request collection; they are not composer tools or
local attachments, and response-run status is not interchangeable with this
CLI receipt workflow.

## Gate live inspection and canaries

- Require explicit authority before launching, attaching to, navigating, or
  mutating a browser, installing the runtime, restarting a service, or sending
  a prompt.
- Use the installed `auracall` launcher for installed/runtime/live proof and
  record its version and resolved target. Repo-local `pnpm tsx` proves only the
  exact source checkout that ran it.
- For a private ChatGPT developer app, select the exact app through the active
  composer's `@mention` ecosystem picker and verify its composer-local
  `ecosystemMention` plugin pill. Source `apps test --submit` now uses that
  path and rejects a non-fresh or nonempty composer, document-reference pill, or wrong app
  identity. An installed runtime must contain the repair before it can prove
  this behavior.
- Developer-app submit tests preserve the current Chat model. Treat a resolved
  model target and the visible active composer model as separate evidence.
- For a suspicious authorized smoke, add `--browser-keep-browser --verbose` and
  inspect the exact retained browser with the `agent-browser` skill or
  `pnpm tsx scripts/browser-tools.ts ...`.
- Use the smallest live proof: one exact AuraCall runtime profile, one short
  prompt, one expected token, and no retry unless the governing plan allows it.
- Never click ChatGPT's **Answer now** button.
- Treat CAPTCHA, human verification, identity mismatch, unknown browser
  ownership, or missing selector separation as a hard stop.
- Do not pause, resume, or start scheduler, completion, or materialization work
  unless the user explicitly authorizes that separate control effect.

After live work, close only the exact owned browser/session and record the
mode, model path, AuraCall runtime profile, browser profile, prompt count,
cleanup evidence, and whether any scheduler or materialization control ran.
