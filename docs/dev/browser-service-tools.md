# Browser Service Tools

This doc captures the reusable browser-service helpers and the patterns we want to
follow when automating UI flows. The goal is to keep Grok-specific hacks minimal
and push general strategies into browser-service so new service adapters are
faster to implement.

The `browser-tools` DevTools helper CLI now lives in
[`packages/browser-service/src/browserTools.ts`](/home/ecochran76/workspace.local/oracle/packages/browser-service/src/browserTools.ts).
Keep Aura-Call-specific config/bootstrap logic in the thin compatibility wrapper
[`scripts/browser-tools.ts`](/home/ecochran76/workspace.local/oracle/scripts/browser-tools.ts).
When targeting managed Aura-Call sessions through that wrapper, prefer
`--auracall-profile <name>` and `--browser-target <target>` so it resolves the
same AuraCall runtime profile and managed browser profile that the real product
path would use.

Current upgrade backlog:
- generic browser-service work: [browser-service-upgrade-backlog.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-upgrade-backlog.md)
- lessons review: [browser-service-lessons-review-2026-03-30.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-lessons-review-2026-03-30.md)
- Aura-Call-only workflow work: [auracall-browser-onboarding-backlog.md](/home/ecochran76/workspace.local/oracle/docs/dev/auracall-browser-onboarding-backlog.md)

Current DOM-drift extraction priorities live in the 2026-03-28 section of
[browser-service-upgrade-backlog.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-upgrade-backlog.md):
- `navigateAndSettle(...)`
- anchored row/menu action helpers
- structured UI diagnostics wrappers
- canonical action-surface fallback helpers
- explicit per-client focus policy
- optional failure snapshots

Current active extraction plan:
- keep trigger/button scoring in adapters unless the same scoring shape repeats
  on another real surface/provider
- use browser-service-owned interaction strategies, surface fallbacks, and
  diagnostics context before adding new provider-local trigger workarounds
- for menu options whose authoritative selected state only lives in reopened
  menu markup, prefer the package-owned select-and-reopen helpers before adding
  provider-local reopen logic

## Core helpers (packages/browser-service/src/service/ui.ts)

- `waitForPredicate(Runtime, expression, options)`
  - Generic polling primitive for truthy page predicates.
  - Returns attempts, elapsed time, and the last truthy value when a condition wins.
  - Prefer this over ad hoc polling loops when the condition is not just a selector.

- `armDownloadCapture(Runtime, options?)`
  - Installs page-level hooks for `HTMLAnchorElement.click` and `window.open` to
    capture download intent before a click.
  - Stores captured `href` and `download` values under a shared state key for
    provider adapters to consume immediately after an action.

- `readDownloadCapture(Runtime, stateKey?)`
  - Reads the current captured download payload from page state.
  - Returns `{ href, downloadName }` with null normalization when no capture is
    present.

- `waitForDownloadCapture(Runtime, options?)`
  - Polls `readDownloadCapture(...)` until a target is observed or timeout
    expires.
  - Useful for adapter-specific “click then capture” artifact/materialization
    flows.

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

- `navigateAndSettle({ Page, Runtime }, options)`
  - Shared route-settling primitive for SPA/browser automation flows.
  - Combines `Page.navigate(...)`, document-ready wait, optional route predicate,
    optional ready predicate, and optional in-page `location.assign(...)` fallback.
  - Returns structured phase data (`route`, `document-ready`, `ready`) so
    callers can throw provider-specific errors without reimplementing the
    settling loop.
  - Prefer this over ad hoc `Page.navigate(...)` + `waitForDocumentReady(...)`
    + retry logic when the page can route asynchronously.

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
  - Supports ordered `interactionStrategies` when a surface responds to pointer
    or keyboard activation differently than plain click.
  - Use `logCandidatesOnMiss` to include visible labels in failure messages.

- `openDialog(Runtime, options)`
  - Uses `pressButton` then waits for a dialog and optional ready selector.

