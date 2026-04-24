# Plan 0053 | Browser Control Plane Completion

State: CLOSED
Lane: P01

## Purpose

Finish the browser-service dispatcher/control-plane work so browser mutations
for managed AuraCall browser profiles route through one well-defined authority
instead of being split across browser-service helpers, provider adapters, and
legacy browser flows.

This is the follow-on to closed Plan 0021. Plan 0021 proved managed-profile
operation ownership and same-machine locking. This plan finishes the
control-plane boundary by centralizing navigation, reload, target reuse/open,
and related browser mutations behind one browser-service mutation dispatcher.

## Current State

What already exists:

- profile-scoped browser operation acquisition in
  `packages/browser-service/src/service/operationDispatcher.ts`
- first mutation-audit substrate now exists in
  `packages/browser-service/src/service/mutationDispatcher.ts`
  - `beginBrowserMutation(...)`
  - `createInMemoryBrowserMutationLog(...)`
  - current Slice 1 adoption:
    - `navigateAndSettle(...)`
    - `openOrReuseChromeTarget(...)`
    - `connectToRemoteChrome(...)` pass-through support
- managed-profile locking for login, setup, doctor, features, browser
  execution, and AuraCall-managed `browser-tools` flows
- browser-service target resolution helpers:
  - `resolveDevToolsTarget(...)`
  - `resolveServiceTarget(...)`
- provider-level `preserveActiveTab` / no-post-submit-navigation protections
  across ChatGPT, Gemini, and Grok
- bounded browser diagnostics on runtime/media status surfaces
- browser-service-owned bounded mutation history for the selected AuraCall
  runtime profile and service, surfaced through opt-in browser diagnostics
- legacy ChatGPT/Grok navigation helpers and ChatGPT reattach fallback
  navigation now route through `navigateAndSettle(...)`
- direct product-code browser mutations are statically limited to the approved
  browser-service control points
- raw mutating CDP scripts are explicitly listed in
  `RAW_DEVTOOLS_MUTATING_SCRIPT_ALLOWLIST` and must call the raw DevTools guard

What remains unresolved:

- this plan's product-code control-plane scope is complete
- raw dev/debug scripts remain intentional escape hatches, not product
  automation paths
- if Gemini still falls back to root `/app`, diagnostics can now distinguish an
  AuraCall-issued mutation from provider/browser state by inspecting the
  recorded mutation history

## Audit Inventory

Codebase audit on 2026-04-23 originally found these refactor points. Their
current status is recorded below.

### 1. Browser-service mutation primitives still mutate directly

- `packages/browser-service/src/service/ui.ts`
  - `navigateAndSettle(...)` calls `Page.navigate(...)`
  - optional fallback calls `location.assign(...)`
- `packages/browser-service/src/chromeLifecycle.ts`
  - `focusChromeTarget(...)` can call `Page.navigate(...)` while reusing a tab
  - `connectToRemoteChrome(...)` routes through `openOrReuseChromeTarget(...)`
    which may navigate a reused tab as part of focus/reuse

### 2. Provider adapters still own direct mutation logic

- `src/browser/providers/geminiAdapter.ts`
  - target connection/reuse through `openOrReuseChromeTarget(...)`
  - several provider navigation helpers use `navigateAndSettle(...)`
- `src/browser/providers/chatgptAdapter.ts`
  - target connection/reuse through `openOrReuseChromeTarget(...)`
  - direct `Page.reload(...)` recovery paths remain in multiple flows
  - several provider navigation helpers use `navigateAndSettle(...)`
- `src/browser/providers/grokAdapter.ts`
  - target connection/reuse through `openOrReuseChromeTarget(...)`
  - direct `Page.navigate(...)` fallback paths remain
  - several provider navigation helpers use `navigateAndSettle(...)`

### 3. Legacy browser flows still mutate outside the dispatcher boundary

- `src/browser/index.ts`
  - direct `connectToRemoteChrome(...)` uses the browser-service
    open/reuse helper; remote-Chrome usage is outside managed-profile
    product mutation ownership
  - direct `Page.navigate(...)` assistant-response reload path migrated to
    `navigateAndSettle(...)`
- `src/browser/actions/navigation.ts`
  - direct `Page.navigate(...)` migrated to `navigateAndSettle(...)`
