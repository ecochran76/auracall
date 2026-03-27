# Browser Service Tools

This doc captures the reusable browser-service helpers and the patterns we want to
follow when automating UI flows. The goal is to keep Grok-specific hacks minimal
and push general strategies into browser-service so new service adapters are
faster to implement.

The `browser-tools` DevTools helper CLI now lives in
[`packages/browser-service/src/browserTools.ts`](/home/ecochran76/workspace.local/oracle/packages/browser-service/src/browserTools.ts).
Keep Aura-Call-specific config/bootstrap logic in the thin compatibility wrapper
[`scripts/browser-tools.ts`](/home/ecochran76/workspace.local/oracle/scripts/browser-tools.ts).

Current upgrade backlog:
- generic browser-service work: [browser-service-upgrade-backlog.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-upgrade-backlog.md)
- Aura-Call-only workflow work: [auracall-browser-onboarding-backlog.md](/home/ecochran76/workspace.local/oracle/docs/dev/auracall-browser-onboarding-backlog.md)

## Core helpers (packages/browser-service/src/service/ui.ts)

- `waitForPredicate(Runtime, expression, options)`
  - Generic polling primitive for truthy page predicates.
  - Returns attempts, elapsed time, and the last truthy value when a condition wins.
  - Prefer this over ad hoc polling loops when the condition is not just a selector.

- `waitForDocumentReady(Runtime, options)`
  - Waits for `document.readyState` to reach `interactive` / `complete` by default.
  - Can also require `document.visibilityState === "visible"`.
  - Use this before probing apps that hydrate after the first navigation event.

- `waitForVisibleSelector(Runtime, selector, options)`
  - Waits for a selector to exist and have a visible bounding box.
  - Returns selector metadata (tag/text/rect) when it succeeds.
  - Prefer this when the next action needs an actually clickable element, not just a DOM node.

- `waitForScriptText(Runtime, options)`
  - Waits for inline script text to contain required tokens.
  - Useful for hydration/bootstrap payloads that appear before stable DOM markers.
  - Keep the tokens generic here; provider-specific payload semantics still belong in the app layer.

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

## Core helpers (packages/browser-service/src/chromeLifecycle.ts)

- `openOrReuseChromeTarget(port, url, options)`
  - Shared tab-open policy for Aura-Call browser flows.
  - Default policy is:
    1. reuse the most recent exact URL match
    2. reuse an existing `about:blank` / new-tab page
    3. reuse an existing same-origin page by navigating it
    4. reuse an explicitly compatible host-family page (for example `chatgpt.com` <-> `chat.openai.com`)
    5. only then create a fresh tab
  - After selecting/opening the target, it also trims obvious stockpile patterns:
    - keep the selected tab
    - keep at most 3 matching-family tabs total
    - keep at most 1 spare blank/new-tab page
    - if CDP exposes Chrome window ids, collapse extra windows for the same profile only when every tab in that window is disposable for the current service action
  - The caps are now profile-configurable through Aura-Call browser config:
    - `browser.serviceTabLimit`
    - `browser.blankTabLimit`
    - `browser.collapseDisposableWindows`
  - Use this instead of raw `CDP.New(...)` when the goal is “get to this page without stockpiling tabs”.

## Usage notes

- Prefer selector helpers from `packages/browser-service/src/service/selectors.ts`.
  - Use `cssClassContains('group/sidebar-wrapper')` instead of fragile `.group/sidebar-wrapper`.
  - Use attribute selectors (`[class*="..."]`, `[aria-label="..."]`) to avoid escaping issues.
- Keep reusable UI helpers in browser-service or llmService; keep Grok-specific selectors only in adapters.
- For workflow guidance, see `docs/dev/browser-automation-playbook.md`.

## Smoke helpers

- `pnpm tsx scripts/browser-tools.ts tabs --port <port> [--url-contains <text>] [--json]`
  - Shows the live tab census for one DevTools browser instance.
  - Includes the tab that `browser-tools` would select and why (`url-contains`,
    `focused`, `non-internal-page`, `last-page`).
  - Use this before ad hoc `eval` when a run might be targeting the wrong tab.

- `pnpm tsx scripts/browser-tools.ts probe --port <port> [--url-contains <text>] [--selector <css>] [--script-any <token>] [--script-all <token>] [--json]`
  - Collects structured generic probes from the selected page.
  - Reports document state, visible selector matches, script-text token presence,
    storage-key presence, and cookie-name presence.
  - `--json` emits a versioned envelope:
    - `contract: "browser-tools.page-probe"`
    - `version: 1`

- `pnpm tsx scripts/browser-tools.ts doctor --port <port> [--url-contains <text>] [--selector <css>] [--script-any <token>] [--script-all <token>] [--storage-any <key>] [--storage-all <key>] [--cookie-any <name>] [--cookie-all <name>] [--json]`
  - Combines the tab census with the structured selected-page probes.
  - Use this as the first package-owned diagnosis surface before app-specific doctor logic.
  - `--json` emits a versioned envelope:
    - `contract: "browser-tools.doctor-report"`
    - `version: 1`

- `pnpm tsx scripts/verify-grok-project-sources-steps.ts <step|all> <projectId|current> [file... ] [--delete <fileName>]`
  - Steps 1–6 are independent; use `all` to run the full flow.
  - `current` resolves the project id from the active grok tab.
  - Step 5 uploads files; step 6 removes a single file.

- `pnpm tsx scripts/verify-grok-context-get.ts <conversationId> [projectId]`
  - Fetches conversation context through the Grok adapter path and prints message count.
