# Browser-Service Upgrade Backlog

Purpose: track generic browser-automation improvements that belong in
`packages/browser-service/`, not Aura-Call provider code.

Use this backlog for features that would help any agentic browser workflow:
DevTools targeting, tab selection, readiness detection, structured probing, and
instance diagnostics.

## Current DOM-drift repair plan (2026-03-28)

This is the current follow-on plan from the Grok stabilization work. The main
lesson is that provider adapters keep solving the same classes of drift:

- SPA navigation settles later than `Page.navigate(...)`
- the same entity exposes multiple action surfaces (row menu, page menu, dialog)
- hover-only row actions need scoped reveal/click behavior
- success must be verified from post-conditions, not from “click happened”
- drift is much faster to repair when failure output already includes scoped UI
  diagnostics

Priority order for extraction into `packages/browser-service/`:

1. `navigateAndSettle(...)`
2. anchored row/menu action helpers
3. structured UI diagnostics wrappers
4. canonical action-surface fallback helpers
5. explicit client/session focus policy
6. optional failure snapshots

Current active plan:
- Keep provider-local trigger scoring in adapters unless the same scoring shape
  repeats on another real surface/provider.
- Make structured UI diagnostics wrappers the next package-owned extraction so
  future DOM drift failures carry the scoped evidence needed to decide whether a
  selector/action fix belongs in browser-service or stays app-specific.
- Latest implementation follow-up:
  - `openMenu(...)` now supports ordered interaction strategies instead of
    assuming a synthetic click is always equivalent to a real menu open.
  - `openSurface(...)` now provides a package-owned “try these triggers until
    the ready state appears” primitive for page/menu/dialog surfaces.
  - UI diagnostics now accept caller context so failures can record intended
    scopes/interaction modes alongside the live page snapshot.
  - provider-native project-id normalization/extraction is now a provider hook
    instead of a hardcoded ChatGPT special case inside `llmService`.

### 6. `navigateAndSettle(...)`

Status: started 2026-03-28

Why:
- We keep re-learning that “navigation finished” and “UI is usable” are
  different states.
- Grok `/files`, project tabs, and conversation surfaces all needed route
  fallbacks plus readiness predicates.

Files:
- `packages/browser-service/src/service/ui.ts`
- `packages/browser-service/src/chromeLifecycle.ts`
- `tests/browser-service/*`

Acceptance:
- One helper can:
  - navigate via `Page.navigate(...)`
  - wait for document ready
  - optionally require a pathname/query/url predicate
  - optionally require one of several ready markers
  - optionally retry with in-page `location.assign(...)`
- Timeout errors report which stage failed:
  - route
  - ready-state
  - marker
  - fallback

Progress:
- `packages/browser-service/src/service/ui.ts` now exports `navigateAndSettle(...)`.
- The helper currently covers:
  - `Page.navigate(...)`
  - shared document-ready waits
  - optional route predicate
  - optional ready predicate
  - optional in-page `location.assign(...)` fallback
- Grok now uses it for:
  - `/files` route settling
  - generic Grok URL/project route settling
- Added focused coverage in `tests/browser-service/ui.test.ts`.

Next:
- Adopt it in the remaining Grok conversation/tab hydration paths that still do
  ad hoc `Page.navigate(...)` + `waitForDocumentReady(...)`.
- Decide whether the helper should grow package-owned diagnostics output for the
  failing phase instead of only returning structured phase data.

### 7. Anchored row/menu action helpers

Status: started 2026-03-28

Why:
- Hover-revealed row actions are common enough that adapters should not keep
  hand-rolling them.
- The same operation often needs a preferred surface order:
  row `Options` first, page menu second, dialog fallback last.

Files:
- `packages/browser-service/src/service/ui.ts`
- `tests/browser-service/ui.test.ts`

Acceptance:
- Helpers can:
  - locate a row by scoped text/id anchor
  - hover the exact row
  - reveal the intended action
  - click without accidentally triggering ancestor link navigation
  - verify post-state
