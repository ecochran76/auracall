# ChatGPT Hardening Plan

Goal: move ChatGPT browser support from "green on the happy path with guarded acceptance" to "resilient against real bad-state UI and backend instability" on the managed WSL Chrome path.

This is a reliability plan, not a new-surface plan. Core ChatGPT CRUD/history/context/artifact surfaces are already implemented and acceptance-green. The remaining work is hostile-state detection, recovery, and operator-visible failure classification.

Current baseline:
- root conversation CRUD is green
- project conversation CRUD is green
- project CRUD/files/instructions are green
- conversation context/history ingestion is green
- artifact extraction/materialization is green for the current representative smoke set
- fresh-state full ChatGPT acceptance is green
- visible bad-state classification is implemented for:
  - `rate-limit`
  - `connection-failed`
  - `retry-affordance`
  - `transient-error`
- read-path recovery is already wired into:
  - conversation context reads
  - artifact materialization
  - root/project conversation list refresh
- stale browser-send rejection now distinguishes real rate limits from other
  classified bad states and keeps cooldown persistence rate-limit-only

What is not yet hardened enough:
- visible transient error toasts/banners, especially red/white error surfaces
- `server connection failed` / network/server-side bad-chat states
- conversations that surface visible `Retry` / `Try again` / `Regenerate response` affordances
- sluggish server/network conditions that create partial or stale DOM
- distinction between "transient and retryable" vs "conversation genuinely in a bad state"
- operator-facing diagnostics that classify the failure without requiring DOM spelunking

## Hardening targets

### 1. Blocking/transient surface classification

Add a provider-owned classifier for visible ChatGPT bad states:
- rate-limit modal/dialog
- transient connection/server failure
- visible retry-affordance state
- generic transient error toast/banner

Requirements:
- classify from visible overlay/button state first, not only thrown text
- keep the classifier conservative; avoid matching normal confirm dialogs
- expose a short summary suitable for logs and error messages

Definition of done:
- provider can return a structured `kind + summary + selector/details`
- unit tests cover at least the known strings:
  - `Too many requests`
  - `server connection failed`
  - `Retry` / `Try again`
  - generic `Something went wrong`

### 2. Recovery policy matrix

For each classified bad state, define an explicit recovery policy:
- `rate-limit`
  - dismiss if possible
  - pause
  - retry once
  - then defer to persisted cooldown guard
- `connection-failed`
  - do not blindly mutate the chat
  - refresh/reopen conversation route once
  - re-check conversation surface readiness
- `retry-affordance`
  - for read-only operations, never click retry automatically
  - classify and attempt a non-mutating recover path first:
    - refresh
    - reopen conversation from authoritative list
    - retry read
  - for send/mutate flows, policy must be explicit before any automatic click is allowed
- `transient-error`
  - dismiss if the surface is a toast/dialog with a close affordance
  - otherwise pause briefly and retry once

Definition of done:
- each class has one package/provider-visible policy
- recovery is bounded and does not loop indefinitely
- failures that survive recovery are surfaced with classed errors

### 3. Read-path hardening

Apply the classifier/recovery matrix first to the highest-value read paths:
- `conversations context get`
- `conversations artifacts fetch`
- `conversations files list`
- conversation list refresh on root/project surfaces

Requirements:
- read paths should prefer refresh/reopen/re-read over failing on the first transient UI problem
- if a stale/partial DOM is suspected, use current route + authoritative list/page surface to re-anchor
- rejection should preserve classified diagnostics

Definition of done:
- the read paths survive one transient visible bad state without operator intervention
- retryable failures are distinguishable from permanent/not-implemented failures

### 4. Send/mutation hardening

Extend hardening to mutating/chat-driving paths:
- browser prompt send
- rename/delete/project remove
- project file/instructions writes

Requirements:
- never auto-click ChatGPT controls that materially change model behavior (`Answer now` remains forbidden)
- do not auto-click retry/regenerate on failed assistant turns until there is a clear operation-specific policy
- if a send appears blocked by a transient state, reject stale assistant reuse and surface the classified reason
- if a mutation loses route/session state, re-anchor on the authoritative row/list surface before retrying

Definition of done:
- mutation flows do not report false success on stale or broken chat state
- recovery remains bounded and explicit

Current progress:
- browser send flows now fail fast on visible `retry-affordance` state instead
  of flattening it into generic stale-send behavior
- the operator-facing error now states that auto-clicking retry/regenerate is
  intentionally disabled
- in development mode (`browser.debug` / verbose logger), stale-send failures
  now emit structured bad-state logs plus a recent conversation snapshot for
  post-mortem download

