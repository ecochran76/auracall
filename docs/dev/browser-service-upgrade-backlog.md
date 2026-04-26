# Browser-Service Upgrade Backlog

Purpose: track generic browser-automation improvements that belong in
`packages/browser-service/`, not Aura-Call provider code.

Use this backlog for features that would help any agentic browser workflow:
DevTools targeting, tab selection, readiness detection, structured probing, and
instance diagnostics.

Latest cross-provider review:
- [browser-service-lessons-review-2026-03-30.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-lessons-review-2026-03-30.md)
  captures the confirmed ChatGPT-era package-boundary lessons and the next
  recommended extraction order.

## Current anti-bot checkpoint (2026-04-07)

Shared blocking-state classification is now real and consumed by:
- `browser-tools probe|doctor`
- `auracall doctor`
- `auracall features`
- `auracall features snapshot|diff`
- `auracall setup`
- `auracall login`
- shared local/remote ChatGPT browser runs
- shared local/remote Grok browser runs

That means the next browser-service anti-bot work should be maintenance-level
and concrete:
- only reopen this line when a real unmanaged flow still bypasses the shared
  signal
- do not keep broadening anti-bot glue speculatively

2026-04-21 follow-up:
- `browser-tools` tab census entries now carry generic `blockingState`
  classification from URL/title evidence.
- Browser-tools manual-clear checks now fail if any census tab requires human
  clearance, not only when the selected page probe is blocked.
- This specifically guards persistent managed browser profiles where a hidden
  Gemini `google.com/sorry` tab can coexist with a visible healthy
  `gemini.google.com/app` tab.
- Remaining ownership question: explicit raw DevTools-port diagnostics and
  legacy verification scripts can still bypass managed-profile dispatcher
  ownership. Treat those as unsafe/debug-only until a follow-up slice either
  routes them through a managed browser-service command surface or fences them
  behind an explicit raw-CDP escape hatch.
- Raw DevTools-port diagnostics through `browser-tools --port <port>` are now
  fenced by the browser operation dispatcher with port-scoped keys. The
  remaining bypass class is legacy direct-CDP verification scripts under
  `scripts/`, not the normal browser-tools command surface.
- Legacy direct-CDP TypeScript scripts under `scripts/` are now guarded by
  `scripts/raw-devtools-guard.ts`. They remain usable for development with the
  explicit escape hatches `--allow-raw-cdp` or `AURACALL_ALLOW_RAW_CDP=1`, but
  they are no longer silent browser-service bypasses.
- Browser-service-related development scripts now have a discoverable wrapper
  family under `scripts/browser-service/`. Keep root paths for compatibility,
  but prefer the family path in new docs. Do not move provider-dependent Grok
  helpers into `packages/browser-service` until they no longer import
  AuraCall app/provider modules.
- `BrowserOperationDispatcher.acquireQueued(...)` now provides an explicit
  browser-service wait-for-turn primitive for future service/API/MCP browser
  callers. Keep fail-fast `acquire(...)` for human/login/operator hard stops
  where an immediate structured busy result is more useful than waiting.
- 2026-04-25 follow-up:
  - Browser-service target resolution now treats managed browser profile
    ownership as stronger authority than a selected DevTools port. If a port
    resolves to another managed browser profile, service targeting switches to
    the expected live registered profile when possible and otherwise fails
    closed before scanning tabs or navigating.
  - Remaining dogfood item: rerun the queue-diagnostics smoke only after the
    installed runtime contains this guard, using the existing Grok managed
    browser profile and no direct conversation re-navigation.
  - Installed-runtime smoke proved the guard but found a profile/config
    blocker: `auracall-grok-auto` resolves to the canonical managed browser
    profile `browser-profiles/auracall-grok-auto/grok`, while the active
    logged-in Grok browser is registered under `browser-profiles/default/grok`
    and the shared default browser family still has fixed port `45011`
    occupied by Gemini. Resolve the runtime profile and debug-port ownership
    before repeating browser queue dogfood.
  - Follow-up fix: launch-context resolution now carries a browser-profile
    namespace separate from the AuraCall runtime profile, so runtime profiles
    that select browser family `default` derive managed profiles under
    `browser-profiles/default/<service>`.
  - Installed dogfood after the namespace fix proved the original queue
    diagnostic goal: `auracall-grok-auto` targeted Grok port `38261` and
    `/v1/runs/{id}/status?diagnostics=browser-state` reported the queued
    browser operation blocked on the held `default/grok` lock.
  - Follow-up fix: managed browser profile launch fallback now treats an
    occupied configured fixed DevTools port as stale unless registry/list-target
    selected it first. That keeps the profile registry as the normal authority
    and leaves raw fixed ports as explicit attach/diagnostic paths rather than
    accidental cross-service launch inputs.
  - Installed dogfood after the fixed-port fallback completed a Grok response
    run and confirmed browser-state diagnostics on `default/grok` port `38261`
    while Gemini remained registered separately on `default/gemini` port
    `45011`.

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

