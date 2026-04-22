# Plan 0022 | Provider Selector Diagnosis Hardening

State: CLOSED
Lane: P01

Closed: 2026-04-21
Outcome: Grok and ChatGPT doctor selector diagnosis now distinguishes
non-conversation home/new-chat surfaces from conversation-output readiness.

## Purpose

Make `auracall doctor --json` selector diagnosis useful on current Grok and
ChatGPT home/non-conversation surfaces without weakening the dispatcher/account
ownership proof completed in Plan 0021.

This is a narrow browser-service reliability slice. It should harden diagnostic
classification and selector expectations; it should not widen browser execution,
login automation, provider feature discovery, or runtime scheduling.

## Current State

Completed state:

- Plan 0021 closed the managed browser profile CDP ownership bug with
  dispatcher acquisition across login, setup, doctor, features, browser
  execution, and managed-profile `browser-tools`.
- Serial live smoke on 2026-04-21 proved default Grok, ChatGPT, and Gemini
  account/profile separation:
  - Grok: default managed browser profile on port `45040`, selected
    `https://grok.com/`, identity `Eric C` / `@SwantonDoug` /
    `ez86944@gmail.com`, no blocking state.
  - ChatGPT: default managed browser profile on port `45065`, selected
    `https://chatgpt.com/`, identity `ecochran76@gmail.com`, no blocking
    state, distinct from `wsl-chrome-2/chatgpt` on port `45013`.
  - Gemini: default managed browser profile on port `45000`, selected
    `https://gemini.google.com/app`, identity `Eric Cochran` /
    `ecochran76@gmail.com`, feature evidence present, no blocking state.
- During that smoke, Grok and ChatGPT doctor commands exited nonzero because
  selector diagnosis expected conversation/run surfaces while the selected
  tabs were provider home surfaces:
  - Grok home had composer/model/upload selectors but no assistant bubble,
    assistant role, or copy button.
  - ChatGPT home had composer/model/upload selectors but no send button,
    assistant bubble, assistant role, or copy button.
- Gemini doctor passed on the current home/app surface.
- `src/inspector/doctor.ts` now classifies the selected provider surface as
  `conversation` or `non-conversation`.
- On non-conversation surfaces, prompt-dependent `sendButton` checks and
  conversation-output checks (`assistantBubble`, `assistantRole`, `copyButton`)
  are deferred instead of failing account/profile health.
- Diagnosis reports now include:
  - `surface.kind`
  - `surface.reason`
  - `surface.requiredChecks`
  - `surface.deferredChecks`
  - `failedRequiredChecks`
- Focused tests cover ChatGPT home, Grok home, and ChatGPT conversation
  surfaces.
- Live verification on 2026-04-21:
  - Grok default managed browser profile on port `45040` returned
    `allPassed: true`, selected `https://grok.com/`, saw no blocking state,
    and deferred only `sendButton`, `assistantBubble`, `assistantRole`, and
    `copyButton`.
  - ChatGPT default managed browser profile on port `45065` returned
    `allPassed: true`, selected `https://chatgpt.com/`, saw no blocking state,
    and deferred the same prompt/conversation-output checks.

## Scope

### In scope

- Separate account/profile health from provider action-surface readiness in
  doctor selector diagnosis.
- Teach Grok and ChatGPT selector diagnosis to classify home/new-chat surfaces
  as healthy when the appropriate composer/account evidence is present and no
  conversation output is expected.
- Keep conversation/run selector checks available for surfaces where an
  assistant response or copy action is actually expected.
- Preserve machine-readable JSON evidence:
  - selected URL/title
  - provider surface kind
  - required selector groups for that surface
  - optional selector groups deferred because the surface has no conversation
    turn yet
  - blocking state
- Add focused tests for Grok and ChatGPT home-surface diagnosis and for
  conversation-surface selector expectations.

### Out of scope

- Sending prompts or creating conversations as part of doctor.
- Provider login automation or CAPTCHA/human-verification bypass.
- Changing dispatcher acquisition semantics from Plan 0021.
- Adding shared-read dispatcher classes.
- Broad UI automation repairs for prompt send, project CRUD, uploads, or
  artifact extraction unless a selector-diagnosis test requires a narrow shared
  helper.

## Acceptance Criteria

- `auracall doctor --target grok --json` can report a healthy account/profile
  state on the Grok home/new-chat surface without failing only because no
  assistant conversation selectors exist.
- `auracall doctor --target chatgpt --json` can report a healthy
  account/profile state on the ChatGPT home/new-chat surface without failing
  only because no assistant conversation selectors exist.
- Conversation/run surfaces still require assistant-output selectors when the
  diagnostic surface kind says an assistant turn should exist.
- Blocking states such as CAPTCHA, Google `sorry`, human verification, and
  visible anti-bot pages still force nonzero posture and remain a hard stop.
- JSON output distinguishes:
  - account/profile health
  - surface readiness
  - action-surface readiness
  - conversation-output readiness
- Focused tests prove the new classification for Grok and ChatGPT without
  depending on live providers.

## Validation

- Focused tests:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts tests/browser/browserTools.test.ts --maxWorkers 1`
  - add provider selector-diagnosis tests where the relevant helpers live.
- Typecheck:
  - `pnpm run check`
- Plan/docs validation:
  - `pnpm run plans:audit`
  - `git diff --check`
- Optional live smoke after tests:
  - serial `auracall doctor --target grok --json`
  - serial `auracall doctor --target chatgpt --json`
  - stop immediately on any human-verification or anti-bot blocking state.

## Definition Of Done

- Grok and ChatGPT doctor output no longer conflates healthy signed-in home
  surfaces with failed conversation-output readiness.
- Selector diagnosis remains strict when the current surface should contain a
  conversation turn or response action.
- The Plan 0021 dispatcher/account proof remains intact and unchanged.
- Any live remaining failure is recorded as either provider blocking state,
  account/auth failure, or a new bounded selector drift item.

Status: complete as of 2026-04-21.
