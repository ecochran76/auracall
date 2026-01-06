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
Selectors observed in `https://grok.com/project/ef52c821-cc28-4166-9e27-2e61b40a2a81`:
- **Composer input**: `div.ProseMirror[contenteditable="true"]` (tiptap editor)
- **Send button**: `button[aria-label="Submit"][type="submit"]`
- **Message bubbles**: `main .message-bubble`
  - **Assistant**: bubble includes `w-full max-w-none`
  - **User**: bubble includes `bg-surface-l1`
- **Attach button**: `button[aria-label="Attach"]`
- **Attachments menu items** (role `menuitem`): `Upload a file`, `Add text content`, `Draw a sketch`, `Google Drive...`, `Connect Microsoft OneDrive`, `Recent`
- **Hidden file input**: `input[type="file"].hidden` (multiple=true)

Login/blocked detection:
- Not logged in → redirect to `https://accounts.x.ai/sign-in?redirect=grok-com`.

## Attachments (confirmed)
- The hidden `input[type=file]` works without opening the menu.
- Programmatic flow:
  - Locate `input[type=file]` (hidden, multiple).
  - Use CDP `DOM.setFileInputFiles` (or Puppeteer `uploadFile`) to attach.
  - Verify by checking DOM for the filename.

## Model selector (Auto / Fast / Expert / Grok 4.1 Thinking / Heavy)
- **Toggle button**: `button[aria-label="Model select"]` (shows current label text).
- **Menu items**: `[role="menuitem"]` with text starting with: `Auto`, `Fast`, `Expert`, `Grok 4.1 Thinking`, `Heavy`.
- Verified toggling works when the menu is already open:
  - Click menu item → button text updates.

Programmatic opening challenge:
- Menu closes immediately when opened via `page.evaluate()`.
- Works reliably when user opens it (Tab twice from prompt, then Space).

Possible automation strategies:
1) **Keyboard-driven open**:
   - Focus prompt (`div.ProseMirror[contenteditable="true"]`).
   - Send `Tab` twice to focus the model selector.
   - Send `Space` to open the menu.
   - Select `[role=menuitem]` by label.
2) **Mouse-driven open with delay**:
   - Click the model button via `Input.dispatchMouseEvent` (CDP), then wait 200–400ms before querying items.
3) **Puppeteer click + waitForSelector**:
   - Use `page.click('button[aria-label="Model select"]')` then `page.waitForSelector('[role=menuitem]')`.
4) **Fallback**: if menu cannot be opened programmatically, allow “leave current mode” and skip switching.

## Code changes (sketch)
- Add Grok constants in `src/browser/constants.ts` or new `src/browser/grok/constants.ts`:
  - `GROK_URL`, `GROK_INPUT_SELECTORS`, `GROK_SEND_BUTTON_SELECTORS`, `GROK_ANSWER_SELECTORS`, `GROK_MODEL_BUTTON_SELECTOR`, `GROK_MODEL_ITEM_SELECTOR`.
- Add Grok actions module(s):
  - `navigateToGrok`, `ensurePromptReadyGrok`, `ensureLoggedInGrok`, `readGrokAnswer`, `selectGrokMode`.
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