### 5. Post-condition and bad-state verification

Strengthen the distinction between:
- action fired
- UI changed
- intended state persisted
- chat is actually healthy again

Examples:
- rename success = authoritative row text changed
- delete success = authoritative row disappeared
- read success = conversation DOM + payload/turn state are both coherent
- send success = fresh assistant/user state exists and is not blocked by a visible bad-state surface

Definition of done:
- verification helpers reject partial/bad-state DOMs
- success means the target state is healthy, not just that one click landed

### 6. Diagnostics and operator workflow

Expand durable failure context for ChatGPT:
- classified failure kind
- short summary
- whether recovery was attempted
- whether the path refreshed/reopened
- row/menu/dialog diagnostics where applicable

Operator guidance to preserve:
- phased acceptance remains the default
- fresh-state sweep remains the periodic confidence bar
- no Pro testing on this account

Definition of done:
- common transient failures can be understood from the error/log output alone
- docs/testing and polish docs describe the current operator workflow

Current progress:
- development-mode browser runs now log structured ChatGPT bad-state events for:
  - visible blocking surfaces after stale-send detection
  - stale-send failures that do not present a visible classified surface
  - read/recovery-path blocking-surface detections during:
    - conversation list refresh
    - conversation context reads
    - conversation file reads
    - artifact materialization
- each structured log currently includes:
  - classified surface kind + summary when available
  - source/probe details when available
  - policy label for retry-affordance handling
  - baseline/answer message and turn ids when present
  - a bounded browser post-mortem snapshot containing:
    - `href`
    - `document.title`
    - `document.readyState`
    - active-element tag/attrs
    - visible overlays with button labels
    - visible retry/regenerate buttons
    - recent conversation turns
- and, for non-send debug-mode adapter recoveries, the same snapshot is now
  also written to a bounded JSON file under `~/.auracall/postmortems/browser/`
  so later post-mortem tooling can consume it without scraping session text
- send-side stale-response failures in debug mode now also persist bounded JSON
  post-mortems to the same `~/.auracall/postmortems/browser/` store, with
  `mode = send` and the same classified surface + browser snapshot payload
- live proof now exists for synthetic-on-real `transient-error` recovery on:
  - root conversation list refresh (`reload-page` + `reopen-list`)
  - conversation context read (`reload-page` + `reopen-conversation`)
- live proof now also exists for bounded mutation/post-condition hardening on
  the managed WSL Chrome path:
  - root rename readiness + persistence:
    - `default`
    - `wsl-chrome-2`
  - root delete confirmation:
    - `wsl-chrome-2`
  - project source add/remove persistence:
    - `wsl-chrome-2`
- mutation post-condition semantics now have canonicalized seams for:
  - root rename editor readiness (`title-editor` only)
  - root rename persistence (`matchesChatgptConversationTitleProbe(...)`)
  - root delete confirmation (`matchesChatgptDeleteConfirmationProbe(...)`)
  - project-source persisted presence/absence after sources-tab reload

## Recommended implementation order

1. Blocking/transient surface classifier
2. Read-path recovery adoption
3. Failure classification in llmservice retry policy
4. Send/mutation bad-state handling
5. Broader live smoke for hostile-state scenarios

Current next slices:
6. Keep the persisted post-mortem payload work as maintenance, not the active
   mutation slice
   Status:
   - now includes current action/outcome for the implemented ChatGPT recovery
     paths (`reload-page`, `dismiss-overlay`, `close-dialog`)
   - now also includes one bounded authoritative re-anchor step for read paths:
     - `reopen-list` for list refresh
     - `reopen-conversation` for context/files/artifact reads

7. Audit and tighten the remaining mixed persistence/recovery surfaces before
   broadening live hostile-state work
   Ranked candidates after the latest rename/delete/project-source work:
   - project settings / instructions persistence and reopen-to-verify flow
   - read-path recovery consistency for context/artifact reads
   - broader operator-visible recovery-action diagnostics only if a concrete
     gap appears during those slices
   Recommendation:
   - take project settings / instructions persistence next, because it is still
     mutation-oriented, bounded, and narrower than reopening the broader
     context/artifact recovery paths

## Acceptance bar for hardening

Required before calling this plan substantially complete:
- focused unit coverage for classifier/recovery helpers
- `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
- `pnpm exec tsc -p tsconfig.json --noEmit`
- one guarded live rerun of ChatGPT acceptance after the read-path hardening slice lands

Non-goals for this plan:
- inventing UI actions ChatGPT does not expose
- auto-clicking assistant-turn retry/regenerate by default
- Pro-specific behavior on this account
- share-page parity