Post-ChatGPT follow-on order:
1. dialog/overlay inventory plus stable scoped handles
2. blocking-surface recovery framework
3. native download-target capture
4. network-response capture on reload/navigation
5. profile-scoped browser operation lease
6. row/list post-condition helpers
7. generic action-phase instrumentation

Progress as of 2026-03-30:
- done enough for first package use:
  - `collectVisibleOverlayInventory(...)`
  - `dismissOverlayRoot(...)`
  - `withBlockingSurfaceRecovery(...)`
- first provider adoption:
  - ChatGPT context/artifact rate-limit modal recovery now uses the
    package-owned blocking-surface recovery path plus package-owned overlay
    inventory/stable handles
- still remaining from the post-ChatGPT follow-on order:
  - native download-target capture
  - network-response capture on reload/navigation
  - profile-scoped browser operation lease
  - row/list post-condition helpers
  - generic action-phase instrumentation
  - registry liveness classification + safer stale-entry pruning / reattach diagnostics

Current registry/reattach reliability execution doc:
- [browser-service-reattach-reliability-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0014-2026-04-14-browser-service-reattach-reliability.md)

Current active plan:
- Keep provider-local trigger scoring in adapters unless the same scoring shape
  repeats on another real surface/provider.
- The main reusable menu stack is now package-owned:
  - menu-family selection
  - stable visible-menu handles
  - nested submenu traversal
  - select-and-reopen verification
  - ordered menu-trigger action-surface fallback via
    `openAndSelectMenuItemFromTriggers(...)`
- Return to provider work by default and only reopen browser-service extraction
  when a new surface exposes another clearly reusable failure mode.
- Latest implementation follow-up:
  - `openMenu(...)` now supports ordered interaction strategies instead of
    assuming a synthetic click is always equivalent to a real menu open.
  - `collectVisibleMenuInventory(...)` now gives browser-service a bounded,
    specific-selector menu census instead of forcing adapters to infer the
    current visible menu family from raw DOM scans.
  - `collectVisibleMenuInventory(...)` now preserves its synthetic visible-menu
    selectors across repeated inventory passes, so callers can safely reuse a
    chosen menu handle for later submenu opens or verify passes instead of
    chasing a selector that was silently reindexed on the next read.
  - `waitForMenuOpen(...)` / `openMenu(...)` can now pick the best visible menu
    by expected item labels, menu novelty, and optional anchor proximity, which
    is the package-owned form of the ChatGPT composer/project-settings drift fix.
  - `openSurface(...)` now provides a package-owned “try these triggers until
    the ready state appears” primitive for page/menu/dialog surfaces.
  - UI diagnostics now accept caller context so failures can record intended
    scopes/interaction modes alongside the live page snapshot.
  - provider-native project-id normalization/extraction is now a provider hook
    instead of a hardcoded ChatGPT special case inside `llmService`.
  - `openSubmenu(...)` and `selectNestedMenuPath(...)` are now package-owned, so
    provider code can express top-level menu -> submenu -> target-item flows
    without recreating menu traversal glue.
  - `openAndSelectRevealedRowMenuItem(...)` is now package-owned for the stable
    “hover row -> open revealed menu -> pointer-select item” interaction shape;
    keep exact row identity resolution and post-condition verification in the
    provider unless those also repeat elsewhere.
  - `collectAnchoredActionDiagnostics(...)` is now package-owned for row-action
    failure evidence; adapters should prefer it over local
    `row/trigger/menu/dialog` probe collectors when the diagnostic shape is the
    same.
  - `withAnchoredActionDiagnostics(...)` is now package-owned for anchored
    row-action phase wrappers; adapters should prefer it over manual
    `collectDiagnostics` callback plumbing when helper phases already report
    `{ ok: false }` or throw on failure.
  - `inspectNestedMenuPathSelection(...)` and
    `selectAndVerifyNestedMenuPathOption(...)` are now package-owned, so
    adapters can reopen a menu family, inspect selected-state from menu markup,
    and keep error hints scoped to the final containing menu without rebuilding
    that flow locally.