- A package helper can express preferred action surfaces instead of every
  adapter hardcoding its own fallback order.

Likely first extraction sources:
- Grok project row `Options`
- Grok conversation row `Options`
- project/file delete and rename flows

Progress:
- `packages/browser-service/src/service/ui.ts` now exports:
  - `clickRevealedRowAction(...)`
  - `openRevealedRowMenu(...)`
- The helpers currently centralize the shared pattern:
  - hover the tagged/scoped row
  - verify the intended action is revealed
  - click the row action or open the row menu trigger
- `openRevealedRowMenu(...)` now also supports:
  - preparing hidden row-menu triggers before open attempts
  - a direct trigger-click fallback when the generic menu opener still misses
- Grok now uses the shared helpers for:
  - root/sidebar conversation `Options` menu opening
  - history-dialog conversation rename/delete row actions
  - sidebar project-row `Options` menu opening after provider-local row/button tagging
- Added focused package coverage in `tests/browser-service/ui.test.ts`.

Next:
- Decide whether the provider-local “tag the best button in this row” scoring
  step should move into browser-service too, or stay app-specific.
- Look for the next adapter surface that can drop straight onto the shared
  helper shape without another custom scoring pass.

### 8. Structured UI diagnostics wrapper

Status: active and expanded 2026-03-28

Why:
- DOM drift repair is much faster when the failure already contains the
  immediate UI evidence.
- We repeatedly had to gather the same facts manually:
  current URL, open menus/dialogs, visible buttons, nearby row labels.

Files:
- `packages/browser-service/src/service/ui.ts`
- `packages/browser-service/src/browserTools.ts`
- `tests/browser-service/*`

Acceptance:
- A wrapper like `withUiDiagnostics(...)` can enrich thrown errors with:
  - current URL/title
  - open dialog/menu selectors
  - visible button/CTA census in scope
  - row/anchor candidates in scope
  - optional short DOM excerpt
- Provider code opts into this without copy-pasting inspection snippets.

Likely first extraction sources:
- Grok project rename/delete
- Grok `/files` modal and row actions
- conversation rename/delete

Implementation plan:

1. Add package-owned diagnostics primitives in `packages/browser-service/src/service/ui.ts`.
   - Start with a small `collectUiDiagnostics(...)` helper that returns:
     - current URL/title
     - visible dialog roots
     - visible menu/listbox roots
     - visible buttons/menuitems in scope
     - optional row/anchor candidate census in scope
   - Keep the first version data-only and bounded. Do not add screenshots yet.

2. Add an opt-in error wrapper in the same package surface.
   - Introduce `withUiDiagnostics(...)` around fragile async UI actions.
   - On failure, append the diagnostics payload to the thrown error in a stable,
     parseable shape.
   - Keep it opt-in per flow so normal happy-path actions stay cheap and quiet.

3. Adopt the wrapper in the highest-drift Grok paths first.
   - `openProjectMenuButton(...)`
   - project rename/delete
   - conversation rename/delete
   - `/files` row actions
   - Goal: replace generic misses like “menu item not found” with errors that
     already include nearby visible menu items, row labels, and open overlay state.

4. Add focused package tests before broader adoption.
   - `tests/browser-service/ui.test.ts`
   - Cover:
     - diagnostics collection
     - wrapped error enrichment
     - scoped candidate listing
     - bounded payload behavior

5. Validate with the live WSL Grok acceptance bar.
   - `DISPLAY=:0.0 pnpm tsx scripts/grok-acceptance.ts --json`
   - The acceptance bar remains the proof that the diagnostics layer did not
     destabilize the repaired CRUD paths.

6. Instrument trigger-scoring decisions without extracting them yet.
   - In Grok adapter code, capture candidate count / winning trigger / coarse
     reason only in verbose or debug mode.
   - Use that evidence to decide later whether trigger scoring deserves its own
     package primitive.

