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

## Preserve selector separation

Keep mode selection in
`src/browser/actions/chatgptComposerMode.ts` and Work model selection in
`src/browser/actions/chatgptWorkModelSelection.ts`.

Support the verified mode-control families without broad text matching:

- A persistent `radiogroup` exposes exact `Chat` and `Work` radios.
- A compact exact `Chat` or `Work` menu trigger exposes exact
  `menuitemradio` choices.

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

## Gate live inspection and canaries

- Require explicit authority before launching, attaching to, navigating, or
  mutating a browser, installing the runtime, restarting a service, or sending
  a prompt.
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