- provider-owned readback on a submitted tab now treats `preserveActiveTab`
  as a no-post-submit-navigation guard across ChatGPT, Gemini, and Grok.
  Keep future extraction focused on a reusable browser-service navigation
  authority primitive only if another real workflow needs the same “reuse the
  tab or fail” contract.
- 2026-04-23 control-plane follow-up:
  - that “another real workflow” is closed in:
    `docs/dev/plans/0053-2026-04-23-browser-control-plane-completion.md`
  - product browser mutations now route through browser-service-owned control
    points or provider helpers that carry mutation audit context
  - static enforcement rejects new direct product `Page.navigate`,
    `Page.reload`, `location.assign`, `location.replace`, and
    `location.href = ...` mutations outside approved browser-service control
    points
  - raw mutating CDP scripts remain explicit guarded escape hatches listed in
    `RAW_DEVTOOLS_MUTATING_SCRIPT_ALLOWLIST`

## New reusable learnings from the ChatGPT composer/add-on work (2026-03-28)

The ChatGPT `Add files and more` surface exposed a few more generic browser
automation patterns that should become package-owned over time.

### A. Trigger-anchored menu-family selection

Problem:
- multiple unrelated menus can be visible at the same time
- simply picking "the first visible menu" is wrong
- label-only matching is also wrong when different parts of the page expose
  identically named triggers like `More`

What we did manually:
- dismiss stale open menus before each selection phase
- prefer menus near the intended trigger/composer region
- score candidate menus by expected content markers instead of trusting any
  visible menu

What should move into browser-service:
- a helper that picks the right menu family from:
  - trigger element
  - menu geometry/proximity
  - expected content markers
  - optional menu depth (top-level vs submenu)

Candidate extraction:
- `openAnchoredMenu(...)`
- `pickMenuFamily(...)`

### B. Nested menu-path selection

Problem:
- modern web apps increasingly use multi-level menus
- selecting `Canvas` required:
  - open the top-level composer menu
  - detect the correct top-level menu
  - open `More`
  - detect the new submenu
  - then select the target item

What should move into browser-service:
- a package-owned nested menu path primitive that can express:
  - trigger -> top-level item -> submenu item
  - per-level verification and diagnostics

Candidate extraction:
- `selectNestedMenuPath(...)`
- `openSubmenu(...)`

### C. Menu inventory / census helper

Problem:
- DOM drift repair was much faster once we could see the current visible menu
  inventory as data:
  - menu bounds
  - visible item labels
  - menu depth / relation to the trigger

What should move into browser-service:
- a bounded menu-census helper for diagnostics and debugging
- this should be usable both from provider code and from `browser-tools`

Candidate extraction:
- `collectVisibleMenuInventory(...)`

### D. Tool-vs-source-vs-file classification guardrails

Problem:
- the same menu can mix true tools/add-ons with source/file rows
- flattening them into one semantic bucket causes bad UX and bad automation

What we learned:
- browser-service should not classify app semantics itself
- but it should make it easy for adapters to keep those categories separate by
  exposing cleaner menu-path and verification primitives

Implication:
- keep semantic classification provider-local
- move only the mechanics of menu discovery, submenu opening, and selected-state
  verification into the package

### E. Reopen-to-verify selection as a first-class pattern

Problem:
- chips/pills are not always the sole truth for current state
- sometimes the only authoritative selected-state is inside the reopened menu

What should move into browser-service:
- a reusable pattern for:
  - activate option
  - reopen the relevant menu family
  - verify selected-state from menu markup

Candidate extraction:
- `selectAndVerifyMenuOption(...)`

Current package-owned form:
- `inspectNestedMenuPathSelection(...)`
- `selectAndVerifyNestedMenuPathOption(...)`

Priority from these new learnings:
1. trigger-anchored menu-family selection
2. nested menu-path selection
3. menu inventory / diagnostics helper
4. select-and-reopen verification helper

Progress:
- Done enough for first package extractions:
  - `collectVisibleMenuInventory(...)`
  - stable menu tagging with specific selectors for the chosen visible menu
  - `openMenu(...)` / `waitForMenuOpen(...)` support for expected-item and
    existing-menu-family-aware selection
  - package-owned nested submenu path selection via `openSubmenu(...)` and
    `selectNestedMenuPath(...)`
  - package-owned select-and-reopen verification via
    `inspectNestedMenuPathSelection(...)` and
    `selectAndVerifyNestedMenuPathOption(...)`
