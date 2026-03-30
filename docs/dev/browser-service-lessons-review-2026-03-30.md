# Browser-Service Lessons Review (2026-03-30)

Purpose: capture the reusable lessons from the ChatGPT MVP/polish work and turn
them into a concrete browser-service follow-on plan for later browser
automation tasks.

Scope of evidence:
- ChatGPT model/tool selection
- ChatGPT project CRUD + instructions/files
- ChatGPT root/project conversation CRUD
- ChatGPT context extraction + artifact extraction/materialization
- ChatGPT rate-limit and acceptance-harness hardening

This is not a product plan. It is a package-boundary review: what should move
into `packages/browser-service/`, what should stay provider-local, and what
order we should extract the next generic pieces.

## What We Confirmed

### 1. Stable scoped handles beat generic selectors

We already proved this for visible menus:
- menu-family selection
- stable visible-menu handles
- nested submenu traversal
- select-and-reopen verification

The same lesson repeated on dialogs and panels:
- ChatGPT project delete had to be scoped to the actual project-settings dialog
  when a rate-limit dialog could also be visible
- generic `[role="dialog"]` is too weak once multiple overlays coexist

Browser-service implication:
- stable scoped handles should not stop at menus
- dialogs/panels/overlays need the same package-owned treatment

### 2. Browser automation needs a first-class blocking-surface recovery model

The current rate-limit modal work surfaced a generic pattern:
- detect a blocking visible surface
- classify it
- dismiss it when safe
- pause
- retry once
- then escalate

Today the ChatGPT adapter owns that logic because the classifier is
provider-specific. But the mechanic is generic.

Browser-service implication:
- package should own the recovery loop and the surface inventory
- providers should only supply classifiers and policy

### 3. Native downloads are often not network requests in the page sense

The artifact work proved that many modern web apps:
- do not expose downloadable files through fetch/XHR
- instead emit a real anchor click to a signed URL

That is a browser-mechanics problem, not a ChatGPT problem.

Browser-service implication:
- package should own "capture the download target produced by this click"
- providers should only decide which button or card header to click

### 4. In-page fetches can lie; CDP network capture is sometimes authoritative

ChatGPT conversation context proved that:
- an in-page fetch can return a JSON 404 or placeholder even when the hydrated
  route visibly contains the right content
- CDP `responseReceived` + `loadingFinished` + `getResponseBody` on reload is a
  more reliable recovery path

Browser-service implication:
- network-response capture on reload/navigation should be a package helper
- providers should describe what response to match, not reimplement the capture
  loop

### 5. Success should be defined by post-condition from the authoritative surface

This repeated everywhere:
- rename is not "Enter was pressed"; rename is "same entity reappeared with new
  title at the expected authoritative location"
- delete is not "confirm button clicked"; delete is "entity disappeared from
  the authoritative list/surface"
- project chats required the project page list, not the sidebar subset

Part of this is app semantics, but part is a generic tooling gap:
- we still make adapters hand-roll many row/list post-condition waits

Browser-service implication:
- package should own more list/row post-condition helpers
- providers should only declare identity/title/order expectations

### 6. Shared managed browser profiles need serialized work, not optimistic parallelism

The artifact runs and acceptance runs made this very clear:
- one managed signed-in browser/tab is a shared mutable resource
- parallel live tasks can interfere with each other even when the provider code
  itself is correct

Browser-service implication:
- package/service layer needs an explicit profile-scoped operation lease or
  serialization primitive
- later operators and acceptance runners should use that instead of hoping
  external discipline prevents interference

### 7. Not all "writes" are equal

The ChatGPT guard work exposed two different layers:
- generic sequencing/instrumentation of action classes
- provider-specific policy about which actions are expensive and how much to
  back off

Browser-service should not own ChatGPT's exact weights, but it can still own a
generic action model:
- prepare
- commit
- follow-up refresh
- destructive confirm
- download/materialize

Browser-service implication:
- package can expose generic action instrumentation and mutation phase hooks
- providers should keep the actual policy and pacing numbers

### 8. Diagnostics are best when they report intent, not just DOM

This was already true for menus and became even clearer with the newer work:
- failures are much faster to repair when the diagnostic payload includes:
  - intended entity id/title
  - intended root scope
  - intended interaction strategy
  - expected post-condition

Browser-service implication:
- diagnostics should continue to move toward intent-aware snapshots
- new helpers should require/encourage structured context

## What Should Move Into Browser-Service Next

### A. Dialog/overlay inventory plus stable handles

Why:
- we already solved this problem for menus
- dialogs are the next repeated overlapping surface

Desired package capability:
- bounded visible dialog/overlay census
- stable tagged selector/handle for the chosen root
- geometry + label/title summary
- optional anchor proximity