7. Extraction rule for trigger scoring.
   - Do not move “pick the best trigger near anchor” into browser-service until
     the same input/decision shape appears on another real surface or provider.
   - If it does repeat, extract only a narrow primitive, for example:
     - `tagBestVisibleTriggerNearAnchor(...)`
   - Keep browser-service generic:
     - rows
     - anchors
     - triggers
     - rankings
     - diagnostics

Progress:
- `collectUiDiagnostics(...)` and `withUiDiagnostics(...)` are live in
  `packages/browser-service/src/service/ui.ts`.
- Diagnostics now accept caller-owned `context`, so failures can report:
  - intended trigger labels
  - attempted interaction strategies
  - scope/root assumptions
- ChatGPT project-create memory-mode and project-settings/delete flows now use
  that context to explain what the automation was trying to open when a live
  miss occurs.

### 9. Interaction-strategy menu helpers

Status: started 2026-03-28

Why:
- Real apps do not treat every trigger like a simple synthetic `click`.
- The current ChatGPT project-create gear menu opens on pointer and keyboard
  activation, but not reliably on plain `click`.

Files:
- `packages/browser-service/src/service/ui.ts`
- `tests/browser-service/ui.test.ts`

Acceptance:
- Menu/button helpers can try ordered interaction strategies:
  - `pointer`
  - `click`
  - `keyboard-enter`
  - `keyboard-space`
  - `keyboard-arrowdown`
- The helper reports which strategy succeeded.
- Callers can pass the intended strategy order into diagnostics context.

Progress:
- `pressButton(...)` now accepts `interactionStrategies`.
- `openMenu(...)` now retries trigger activation across ordered interaction
  strategies and reports which one opened the menu.
- ChatGPT project-create memory-mode now uses the shared helper with:
  - `pointer`
  - `keyboard-space`
  - `keyboard-arrowdown`

### 10. Canonical action-surface fallback helper

Status: started 2026-03-28

Why:
- The same operation often has multiple valid entry points:
  - page button
  - details button
  - row menu
  - dialog entry
- Provider code should not have to hand-roll “try A, then B, then A again”
  every time a surface drifts.

Files:
- `packages/browser-service/src/service/ui.ts`
- `tests/browser-service/ui.test.ts`

Acceptance:
- A helper can:
  - try ordered triggers
  - verify a shared ready-state after each attempt
  - return which surface succeeded
  - return structured per-attempt history on failure

Progress:
- `openSurface(...)` now provides package-owned fallback opening based on:
  - ordered trigger attempts
  - shared ready expression or selector
  - structured per-attempt result history
- ChatGPT project settings now use `openSurface(...)` instead of provider-local
  trigger fallback glue.
   - Keep app semantics such as “project row” or “conversation row” in adapters.

Acceptance for this plan:
- Fragile Grok failures should report scoped diagnostics instead of generic
  misses.
- The WSL Grok acceptance bar should stay green after adoption.
- The later decision about trigger-scoring extraction should be evidence-based,
  not intuition-based.

Progress:
- `packages/browser-service/src/service/ui.ts` now exports:
  - `collectUiDiagnostics(...)`
  - `withUiDiagnostics(...)`
- The first version currently captures:
  - URL/title/readyState
  - active element summary
  - visible dialogs
  - visible menus plus visible items
  - visible buttons in scope
  - scoped candidate census
- Grok now opts into the wrapper for:
  - project menu open
  - project menu item selection
  - conversation sidebar menu open
- The diagnostics already paid for themselves in live repair work:
  - exposed the stale project-index rename assumption on clone flows
  - exposed root conversation sidebar hydration lag during delete
  - narrowed root conversation discovery failures to list-surface lag instead of
    browser-run creation failures

Current follow-up:
- keep expanding adoption in fragile Grok flows before extracting any more
  adapter-local heuristics
- keep trigger/button scoring provider-local until it repeats on another real
  surface/provider