- Still remaining:
  - deciding whether anchor-near-trigger scoring repeats enough to move out of
    adapters entirely

## New reusable learnings from Gemini native attachment work (2026-04-04)

The Gemini native image debugging line exposed a different class of reusable
browser workflow lesson than the earlier menu/dialog work:

- the provider can stage an attachment successfully
- the prompt can commit successfully
- a model answer can materialize successfully
- and the overall action can still be wrong because the attachment was not
  preserved into model-visible input

That means browser-service needs a slightly stronger model for attachment-backed
actions than “upload appeared” or “send button clicked”.

### A. Attachment-backed actions need phase-aware diagnostics

Problem:
- Gemini only became debuggable once the attachment flow was broken into:
  - pre-submit staged state
  - immediate post-submit state
  - final answer-time state
- without that, the failure looked like random timeout churn

## 2026-04-07 anti-bot adoption checkpoint

Shared blocking-state classification is now consumed by:
- `browser-tools probe|doctor`
- `auracall doctor`
- `auracall features`
- `auracall features snapshot|diff`
- `auracall setup`
- `auracall login`

Remaining intended propagation target:
- keep extending the same seam to any remaining high-churn live browser flows,
  but the primary shared browser execution entry points now do one early
  blocking-page preflight before deeper automation

What should move into browser-service:
- a small generic action-phase diagnostic helper for attachment-backed flows
- intended shape:
  - `captureActionPhaseDiagnostics(...)`
  - phases like:
    - `staged`
    - `post-submit`
    - `final`
- provider code should still define its own selectors/signals, but the capture,
  serialization, and failure formatting mechanics should be package-owned

Candidate extraction:
- `captureActionPhaseDiagnostics(...)`
- `formatActionPhaseFailure(...)`

Progress:
- first package extraction is now live:
  - `captureActionPhaseDiagnostics(...)`
- current first adopter:
  - Gemini native attachment submit diagnostics
- still remaining:
  - decide whether generic failure-message formatting really belongs in the
    package or should stay provider-local

### B. Attachment readiness should be multi-signal, not single-selector

Problem:
- Gemini staged images used:
  - visible `blob:` thumbnails
  - `Remove file ...` affordances
  - send-ready state
- ChatGPT/Grok already use richer attachment evidence than “one preview node
  appeared”

What should move into browser-service:
- a generic attachment-signal poller that can combine:
  - preview signals
  - remove-action signals
  - input/file state
  - send-ready state
  - stability across repeated polls

Important boundary:
- browser-service should own the polling contract and state shape
- providers should still supply the actual signal readers/selectors

Candidate extraction:
- `waitForAttachmentPhase(...)`
- `readAttachmentSignals(...)`

Progress:
- first package extraction is now live:
  - `waitForAttachmentSignals(...)`
- current first adopter:
  - Gemini attachment preview stabilization
- still remaining:
  - no shared provider-agnostic attachment signal shape is proven yet
  - current comparison says browser-service should stop at the polling
    contract and keep signal payloads provider-local until a second provider
    proves a genuinely stable common shape

Comparison checkpoint:
- ChatGPT/Grok attachment waits center on:
  - `uploading`
  - `filesAttached`
  - `attachedNames`
  - `inputNames`
  - `fileCount`
  - composer/send-button state
- Gemini attachment waits center on:
  - `sendReady`
  - `visibleBlobCount`
  - `removeLabels`
  - `previewNames`
  - `matchedNames`
- overlap exists only at a weak level:
  - attachment evidence exists
  - send surface is ready
  - some expected names appear
- that overlap is not strong enough yet to justify one package-owned signal
  payload shape

### C. Ordered upload-surface fallback belongs in package mechanics

Problem:
- Gemini image upload only recovered once the provider used the hidden
  image-specific uploader before the hidden generic file uploader
- this is the same general shape as:
  - row-action fallbacks
  - menu-surface fallbacks
  - dialog/page trigger fallbacks

What should move into browser-service:
- a generic ordered “upload surface” fallback runner:
  - try surface A
  - if not ready/compatible, try surface B
  - preserve which surface actually accepted the action

Important boundary:
- the exact surfaces/selectors stay provider-local
- the ordered fallback mechanics and diagnostic history are package-owned

Candidate extraction:
- `openAndDispatchUploadFromSurfaces(...)`
- `runOrderedSurfaceFallback(...)`

