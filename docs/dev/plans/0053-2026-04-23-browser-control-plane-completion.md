# Plan 0053 | Browser Control Plane Completion

State: OPEN
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
- managed-profile locking for login, setup, doctor, features, browser
  execution, and AuraCall-managed `browser-tools` flows
- browser-service target resolution helpers:
  - `resolveDevToolsTarget(...)`
  - `resolveServiceTarget(...)`
- provider-level `preserveActiveTab` / no-post-submit-navigation protections
  across ChatGPT, Gemini, and Grok
- bounded browser diagnostics on runtime/media status surfaces

What remains unresolved:

- browser mutation authority is still split across several layers
- navigation and reload actions are not yet forced through one dispatcher-owned
  path
- target reuse/open can still navigate reused tabs below the provider layer
- provider and legacy flows can still issue direct CDP page mutations without a
  central audit trail
- the reproduced Gemini browser-media mismatch shows this clearly:
  - `prompt_submitted` records a concrete conversation route
  - the owned tab later appears back on root `/app`
  - current instrumentation can prove the bad state, but not yet attribute the
    exact AuraCall mutation path that caused it

## Audit Inventory

Codebase audit on 2026-04-23 found these remaining refactor points:

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
  - direct `connectToRemoteChrome(...)`
  - direct `Page.navigate(...)` assistant-response reload path
- `src/browser/actions/navigation.ts`
  - direct `Page.navigate(...)`
- `src/browser/actions/grok.ts`
  - direct `Page.navigate(...)`
- `src/browser/reattachHelpers.ts`
  - direct `location.href = targetUrl` fallback
- `src/gemini-web/browserNative.ts`
  - direct `openOrReuseChromeTarget(...)`

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

### Slice 2 | Provider adoption

- route Gemini/ChatGPT/Grok provider navigation/reload/open-reuse flows through
  the mutation dispatcher
- remove or fence direct provider-local `Page.navigate(...)`,
  `Page.reload(...)`, and URL-assignment fallbacks
- keep provider-specific readiness predicates local

### Slice 3 | Legacy browser flow adoption

- route `src/browser/index.ts`, `src/browser/actions/*`,
  `src/browser/reattachHelpers.ts`, and `src/gemini-web/browserNative.ts`
  through the same mutation control plane or explicitly fence them as legacy
  escape hatches

### Slice 4 | Enforcement and cleanup

- add targeted tests or static checks that fail when new direct mutation calls
  are introduced outside approved browser-service control points
- update docs and operator guidance to describe the control-plane boundary

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
  - `pnpm run plans:audit -- --keep 52`
  - `git diff --check`

## Definition Of Done

- one browser-service mutation API owns managed-profile navigation/reload/tab
  retargeting semantics
- the audit inventory in this plan is either migrated or explicitly fenced as a
  legacy/raw path
- roadmap and browser-service roadmap both show this lane as the active browser
  reliability exception
- journal/fixes log record the control-plane lesson and remaining follow-on
  posture
