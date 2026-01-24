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
  - Use `logCandidatesOnMiss` to include visible labels in failure messages.

- `openDialog(Runtime, options)`
  - Uses `pressButton` then waits for a dialog and optional ready selector.

- `openMenu(Runtime, options)`
  - Clicks a trigger and waits for the menu/listbox to appear (aria-controls aware).

- `waitForMenuOpen(Runtime, options)`
  - Waits for menu/listbox selectors, with fallback selectors when the primary id is missing.

- `pressMenuButtonByAriaLabel(Runtime, options)`
  - Opens a menu by aria-label match and waits for the menu to render.

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

- `hoverAndReveal(Runtime, Input, options)`
  - Hover a row and optionally verify that a specific action is revealed.

- `pressRowAction(Runtime, options)`
  - Finds a row action button (Rename/Delete/etc.) near an anchor element and clicks it.
  - Uses proximity to the row to disambiguate buttons outside the row.

- `pressDialogButton(Runtime, options)`
  - Clicks a dialog action button by label, with optional `preferLast` for destructive confirms.

- `submitInlineRename(Runtime, options)`
  - Sets inline rename input value, submits via Enter, optionally clicks Save, and can wait for close.
  - When no selector/match is provided, it prefers the active element and falls back to the first visible input.

- `queryRowsByText(Runtime, options)`
  - Locates rows by visible text in a scoped root. Useful for lists that reorder or virtualize.

- `ensureCollapsibleExpanded(Runtime, options)`
  - Ensures a collapsible list is open by checking for row selectors and clicking a toggle if needed.

- `hoverRowAndClickAction(Runtime, Input, options)`
  - Scrolls a row into view, hovers via bounding box, and clicks a row action (Rename/Delete).

- `openRadixMenu(Runtime, options)`
  - Alias for `openMenu` when targeting Radix menus; keeps the naming consistent in adapters.

## Usage notes

- Prefer selector helpers from `packages/browser-service/src/service/selectors.ts`.
  - Use `cssClassContains('group/sidebar-wrapper')` instead of fragile `.group/sidebar-wrapper`.
  - Use attribute selectors (`[class*="..."]`, `[aria-label="..."]`) to avoid escaping issues.
- Keep reusable UI helpers in browser-service or llmService; keep Grok-specific selectors only in adapters.
- For workflow guidance, see `docs/dev/browser-automation-playbook.md`.