Likely helpers:
- `collectVisibleDialogInventory(...)`
- `pickDialogRoot(...)`
- `tagVisibleDialogRoot(...)`

### B. Blocking-surface recovery framework

Why:
- ChatGPT rate-limit modal recovery is a generic mechanic

Desired package capability:
- inventory visible blocking surfaces
- let callers provide one or more classifiers
- if matched:
  - dismiss
  - optional quiet wait
  - optional retry budget

Likely helper:
- `withBlockingSurfaceRecovery(...)`

Provider-owned inputs:
- classifiers (`rate limit`, `auth expired`, `retry later`, etc.)
- retry policy
- whether dismissal is safe

### C. Native download-target capture

Why:
- modern web apps increasingly hide downloads behind buttons/cards/menus rather
  than obvious anchors

Desired package capability:
- perform a real click
- capture resulting anchor/download URL or browser download event
- return the resolved URL plus metadata

Likely helpers:
- `captureClickDownloadTarget(...)`
- `fetchCapturedDownload(...)`

Provider-owned inputs:
- which button/card affordance to click
- desired filename expectations when known

### D. Network-response capture on reload/navigation

Why:
- context/data recovery should not require each adapter to reimplement CDP
  response matching

Desired package capability:
- attach a temporary network listener
- optionally reload/navigate
- match by URL/content-type/predicate
- wait for loading finished
- return response body + metadata

Likely helper:
- `captureNetworkResponseOnReload(...)`

### E. Row/list post-condition helpers

Why:
- rename/delete/create verification keeps repeating

Desired package capability:
- wait for row by identity/title/order
- wait for disappearance from authoritative list
- wait for "same id moved to top" or "title updated in place"

Likely helpers:
- `waitForRowState(...)`
- `waitForListMutation(...)`

Provider-owned inputs:
- row identity extraction
- authoritative root selector
- ordering/title semantics

### F. Profile-scoped operation lease

Why:
- one signed-in managed browser is a shared mutable system

Desired package capability:
- acquire a short-lived lease for a profile/provider/browser target
- serialize high-risk live operations
- expose whether an operation had to wait for another active holder

Likely helper:
- `withBrowserOperationLease(...)`

This belongs close to browser-service / session orchestration, not in each
provider.

### G. Generic action-phase instrumentation

Why:
- providers need to distinguish:
  - prepare UI work
  - commit write
  - post-commit follow-up

Desired package capability:
- generic action labels and timestamps
- optional hooks for policy layers to consume

Likely output shape:
- action phase timeline attached to diagnostics or runtime metadata

This should support provider policies like ChatGPT's weighted pacing without
hardcoding those policies into browser-service.

## What Should Stay Provider-Local

These are still app semantics, not browser mechanics:

- provider-native id/url normalization
  - `g-p-...`
  - root/project conversation id resolution
- artifact classification
  - `image`
  - `spreadsheet`
  - `canvas`
  - `download`
- authoritative surface choice
  - project page list vs sidebar subset
  - row menu vs page menu vs dialog
- rate-limit copy/classifiers and pacing weights
- stale assistant-turn semantics for conversation sends
- project/source/tool/file semantic categories

Browser-service should support these decisions, not absorb them.

## Recommended Extraction Order

1. Dialog/overlay inventory + stable root handles
2. Blocking-surface recovery framework
3. Native download-target capture
4. Network-response capture on reload/navigation
5. Profile-scoped browser operation lease
6. Row/list post-condition helpers
7. Generic action-phase instrumentation

Reason for this order:
- the first four reduce the most repeated adapter glue immediately
- the lease prevents future false negatives caused by shared-browser
  interference
- row/list post-condition helpers are valuable, but the blocking/modal/download
  issues are more expensive and more broadly disruptive
- action-phase instrumentation is useful, but it is best added after the higher
  impact mechanics are stable

## Suggested Immediate Follow-on Work

If we want the next browser-service extraction pass to pay off quickly, do this:

1. implement dialog inventory + stable dialog handles
2. port the ChatGPT rate-limit modal recovery onto a generic
   `withBlockingSurfaceRecovery(...)` package helper
3. implement click-to-download target capture in browser-service
4. move at least one ChatGPT artifact materialization path onto that shared
   download helper

That would turn the recent ChatGPT work from one-off reliability code into
package-owned leverage for later browser automation tasks.

## Progress Update

Implemented the same day:
- `collectVisibleOverlayInventory(...)`
- `dismissOverlayRoot(...)`
- `withBlockingSurfaceRecovery(...)`

First provider adoption:
- ChatGPT context/artifact rate-limit modal recovery now uses those shared
  browser-service primitives instead of keeping the whole detect/dismiss/retry
  loop provider-local.

Still next:
- native download-target capture
- network-response capture on reload/navigation
- profile-scoped browser operation lease
- row/list post-condition helpers
- generic action-phase instrumentation