- `src/browser/actions/grok.ts`
  - direct `Page.navigate(...)` migrated to `navigateAndSettle(...)`
- `src/browser/reattachHelpers.ts`
  - direct `location.href = targetUrl` fallback removed; caller receives the
    target URL and routes through `navigateAndSettle(...)`
- `src/gemini-web/browserNative.ts`
  - direct `openOrReuseChromeTarget(...)` call now carries a mutation source

### 4. Mutation surface size at audit time

- direct `Page.navigate(...)` call sites: `7`
- direct `Page.reload(...)` call sites: `5`
- explicit `location.assign(...)` call sites: `1`
- explicit `location.href =` / `window.location` mutation call sites: `6`
- `openOrReuseChromeTarget(...)` call sites: `9`
- `navigateAndSettle(...)` call sites: `13`

These counts are the current refactor inventory, not permanent architecture.

## Scope

### In scope

- define one browser-service-owned mutation dispatcher for:
  - target open/reuse
  - tab navigation
  - reload
  - in-page location mutation fallback
  - close/focus/bring-to-front only when those actions are part of a mutation
    request
- require provider/browser code to declare mutation intent to the dispatcher
  instead of calling CDP page mutations directly
- add structured mutation audit records with:
  - dispatcher key
  - operation id
  - request source
  - mutation kind
  - target id
  - from URL
  - requested URL
  - actual post-mutation URL when known
  - `preserveActiveTab` / navigation-policy flags
- add a bounded browser-service mutation log or callback surface so runtime/media
  diagnostics can attribute later tab state to prior AuraCall mutations
- update browser-service/roadmap docs so this lane is explicitly reopened as a
  concrete browser reliability exception

### Out of scope

- provider-specific selector fixes unrelated to mutation ownership
- broad multi-runner scheduling changes
- raw CDP support for arbitrary external clients
- speculative parallel browser work on one managed browser profile
- solving every Gemini provider behavior mismatch in this slice

## Design Contract

### Control-plane rule

For managed AuraCall browser profiles, browser mutations must be routed through
one browser-service control plane per dispatcher key:

`managed-profile:<absolute-managed-profile-dir>::service:<target>`

### Allowed direct browser access after this migration

Allowed direct access should be limited to:

- read-only DOM/runtime inspection helpers that do not navigate, reload, or
  retarget tabs
- explicit raw-CDP escape-hatch scripts already fenced by policy and CLI guard

### Dispatcher responsibilities

- serialize mutation requests on the existing operation-dispatcher ownership
  boundary
- enforce no-post-submit-navigation and similar policy gates centrally
- make target reuse/open behavior explicit rather than hidden inside tab-focus
  helpers
- log the mutation source so later browser diagnostics can answer:
  - who asked for the navigation
  - when
  - from where in the product stack

## Work Plan

### Slice 1 | Browser-service mutation dispatcher

- add a browser-service-owned mutation API that wraps:
  - `openOrReuseChromeTarget(...)`
  - `navigateAndSettle(...)`
  - direct `Page.reload(...)` fallbacks where still allowed
- instrument mutation events before and after execution
- preserve current behavior; this slice is primarily authority and evidence

Status:

- partial implementation landed on 2026-04-23
- current scope completed:
  - package-owned mutation audit primitive
  - audit records for `navigateAndSettle(...)`
  - audit records for `reloadAndSettle(...)`
  - audit records for `openOrReuseChromeTarget(...)`
  - pass-through audit support from `connectToRemoteChrome(...)`
  - browser-service-owned accessor for recent mutation history
  - runtime/media browser diagnostics read back those mutation records when
    `diagnostics=browser-state` is requested
- still remaining in Slice 1:
  - enforcement that all managed-profile mutations must enter through the
    dispatcher-owned API rather than direct CDP calls

### Slice 2 | Provider adoption

- route Gemini/ChatGPT/Grok provider navigation/reload/open-reuse flows through
  the mutation dispatcher
- remove or fence direct provider-local `Page.navigate(...)`,
  `Page.reload(...)`, and URL-assignment fallbacks
- keep provider-specific readiness predicates local

Status:

