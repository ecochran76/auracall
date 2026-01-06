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
- **URL**: likely `https://x.com/i/grok` (confirm).
- **Composer input**: Grok prompt area selector(s).
- **Send button**: submit control selector(s).
- **Assistant response**: response container selector(s).
- **Login/blocked UI detection**: login CTA, Cloudflare interstitial, etc.

Inputs to confirm:
1) Exact Grok URL target
2) Whether X/Grok is already logged in for the manual profile
3) DOM sniff from DevTools to lock selectors

## Code changes (sketch)
- Add Grok constants in `src/browser/constants.ts` or new `src/browser/grok/constants.ts`:
  - `GROK_URL`, `GROK_INPUT_SELECTORS`, `GROK_SEND_BUTTON_SELECTORS`, `GROK_ANSWER_SELECTORS`, etc.
- Add Grok actions module(s):
  - `navigateToGrok`, `ensurePromptReadyGrok`, `ensureLoggedInGrok`, `readGrokAnswer`.
- Provider abstraction (minimal):
  - `BrowserProvider { navigate, ensureReady, ensureLoggedIn, sendPrompt, readAnswer, selectors }`.
  - Default provider: ChatGPT; new provider: Grok.
- Routing:
  - Use Grok provider when `browser.target: "grok"` or `--model grok-*` is set.

## Docs/tests
- Add `docs/grok.md` or extend `docs/browser-mode.md` with setup + login.
- Optional: minimal smoke test to verify prompt->response on Grok.

## Risks/notes
- Grok/X likely uses stronger anti-bot and dynamic selectors.
- Cookie-only client likely brittle; prefer full browser automation.
- Manual-login persistent profile recommended.