### 9. Canonical action-surface fallbacks

Status: planned

Why:
- Many surfaces drift by moving the same action somewhere else rather than
  removing it.
- Adapters need a shared vocabulary for “preferred surface, then fallback”.

Files:
- `packages/browser-service/src/service/ui.ts`
- `packages/browser-service/src/service/browserService.ts`
- `tests/browser-service/*`

Acceptance:
- A helper can try named surfaces in order:
  - row menu
  - page/header menu
  - dialog
  - inline control
- Each attempt logs/returns why it was skipped or failed.
- Callers can verify which surface actually won.

Likely first extraction sources:
- Grok project delete/clone/rename
- Grok conversation delete/rename

### 10. Explicit client/session focus policy

Status: planned

Why:
- Focus behavior is correctness, not just UX polish.
- The first no-focus-steal implementation used a process-global env toggle,
  which was wrong for multiple profiles in one process.

Files:
- `packages/browser-service/src/chromeLifecycle.ts`
- `packages/browser-service/src/service/browserService.ts`
- provider adapters that still call `Page.bringToFront()`

Acceptance:
- Focus policy is carried per client/session/run, not via process-global env.
- Package helpers can express:
  - `raise`
  - `suppress`
  - `best-effort-hide/minimize`
- Reused/adopted windows are not re-minimized unless the caller explicitly
  wants that behavior.

Likely first extraction sources:
- Grok tab-visibility logic
- manual-login launch path
- reattach/reuse paths

### 11. Optional failure snapshots

Status: planned

Why:
- Some drift only becomes obvious from a screenshot or saved probe payload.
- We should not need ad hoc manual capture each time.

Files:
- `packages/browser-service/src/browserTools.ts`
- `packages/browser-service/src/service/ui.ts`
- `tests/browser-service/*`

Acceptance:
- Optional failure bundle can capture:
  - selected-tab census
  - page probe output
  - screenshot when available
  - short HTML excerpt or scoped element census
- The capture stays opt-in and bounded so normal runs stay cheap.

Likely first extraction sources:
- `/files` readiness failures
- dialog/menu miss cases
- rename flows that stay in edit mode

## Order of work

1. Deterministic tab census + selection explanation
2. Reusable target-selection framework
3. Generic readiness / hydration wait helpers
4. Structured probe primitives
5. Browser-service doctor surface

## 1. Deterministic tab census + selection explanation

Status: landed 2026-03-25

Why:
- We keep spending tokens rediscovering which tab was actually targeted.
- Existing `inspect` output listed tabs but did not explain which one `eval` /
  `pick` / `screenshot` would choose.

Files:
- `packages/browser-service/src/browserTools.ts`
- `tests/browser/browserTools.test.ts`
- `docs/dev/browser-service-tools.md`

Acceptance:
- `browser-tools tabs` shows every tab in one DevTools browser instance.
- Output includes the selected tab, selection reason, and candidate facts.
- The selection logic is exported for package reuse and unit-tested.

## 2. Reusable target-selection framework

Status: started 2026-03-25

Why:
- Browser flows need deterministic, explainable target choice without
  copy-pasting scoring logic into every caller.

Files:
- `packages/browser-service/src/service/instanceScanner.ts`
- `packages/browser-service/src/browserTools.ts`
- `packages/browser-service/src/service/browserService.ts`
- `tests/browser-service/stateRegistry.test.ts`

Acceptance:
- One generic target-selector API accepts URL/title/type preferences.
- The API returns both the winning target and scored alternatives.
- BrowserService can reuse it instead of open-coded tab resolution.

Progress:
- `packages/browser-service/src/service/instanceScanner.ts` now exports
  `explainTabResolution(...)`, which returns the winning tab plus scored
  candidate reasons (`match-url`, `match-title`, `preferred-type`).
- Aura-Call's browser wrapper now returns that explanation as `tabSelection`
  from `resolveServiceTarget(...)` instead of hiding the package scoring result.
