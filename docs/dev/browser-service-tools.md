# Browser Service Tools

This doc captures the reusable browser-service helpers and the patterns we want to
follow when automating UI flows. The goal is to keep Grok-specific hacks minimal
and push general strategies into browser-service so new service adapters are
faster to implement.

## Core helpers (packages/browser-service/src/service/ui.ts)

- `waitForSelector(Runtime, selector, timeoutMs)`
  - Polls for a selector to appear; prefer this over ad-hoc sleep loops.
  - Use after actions that spawn portals (Radix menus, dialogs) or lazy DOM.

- `waitForNotSelector(Runtime, selector, timeoutMs)`
  - Polls for a selector to disappear; use for modal/menu teardown.
  - Prefer this to fixed sleeps after closing dialogs or overlays.

- `isDialogOpen(Runtime, dialogSelectors)`
  - Light-weight check for modal presence.

- `waitForDialog(Runtime, timeoutMs, dialogSelectors)`
  - Waits for a dialog to appear. Use for modal-driven flows before interacting.

- `findAndClickByLabel(Runtime, options)`
  - Finds a clickable element by aria-label/text in a scoped root.
  - Prefer this to brittle CSS selectors when labels are stable.

- `closeDialog(Runtime, dialogSelectors)`
  - Closes dialogs via close button, backdrop, or Escape.
  - Use when a flow might leave a modal open and block other automation.

- `pressButton(Runtime, options)`
  - Clicks a button by selector or label match and waits for post conditions.
  - Supports scoped roots, visibility filtering, and post selectors.

- `openDialog(Runtime, options)`
  - Uses `pressButton` then waits for a dialog and optional ready selector.

- `openMenu(Runtime, options)`
  - Clicks a trigger and waits for the menu/listbox to appear (aria-controls aware).

- `selectMenuItem(Runtime, options)`
  - Clicks a menu item and optionally waits for the menu to close.

- `selectFromListbox(Runtime, options)`
  - Opens a listbox via trigger and selects an option.

- `openAndSelectMenuItem(Runtime, options)`
  - Opens a menu via trigger, selects an item, and optionally waits for close.

- `openAndSelectListbox(Runtime, options)`
  - Opens a listbox via trigger, selects an option, and optionally waits for close.

- `setInputValue(Runtime, options)`
  - Sets input/textarea/contenteditable value with input/change events.

- `togglePanel(Runtime, options)`
  - Opens/closes a panel using `pressButton` and open-state selectors.

- `hoverElement(Runtime, Input, options)`
  - Scrolls an element into view, computes a stable hover point, and moves the mouse there.
  - Verifies the hover point with `elementFromPoint` to ensure hover-driven controls appear.

- `pressRowAction(Runtime, options)`
  - Finds a row action button (Rename/Delete/etc.) near an anchor element and clicks it.
  - Uses proximity to the row to disambiguate buttons outside the row.

- `pressDialogButton(Runtime, options)`
  - Clicks a dialog action button by label, with optional `preferLast` for destructive confirms.

- `submitInlineRename(Runtime, options)`
  - Sets inline rename input value, submits via Enter, optionally clicks Save, and can wait for close.

## Patterns to follow

- Prefer event-driven waits (`waitForSelector`, `waitForDialog`) over fixed
  delays. If a delay is unavoidable, keep it short and document why.
- Scope queries to the active dialog or sidebar when possible to avoid matching
  unrelated UI (e.g., `dialog` + `input[placeholder*="Project name"]`).
- When a menu is tied to `aria-controls`, click the trigger, then wait for the
  listbox by id before selecting items.
- Avoid Escape unless you are certain it only closes the menu; some modals
  interpret Escape as a full dialog close.
- When closing a dialog or overlay, prefer `waitForNotSelector` over fixed
  delays to avoid racing UI transitions.
- Keep reusable UI helpers in browser-service or llmService (e.g., sidebar
  toggles, menu open/close), and keep Grok-specific selectors only in the
  adapter.

## Cookbook

- Open a modal and wait for it to render
  - Click the trigger, then `await waitForSelector(Runtime, 'input[...]', 5000)`.
  - Prefer a unique field in that modal (project name, search input, etc.).

- Open a Radix/portal listbox tied to `aria-controls`
  - Dispatch pointerdown/mousedown + click on the trigger.
  - `await waitForSelector(Runtime, '#<aria-controls>', 3000)` before scanning items.
  - Close by toggling the trigger, not Escape.

- Avoid cross-scope selector collisions
  - Pick the active dialog as your root.
  - Query inside `dialog` first, then widen to `main`/`document` only if needed.

- Keep retries centralized
  - Prefer `waitForSelector` over `setTimeout` loops in adapters.
  - If you must loop, wrap it in a single helper and document why.

## Recent example

- Grok project-create model picker:
  - Required a pointer event sequence (pointerdown/mousedown + click) to open.
  - Wait for the listbox via `aria-controls` + `waitForSelector` before selecting.
  - Close the menu via trigger toggle (avoid Escape to keep modal open).