- `openMenu(Runtime, options)`
  - Opens a trigger and waits for the menu/listbox to appear (aria-controls aware).
  - Supports ordered interaction strategies and reports which strategy opened
    the menu.
  - Supports expected-item-aware menu-family selection, so if multiple menus are
    visible it can prefer the one that actually contains the intended option.
  - When inventory selection is used, it returns a specific tagged selector for
    the chosen visible menu instead of a generic `[role="menu"]`.
  - That tagged selector is now stable across repeated
    `collectVisibleMenuInventory(...)` reads while the underlying menu node stays
    alive, so it is safe to pass into later submenu opens or verify flows.

- `openSurface(Runtime, options)`
  - Shared “try these triggers until the ready state appears” helper.
  - Use this when the same surface can be opened from more than one valid
    trigger and the ready-state is shared.
  - Returns structured per-attempt history for failure diagnostics.

- `openAndSelectMenuItemFromTriggers(Runtime, options)`
  - Shared ordered action-surface fallback helper for menu-backed actions.
  - Tries multiple menu triggers in order, optionally running per-attempt setup
    before each trigger, and returns structured attempt history.
  - Use this when the same action may live in more than one real surface, such
    as a hover row menu first and a page/header menu second.
  - Keep the trigger list provider-local; move only the fallback mechanics into
    browser-service.

- `waitForMenuOpen(Runtime, options)`
  - Waits for menu/listbox selectors, with fallback selectors when the primary id is missing.
  - Can use expected labels, existing-menu signatures, and optional anchor
    proximity to choose the right visible menu family instead of the first one.

- `collectVisibleMenuInventory(Runtime, options)`
  - Returns a bounded visible-menu census with specific selectors, item labels,
    geometry, and optional anchor distance.
  - Use this for menu-family diagnostics and for DOM drift repairs where
    multiple visible menus or submenus can coexist.
  - The returned `selector` is intended to be reusable as a scoped handle for
    later menu work; do not collapse back to a generic `[role="menu"]` unless
    the menu handle is truly unavailable.

- `collectVisibleOverlayInventory(Runtime, options)`
  - Returns a bounded visible overlay/dialog/alert census with specific
    selectors, summary text, visible button labels, geometry, and optional
    anchor distance.
  - Use this when multiple blocking surfaces can coexist and the automation
    needs a stable scoped handle instead of generic `[role="dialog"]`.
  - The returned `selector` is intended to be reusable as a scoped overlay
    handle for later dismiss/verify work.

- `openSubmenu(Runtime, options)`
  - Opens a submenu from a parent menu item and returns the specific submenu
    selector chosen by browser-service.
  - Use this when the parent menu is already open and the next valid surface is
    another menu, not a dialog or route change.

- `selectNestedMenuPath(Runtime, options)`
  - Drives a trigger through a menu path like top-level item -> submenu item.
  - Use this instead of provider-local `open menu, find More, open submenu,
    click target` glue when the UI is a real nested menu structure.

- `inspectNestedMenuPathSelection(Runtime, options)`
  - Reopens a menu path up to the containing menu for the target option and
    reads selected state from the current menu markup.
  - Use this when chips/pills are not authoritative and the app only exposes
    selected state inside the reopened menu.

- `selectAndVerifyNestedMenuPathOption(Runtime, options)`
  - Activates a menu option, reopens the same menu path, and verifies the final
    option stayed selected.
  - Prefer this over provider-local "click, reopen menu, inspect selected row"
    flows when the authoritative state lives in the menu itself.

- `collectUiDiagnostics(Runtime, options)` / `withUiDiagnostics(Runtime, action, options)`
  - Capture a bounded page snapshot and optionally attach caller `context`.
  - Use `context` for intended trigger labels, interaction strategies, or root
    scopes so failure payloads explain what the automation was trying to do.