- The same wrapper now emits a compact runtime debug summary through its logger,
  so callers can see the winning tab and nearest losers without dumping the full
  tab list.

Next:
- Reuse the same explanation model in more callers instead of only
  `resolveServiceTarget(...)`.
- Decide whether a package-owned formatter should back a future generic doctor
  command, instead of each host app formatting target summaries itself.

## 3. Generic readiness / hydration wait helpers

Status: started 2026-03-25

Why:
- Many failures are “tab exists but app state has not hydrated yet”.
- Retry loops are still too provider-local.

Files:
- `packages/browser-service/src/service/ui.ts`
- `packages/browser-service/src/service/browserService.ts`
- `tests/browser-service/*`

Acceptance:
- Reusable waits for selector, not-selector, arbitrary predicate, and
  script-text presence.
- Clear timeout errors that say what condition failed.
- No service-specific DOM knowledge in the helper surface.

Progress:
- `packages/browser-service/src/service/ui.ts` now exports
  `waitForPredicate(...)` and `waitForDocumentReady(...)`.
- Added `waitForVisibleSelector(...)` and `waitForScriptText(...)` on top of the
  same predicate primitive.
- Existing generic waits (`waitForDialog`, `waitForSelector`,
  `waitForNotSelector`) now reuse the shared predicate helper instead of open
  coding their own polling loops.
- `pressButton(...)` now uses the visible-selector wait when
  `requireVisible` is in effect, so selector-based clicks align with the
  caller's actual readiness expectation.
- Added focused coverage in `tests/browser-service/ui.test.ts`.

Next:
- Start using the richer wait result in targeted debug paths where hydration
  timing still causes ambiguous failures.
- Decide whether `waitForSelector(...)` should eventually gain an options object
  instead of staying as a boolean compatibility wrapper.

## 4. Structured probe primitives

Status: started 2026-03-25

Why:
- Debugging still relies on ad hoc `eval` snippets.
- We need cheap, deterministic probes that return machine-readable facts.

Files:
- `packages/browser-service/src/browserTools.ts`
- `packages/browser-service/src/service/ui.ts`
- `tests/browser/*`

Acceptance:
- Generic probes for visible CTA/button census, storage presence, cookie
  presence, and document state.
- CLI surface can emit JSON directly without hand-written snippets.

Progress:
- `packages/browser-service/src/browserTools.ts` now exports structured page
  probe collection for:
  - document state
  - visible selector matches
  - inline script-text token presence
  - local/session storage presence
  - cookie presence
- Added `browser-tools probe` as a package-owned CLI surface for those probes.

Next:
- Keep the output generic; service-specific interpretation still belongs in the
  host app.
- Decide whether storage/cookie probe matching should stay exact-name based or
  grow a generic substring/prefix mode later.

## 5. Browser-service doctor surface

Status: started 2026-03-25

Why:
- Package consumers need a first-line diagnosis tool before app-specific doctor
  commands.

Files:
- `packages/browser-service/src/browserTools.ts`
- `packages/browser-service/src/service/stateRegistry.ts`
- `packages/browser-service/src/service/instanceScanner.ts`

Acceptance:
- A package-owned doctor command reports live instances, tabs, selection
  explanation, and registry mismatches.
- No Aura-Call-specific provider/auth concepts appear in the output.

Progress:
- `browser-tools doctor` now reports:
  - live tab census
  - selected-tab explanation
  - selected-page document/probe summary
- The doctor/probe surfaces share the same package-owned structured probe layer.
- `doctor --json` and `probe --json` now emit explicit versioned envelopes:
  - `contract: "browser-tools.doctor-report", version: 1`
  - `contract: "browser-tools.page-probe", version: 1`

Next:
- Decide whether registry mismatch reporting belongs in the package doctor or in
  host-app wrappers that know where registry state lives.
- Keep the JSON contract additive and version-gated as the probe surface grows.