- partial implementation landed on 2026-04-23
- current scope completed:
  - provider option surface now carries `mutationAudit` and
    `mutationSourcePrefix`
  - Gemini/ChatGPT/Grok tab-connect helpers now pass mutation audit context
    into `openOrReuseChromeTarget(...)`
  - connected provider clients now retain mutation context for later helper
    calls
  - Gemini/ChatGPT/Grok shared route-settle helpers now emit provider-owned
    mutation sources through `navigateAndSettle(...)`
  - ChatGPT reload recovery paths now emit provider-owned mutation sources
    through `reloadAndSettle(...)`
  - Grok provider-local fallback navigations now emit provider-owned mutation
    sources through `navigateAndSettle(...)`
- still remaining in Slice 2:
  - provider paths that still mutate outside `openOrReuseChromeTarget(...)` /
    `navigateAndSettle(...)`
    / `reloadAndSettle(...)`

### Slice 3 | Legacy browser flow adoption

- route `src/browser/index.ts`, `src/browser/actions/*`,
  `src/browser/reattachHelpers.ts`, and `src/gemini-web/browserNative.ts`
  through the same mutation control plane or explicitly fence them as legacy
  escape hatches

Status:

- partial implementation landed on 2026-04-23
- current scope completed:
  - ChatGPT legacy `navigateToChatGPT(...)` now uses
    `navigateAndSettle(...)`
  - Grok legacy `navigateToGrok(...)` now uses `navigateAndSettle(...)`
  - ChatGPT assistant-response retry navigation in `src/browser/index.ts`
    now uses `navigateAndSettle(...)`
  - reattach sidebar fallback no longer assigns `location.href` inside the
    page; callers receive the fallback URL and route it through
    `navigateAndSettle(...)`
  - Gemini native browser attachment tab open now declares a mutation source
    when calling `openOrReuseChromeTarget(...)`
  - static regression coverage rejects direct legacy `Page.navigate(...)`,
    `Page.reload(...)`, `location.assign(...)`, `location.replace(...)`, and
    `location.href = ...` mutations outside approved browser-service/provider
    control points
- still remaining in Slice 3:
  - decide whether raw dev/debug scripts should remain separately fenced only
    or should gain a dedicated explicit escape-hatch audit helper

### Slice 4 | Enforcement and cleanup

- add targeted tests or static checks that fail when new direct mutation calls
  are introduced outside approved browser-service control points
- update docs and operator guidance to describe the control-plane boundary

Status:

- completed on 2026-04-23
- current scope completed:
  - `tests/browser/browserMutationControlPlane.test.ts` rejects direct product
    `Page.navigate(...)`, `Page.reload(...)`, `location.assign(...)`,
    `location.replace(...)`, and `location.href = ...` mutations outside:
    - `packages/browser-service/src/service/ui.ts`
    - `packages/browser-service/src/chromeLifecycle.ts`
  - raw mutating CDP scripts are scanned separately and must match
    `RAW_DEVTOOLS_MUTATING_SCRIPT_ALLOWLIST`
  - allowlisted raw mutating scripts must import/call
    `enforceRawDevToolsEscapeHatchForCli`
  - docs now describe raw scripts as explicit escape hatches, not product
    browser-service pathways

## Acceptance Criteria

- managed-profile browser mutations are attributable to one browser-service
  dispatcher-owned control plane
- provider adapters no longer issue direct page navigation/reload mutations
  except through the central browser-service mutation API
- target reuse/open behavior records when a reused tab was navigated as part of
  reuse
- runtime/media/browser diagnostics can report the latest AuraCall mutation
  events for the owned tab/profile
- the current Gemini root-fallback class of bug can be attributed to either:
  - an AuraCall-issued mutation event
  - or the absence of one, narrowing blame to provider/browser state

## Validation

- targeted unit tests for the new mutation dispatcher and audit record shape
- targeted provider tests for Gemini/ChatGPT/Grok adoption
- targeted live/browser dogfood only after the first two slices land
- planning/doc validation:
  - `pnpm run plans:audit -- --keep 53`
  - `git diff --check`

## Definition Of Done

- completed: one browser-service mutation API owns product-code
  managed-profile navigation/reload/tab retargeting semantics
- completed: the audit inventory in this plan is either migrated or explicitly
  fenced as a raw path
- completed: roadmap and browser-service docs record the lane closeout
- completed: journal/fixes log record the control-plane lesson