- `dismissOverlayRoot(Runtime, rootSelector, options)`
  - Dismisses one specific overlay root by stable selector/handle instead of
    closing the first visible dialog on the page.
  - Prefer this when multiple overlays can coexist and a provider already knows
    which root it intends to dismiss.

- `withBlockingSurfaceRecovery(action, options)`
  - Generic recovery loop for visible blocking surfaces.
  - Lets package clients supply:
    - a surface inspector
    - an optional dismiss handler
    - an optional error classifier
    - retry/pause policy
  - Use this when the mechanic is generic (`detect -> dismiss -> pause ->
    retry`) but the actual surface classifier/policy stays provider-local.

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

- `clickRevealedRowAction({ Runtime, Input }, options)`
  - Shared “hover row, verify action, then click it” helper for rename/delete-style controls.
  - Prefer this over hand-rolling `hoverAndReveal(...)` + `pressRowAction(...)` in adapters.

- `openRevealedRowMenu({ Runtime, Input }, options)`
  - Shared “hover row, verify trigger, then open its menu” helper for hidden `Options` buttons.
  - Prefer this over repeating row hover + `openMenu(...)` glue in adapters.
  - Supports optional trigger preparation plus a direct trigger-click fallback for
    link-adjacent menu buttons that need navigation suppression before the menu opens.

- `openAndSelectRevealedRowMenuItem({ Runtime, Input }, options)`
  - Shared “hover row, open its menu, then pointer-select a specific item”
    helper for stable row-local menu actions like Rename/Delete.
  - Prefer this when the provider-specific logic starts after the menu item has
    been invoked rather than at menu-open time.

- `collectAnchoredActionDiagnostics(Runtime, options)`
  - Captures a compact row-action snapshot: row state, trigger state, optional
    editor state, optional dialog state, active element, visible menus, and
    visible overlays around an anchor.
  - Prefer this over provider-local `Runtime.evaluate(...)` snapshots when a
    row/menu/editor/dialog flow needs failure evidence tied to one specific row
    action surface.

- `withAnchoredActionDiagnostics(Runtime, action, options)`
  - Wraps an anchored row/menu/editor action phase and automatically attaches
    anchored diagnostics on failure.
  - For result-style helpers, it augments `{ ok: false }` objects with
    diagnostics.
  - For thrown errors, it appends an `Anchored action diagnostics:` payload to
    the error and exposes it on `error.anchoredActionDiagnostics`.
  - Prefer this over provider-local `collectDiagnostics` lambdas when the
    provider helper already returns `{ ok: boolean }` or throws on failure.

- `pressDialogButton(Runtime, options)`
  - Clicks a dialog action button by label, with optional `preferLast` for destructive confirms.

- `submitInlineRename(Runtime, options)`
  - Sets inline rename input value, submits via Enter, optionally clicks Save, and can wait for close.
  - When no selector/match is provided, it prefers the active element and falls back to the first visible input.
  - Live lesson from Grok and ChatGPT rename surfaces: do not treat "editor closed" as proof that the rename persisted.
  - For row-local rename flows, the more reliable sequence is:
    - hover the row first so hidden `...`/Options controls are actually rendered,
    - open the row menu from that revealed trigger,
    - wait for the authoritative rename input selector on that surface,
    - focus the real input by geometry if needed,
    - type natively,
    - commit with one native `Enter`,
    - verify the row title text changed after submit.
  - Blur/click-away can be a fallback probe, but should not be the primary success path on surfaces where focus loss cancels or silently drops the rename.

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

- `pnpm tsx scripts/browser-tools.ts --auracall-profile <name> --browser-target <target> start`
  - Resolves the selected AuraCall runtime profile plus browser target before
    attaching or launching.
  - Prefer this over ad hoc launches when you want the same managed browser
    profile Aura-Call itself would use, for example:
    - `pnpm tsx scripts/browser-tools.ts --auracall-profile wsl-chrome-2 --browser-target chatgpt start`

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
