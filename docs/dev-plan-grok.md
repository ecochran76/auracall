# Grok Browser Automation Dev Plan

## Goals
- Add Grok browser automation by reusing the existing ChatGPT browser engine.
- Keep provider-specific logic isolated to selectors + flow, while sharing lifecycle, cookie handling, and reattach logic.

## Current reusable pieces
- `src/browser/chromeLifecycle.ts` — launch/connect/hide Chrome.
- `src/browser/profileState.ts` — DevTools port reuse + cleanup.
- `src/browser/actions/promptComposer.ts` — prompt composition + paste.
- `src/browser/actions/assistantResponse.ts` — response polling + extraction pattern.
- `src/browser/actions/navigation.ts` — Cloudflare/blocked UI handling.
- `src/browser/index.ts` — session lifecycle, cookies, reattach, logging.

## Grok-specific flow (selectors + logic)
Needs concrete selectors for:
- **URL**: `https://grok.com/project/ef52c821-cc28-4166-9e27-2e61b40a2a81` (current target)
- **Composer input**: `div.ProseMirror[contenteditable="true"]` (tiptap editor)
- **Send button**: `button[aria-label="Submit"][type="submit"]`
- **Assistant response**: `main .message-bubble.w-full.max-w-none` (assistant bubbles fill width; user bubble has `bg-surface-l1`)
- **Login/blocked UI detection**: redirect to `https://accounts.x.ai/sign-in?redirect=grok-com` indicates not logged in

Selectors found via DevTools (port 9222):
- Input: `div.ProseMirror[contenteditable="true"]`
- Submit: `button[aria-label="Submit"][type="submit"]`
- Response: `main .message-bubble` (assistant vs user discriminated by class: assistant has `w-full max-w-none`, user has `bg-surface-l1`)

## Code changes (sketch)
- Add Grok constants in `src/browser/constants.ts` or new `src/browser/grok/constants.ts`:
  - `GROK_URL`, `GROK_INPUT_SELECTORS`, `GROK_SEND_BUTTON_SELECTORS`, `GROK_ANSWER_SELECTORS`
- Add Grok actions module(s):
  - `navigateToGrok`, `ensurePromptReadyGrok`, `ensureLoggedInGrok`, `readGrokAnswer`
- Provider abstraction (minimal):
  - `BrowserProvider { navigate, ensureReady, ensureLoggedIn, sendPrompt, readAnswer, selectors }`
  - Default provider: ChatGPT; new provider: Grok
- Routing:
  - Use Grok provider when `browser.target: "grok"` or `--model grok-*` is set

## Docs/tests
- Add `docs/grok.md` or extend `docs/browser-mode.md` with setup + login
- Optional: minimal smoke test to verify prompt->response on Grok

## Risks/notes
- Grok/X likely uses stronger anti-bot and dynamic selectors.
- Cookie-only client likely brittle; prefer full browser automation.
- Manual-login persistent profile recommended.
