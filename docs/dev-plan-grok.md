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
Selectors observed in `https://grok.com/c/<conversation-id>`:
- **Composer input**: `div.ProseMirror[contenteditable="true"]` (tiptap editor)
- **Send button**: `button[aria-label="Submit"][type="submit"]`
- **Message rows**: `main div.relative.group.flex.flex-col`
  - **Assistant**: `main div.relative.group.flex.flex-col.items-start`
  - **User**: `main div.relative.group.flex.flex-col.items-end`
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
- Confirmed programmatic switching works via keyboard navigation:
  - Focus prompt (`div.ProseMirror[contenteditable="true"]`).
  - Press `Tab` twice to focus the model selector.
  - Press `Space` to open the menu.
  - Click `[role=menuitem]` for the target label.
  - Verified switching to `Fast` and back to `Auto`, and to `Grok 4.1 Thinking`.

Programmatic opening strategy (reliable):
- Use keyboard navigation (Tab/Space) rather than `page.evaluate()` clicks; the menu closes too quickly with pure DOM clicks.

## Project URL + session tracking (confirmed)
- The Grok project URL is a dedicated Oracle project.
- **Chat ID is in the query string** after sending:
  - Example: `https://grok.com/project/<project-id>?chat=<chat-id>&rid=<request-id>`
- Session management should parse `chat` from the query params, not a `/chat/` path.

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
- Add `--grok-url` for targeting specific Grok projects from the CLI.
- Minimal smoke test: `scripts/grok-dom-smoke.ts` validates selectors + model switch against a live Grok tab.

## Risks/notes
- Grok/X likely uses stronger anti-bot and dynamic selectors.
- Cookie-only client likely brittle; prefer full browser automation.
- Manual-login persistent profile recommended.