Progress:
- first package extraction is now live:
  - `runOrderedSurfaceFallback(...)`
- current first adopter:
  - Gemini native upload-trigger chooser selection
- still remaining:
  - decide whether upload-specific dispatch/result formatting belongs in the
    package or should stay provider-local

### D. Post-submit semantic verification should be a first-class hook

Problem:
- Gemini reached a misleading state where:

## Deferred browser-state TODO - captcha / anti-bot awareness (2026-04-05)

Problem:
- live Gemini work hit both:
  - Google `google.com/sorry` unusual-traffic interstitials
  - visible reCAPTCHA checkbox challenges
- without first-class handling, those states get misreported as generic
  route-settle or provider DOM failures
- current nuance to preserve:
  - AuraCall's Gemini provider/service path already classifies
    `google.com/sorry` and can persist a Gemini anti-bot cooldown
  - the unresolved gap is browser-service / `browser-tools` / generic doctor
    output, which still leaves those states as raw page observations unless a
    provider-specific guarded path is in play

What should eventually move into browser-service:
- a generic blocking-surface classifier for:
  - captcha / human-verification
  - anti-bot interstitials
  - provider-owned login/challenge gates
- a small recovery contract:
  - detect
  - classify
  - optionally attempt one bounded real-pointer assist for simple visible
    checkbox challenges
  - otherwise pause with an explicit manual-resume path

Important boundary:
- browser-service should own the blocking-surface mechanics and error shape
- providers should still own service-specific wording and any provider-local
  challenge selectors

Candidate extraction:
- `classifyBlockingSurface(...)`
- `withHumanVerificationAwareRecovery(...)`

Status:
- recorded as a roadmap TODO only
- next anti-drift refinement when this resumes:
  - browser-tools and package doctor should emit an explicit blocking-surface
    classification for `google.com/sorry` instead of forcing manual inference
- do not promote this ahead of the active Gemini refactor/delete slice unless
  captcha/anti-bot interstitials become the primary blocker again
  - prompt committed
  - answer materialized
  - but the answer was attachment-blind
- this was a real browser action failure, not a successful run

What should move into browser-service:
- a generic post-submit verification hook shape that lets providers classify:
  - false-success answers
  - tool-missing answers
  - attachment-blind answers

Important boundary:
- browser-service should not encode provider-specific language
- it should provide the hook point and failure-report structure

Candidate extraction:
- `verifyPostSubmitOutcome(...)`
- `classifySemanticFalseSuccess(...)`

### E. Owned-target discipline remains the default starting point

Problem:
- Gemini attachment debugging wasted time until it used the same owned-target
  and competing-tab-trim discipline already proven in ChatGPT/Grok

Lesson:
- new provider browser flows should begin with package-owned target ownership,
  not rediscover it later

Implication for backlog priority:
1. attachment phase diagnostics
2. multi-signal attachment readiness
3. ordered upload-surface fallback
4. post-submit semantic verification hooks

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
- Added `browser-tools search` as a package-owned structured DOM-census surface
  for:
  - generic text / aria / role / class / `data-test-id` matching
  - `aria-checked` / `aria-expanded` state reads
  - bounded visible-node discovery without app-specific `eval` snippets
- Added `browser-tools ls` as the broader package-owned page census surface for
  generic discoverable UI features and controls:
  - dialogs
  - menus
  - buttons
  - menu items
  - switches
  - inputs
  - links
- Live Gemini proof now shows why this belongs in browser-service:
  - the same tool can find the `Tools` opener, the drawer rows
    (`Create image`, `Canvas`, `Deep research`, `Create video`,
    `Create music`, `Guided learning`), and the `Personal Intelligence` switch
    once the drawer is open

Next:
- Keep the output generic; service-specific interpretation still belongs in the
  host app.
- Decide whether storage/cookie probe matching should stay exact-name based or
  grow a generic substring/prefix mode later.
- Start moving volatile provider DOM discovery onto `search`-style structured
  probes before adding more one-off adapter-local `evaluate(...)` census code.

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
- Browser-tools now classifies visible anti-bot / human-verification surfaces in
  `pageProbe.blockingState` for:
  - Google `google.com/sorry`
  - CAPTCHA / reCAPTCHA
  - Cloudflare interstitials
  - generic human-verification pages
- Next browser-service anti-bot step:
  - broaden runtime consumers beyond browser-tools/doctor/features/setup so
    more operator flows stop before noisy retry loops, especially on Gemini
