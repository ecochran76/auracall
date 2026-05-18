# React Operator UX Redesign

Status: OPEN
Date: 2026-05-16
Lane: P01

## Context

The current AuraCall dashboard is a proof-of-concept and debug surface. It has
grown around operational probes, live-follow controls, and cache previews, but
it is not a usable product UX. It should remain available for low-level
diagnostics while a new operator console is built as a separate React/Vite app.

AuraCall's operator UX must eventually support service health monitoring,
chat/archive review, lexical and semantic search across cached provider
history and generated artifacts, agent/team/config management, API key
operations, logs, and controlled job launch workflows.

## Current State

Implemented:

- The existing HTML dashboard remains the debug/proof surface at `/ops/browser`.
- The React/Vite shell is served by the AuraCall API service at `/dashboard`
  from packaged `dist/operator-ux` assets.
- Same-origin `/dashboard` requests receive an operator-superuser auth context
  for browser UX calls into `/v1/*`; external clients still use bearer/API-key
  authentication.
- JSON API, CLI, and MCP surfaces now expose durable run status, account mirror
  status, archive search, archive item readback, asset download, asset lookup,
  and evidence attachment.
- Buffer CLI has a usable React/Vite operator-shell precedent: sticky top bar,
  dense operator tables, persistent local UI preferences, toast feedback, and
  collapsible/resizable side panes.

Remaining:

- Continue moving feature pages into the separate React/Vite AuraCall operator
  app instead of extending the existing inline HTML dashboard.
- Tighten the route taxonomy, state ownership, and API client boundary as real
  pages mature.
- Keep mutation controls limited to narrow, explicitly validated operator
  workflows until read-only views prove the API contracts.

## Product Direction

The durable shell should use:

- left-aligned `AuraCall` title in the top row
- centered primary navbar
- top-right active operator/context chip with a high-z menu for UX settings,
  tenant config, agents, teams, API keys, and diagnostics
- animated collapsible left and right panes with persisted widths
- central viewport for the selected working surface

Initial route taxonomy:

- `Chats`: chat-dialog views, provider/account/project filters, conversation
  artifacts, inline file cards
- `Search`: lexical and semantic search over conversations, archive records,
  uploads, generated artifacts, files, and evidence
- `Runs`: response runs, response batches, team runs, live-follow operations,
  timelines, queues, and launch/retry/cancel controls
- `Health`: API service, browser profiles, account bindings, provider guards,
  dispatcher locks, rate limits, and logs

`Stream` is intentionally not a primary nav label. Live event streams and
live-follow state belong under `Runs` or `Health` until a concrete workflow
requires a separate top-level route.

## Non-Goals

- Do not convert the existing proof dashboard in place.
- Do not add provider browser work for the UX shell.
- Do not launch or mutate jobs from the first shell slice.
- Do not build a marketing landing page.
- Do not make dashboard layout decisions depend on private chat history; keep
  the contract in this plan and the source tree.

## Architecture

The app lives under `ux/operator` and consumes AuraCall's existing JSON API.
The current debug dashboard remains separate at `/ops/browser`. The app is
buildable with Vite and is packaged as `dist/operator-ux` static assets served
from the AuraCall API service at `/dashboard`.

State ownership:

- UI layout preferences live in browser local storage.
- Runtime truth comes from API endpoints.
- Route state should be URL-addressable where useful for handoff.
- Raw JSON remains available through inspectors, but primary screens must be
  human-oriented.

## Implementation Slices

1. Shell scaffold
   - add React/Vite app under `ux/operator`
   - add `pnpm ux:dev` and `pnpm ux:build`
   - implement top bar, nav stubs, collapsible/resizable panes, center
     viewport, right inspector, context menu, and local UI preference storage
   - keep all feature pages read-only placeholders
   - serve the built app from `/dashboard` on the stable AuraCall API port
     while preserving `/ops/browser` as the debug dashboard

2. API client and health readback
   - add typed client helpers for archive search, run status, and account
     mirror status
   - make `Health` a real read-only status surface using `/status`
   - make `Runs` a read-only recovery/local-claim/topology surface using
     `/status?recovery=true&sourceKind=all`
   - keep the debug dashboard linked but visually separate

3. Archive and chat browsing
   - implement `Chats` as a chat-dialog view over cached conversations and
     archive-linked provider conversations
   - implement `Search` over archive records through same-origin operator auth,
     then wire lexical/semantic search as those APIs mature
   - add artifact/file inspector and download links through stable archive
     asset routes

4. Runs and controls
   - implement run queue/status views and response-batch inspection
   - add explicit launch/retry/cancel controls only after the read-only views
     are stable and the control API contracts are clear

5. Configuration and orchestration authoring
   - implement agent/team/config/API-key pages or menu-launched panels
   - add workflow launch surfaces for vetted algorithms such as course grading
     or transcript enrichment only after the same operations are reliable from
     CLI/API/MCP

## Acceptance Criteria

- The new UX builds independently with `pnpm ux:build`.
- The first screen is the operator console shell, not a landing page.
- The top bar, nav, side panes, viewport, and inspector are present and usable
  on desktop and narrow widths.
- Pane collapse/resize state persists locally.
- The old dashboard is explicitly described as debug/proof-of-concept rather
  than treated as the product UX.
- `/dashboard` serves the React operator UX from the stable AuraCall API port.
- `/ops/browser` continues to serve the debug dashboard.
- `Health` reads the live `/status` payload and reports API, routing,
  live-follow, and runtime state without mutating jobs.
- `Runs` reads the live recovery status payload and reports runtime recovery,
  local-claim, and runner-topology posture without requiring a browser-stored
  API key.
- `Search` can query protected `/v1/archive` read-only routes from the
  same-origin operator dashboard without browser-entered bearer secrets.
- The shell does not perform provider browser work or mutate jobs.

## Definition Of Done For First Slice

- `ux/operator` contains a buildable React/Vite shell.
- `package.json` exposes `ux:dev` and `ux:build`.
- `package.json` includes `ux:build` in the normal package build so the
  installed user runtime includes `dist/operator-ux`.
- Roadmap and plan index reference this plan.
- Validation passes with `pnpm ux:build` and targeted repository checks.

## Current State

- Slice 1 is complete: the React shell exists, builds with Vite, and is served
  from `/dashboard` by the AuraCall API service.
- Slice 2 is partially complete: the Health page now polls `/status` every 30
  seconds and renders API service, route discovery, live-follow summary, runtime
  metadata, API-key posture/controls, and live-follow target rows as operator
  information. Live-follow rows now expose target filters and readable reason
  chips so unconfigured profile identity gaps are distinct from enabled-target
  attention. Selecting a live-follow account populates the right inspector with
  joined live-follow/account-mirror identity, guard, timing, count, completion,
  status, and catalog links without starting provider browser work. The Health
  surface has started moving from card-stack diagnostics toward a denser
  operator layout with a compact status strip, collapsed API-key administration,
  tighter table rows, and a denser right inspector. Health selection is now
  route-addressable with `?nav=health&provider=<provider>&runtime=<profile>` so
  operator links can open directly to a provider/runtime inspection state.
  Provider rows and inspectors use compact service badges for ChatGPT, Gemini,
  and Grok instead of plain provider text.
- Slice 4 is started in read-only form: the Runs page polls
  `/status?recovery=true&sourceKind=all` every 30 seconds and renders recovery
  counts, local-claim metrics, runner-topology metrics, and bounded run-id
  lists. Authenticated deep run listing/inspection can use same-origin operator
  auth from `/dashboard`; external clients remain bearer-protected.
- Slice 3 is started in read-only form: the Search page can browse all cached
  account-mirror conversations from all tenants in a compact, live-updating
  table, while preserving archive item inspection and compatibility handoff
  links. Search now uses a compact command bar and known-value facet chips
  instead of a bulky form with visible limit, provider text, and status text
  inputs. Search selection is route-addressable with
  `?nav=search&row=<base64url catalog row id>`, and legacy
  `?nav=search&archiveItem=<base64url archive item id>` links still open the
  archive-result inspector.
- Search is still not complete. The first server projection slice exposes
  `/v1/search` with normalized rows, cursor pages, facets, and merged
  account-mirror plus run-archive rows. Lexical ranking is currently simple
  substring matching, semantic ranking is not implemented, and the React table
  now appends server cursor pages on scroll and renders rows through a
  fixed-height virtual window so DOM row count stays bounded. The first row
  action slice is live: visible rows expose compact icon actions for inspect,
  copy handoff link, open provider URL, and download cached asset when the row
  has those links. Search table preferences now also persist hidden columns and
  non-pinned column order, with Time, Provider, and Tenant kept pinned and
  always visible. The first saved-view slice is local-only: operators can save,
  apply, and delete browser-local Search views that capture query, facets,
  sort, and table preferences.
- API-key inspection, issue, delete, and API-service restart controls exist on
  the Health page. These are narrow operator-administration controls; they do
  not launch provider work.
- The old browser dashboard remains available at `/ops/browser` for low-level
  probes.

Next implementation work should be selected from this plan deliberately, not by
turn-to-turn momentum. Prefer read-only observability and inspection work unless
the slice explicitly updates this plan and validates a narrow operator-control
contract. The next route-addressable candidate is Runs once the page has a
concrete run-list and run-inspection selection model.

## Target Search Workbench

The Search page should become the primary archive and account-mirror discovery
surface. It should feel closer to a dense mail/search client or database table
than a web form. The default view is "all chats from all eligible tenants,
newest first", with live updates as mirror/archive indexes change.

Primary operator goals:

- See the newest ChatGPT/Gemini/Grok conversations and AuraCall-generated
  artifacts across all configured tenants without choosing a provider first.
- Sort, filter, inspect, and hand off records without losing table position.
- Search exact text, semantic matches, filenames, provider ids, project names,
  agent/team ids, response ids, batch ids, and evidence metadata from one
  command bar.
- Open stable URLs for a selected chat, archive item, artifact, uploaded file,
  batch, run, or provider conversation.

Layout target:

```text
Search | command bar.................................................. [view]
        [All] [Chats] [Artifacts] [Uploads] [Runs] [Evidence]   live: on
        provider chips  tenant chips  project chips  date range  saved views
---------------------------------------------------------------------------
date/time        provider  tenant/account   project   title/summary   kind
agent/team       status    files/artifacts   run/batch ids            updated
---------------------------------------------------------------------------
infinite virtualized rows, newest first, live-updating
selected row keeps inspector open in the right pane
```

Workbench rules:

- The result table is the page. The toolbar must be one compact row plus an
  optional secondary facet row; no large filter cards.
- Default dataset is every cached conversation across every configured provider
  and bound identity, sorted by descending provider/update time.
- Results use infinite scroll or virtualized paging with stable row heights,
  not a small `limit` field. A page size can exist internally, but operators
  should not spend screen area on it.
- Columns are resizable, reorderable, hideable, and sortable. Column state
  persists locally and can be reset.
- The first columns are pinned: timestamp, provider, tenant/account, and title.
  Remaining columns can be operator-managed.
- The selected row is URL-addressable and drives the right inspector; clicking
  rows should not navigate away from the table.
- Live updates should add or update rows without stealing scroll position.
  When the operator is scrolled away from the top, show a small "new results"
  affordance instead of jumping.
- Provider, tenant/account, project, kind, status, agent/team, and artifact
  presence are facets with known values, not free-text input boxes.
- Facets should be represented by compact menus/chips with counts and clear
  buttons. Raw string entry remains available only in an advanced query mode.
- `Kind` must be backed by a single normalized enum shared with the archive and
  mirror catalog APIs. Values that do not map to the API must not be shown.
- Status must be normalized across archive records, response runs, batches,
  live-follow mirror records, and provider catalog rows before it appears as a
  filter.
- Provider filters use the provider icon badges. Tenant filters show bound
  identity and runtime profile, with account level where known.
- Search syntax should support plain text first, then optional field prefixes:
  `provider:chatgpt`, `tenant:soylei`, `project:"Transcripts"`,
  `kind:conversation`, `has:artifact`, `status:failed`, `after:2026-05-01`.
- Table rows expose quick actions by icon with hover hints: open inspector,
  copy handoff link, open provider URL when available, and download cached
  asset when available. Remaining kind-specific actions should add evidence
  attachment and run/artifact workflows where allowed.
- Column preferences should remain local operator UX state unless and until
  named saved views require server-side sharing.
- Saved views currently remain local operator UX state. Server-backed sharing
  needs explicit ownership, tenant visibility, and export/import semantics
  before it becomes an API contract.
- The right inspector should prioritize human-readable chat transcript,
  artifacts, files, run lineage, and evidence before raw JSON. Raw JSON remains
  collapsible.

Recommended column set:

- `time`: provider/update timestamp; default descending sort.
- `provider`: icon badge plus service.
- `tenant`: bound identity, runtime profile, account level.
- `project`: provider project/workspace when known.
- `title`: conversation title, file name, prompt summary, or artifact title.
- `kind`: normalized conversation, response, batch, upload, generated artifact,
  provider artifact, evidence, media, or run.
- `status`: normalized operational state.
- `agent/team`: configured agent/team ids when an AuraCall job created it.
- `files`: attachment/generated-artifact counts and cache materialization
  state.
- `ids`: compact run/response/batch/provider ids with copy affordances.
- `updated`: cache/index update timestamp for freshness diagnostics.

Data/API requirements:

- Add a unified `GET /v1/search` or equivalent aggregate read endpoint that can
  merge account-mirror conversations with run-archive records. The dashboard
  should not join several large endpoints client-side as the normal path.
  [first slice complete]
- The endpoint should return cursor-based pages ordered by `sort` plus a
  stable `nextCursor`; avoid offset-only paging for live-updating data.
- Return facet metadata for the current query: providers, tenants, projects,
  kinds, statuses, agents, teams, and artifact/file presence.
- Return normalized row objects with stable `id`, `kind`, `sortTime`,
  `provider`, `runtimeProfileId`, `boundIdentityKey`, `title`, `summary`,
  `status`, `counts`, `links`, and `sourceRefs`.
- Return enough link metadata for direct handoff URLs: selected row route,
  archive item route, mirror catalog item route, provider URL, asset routes,
  and run/batch/response inspection routes.
- Keep archive-only `/v1/archive` and account-mirror `/v1/account-mirrors/*`
  endpoints as lower-level APIs; Search should consume a purpose-built
  operator search projection.

Route-state target:

- `?nav=search&q=<query>&view=<saved-view>&row=<base64url row id>` for a
  selected row.
- Facets should be encoded as compact query params only when needed:
  `provider=chatgpt,gemini`, `tenant=<bound identity key>`,
  `kind=conversation,generated_artifact`, `status=failed`.
- Existing `archiveItem=<base64url archive item id>` remains supported as a
  compatibility alias and should resolve to the corresponding unified row.

Implementation roadmap:

1. Replace the bulky form with a compact command bar and facet chip row.
   - Remove the visible `Limit` field.
   - Replace provider/status free-text inputs with menu-backed facets.
   - Replace the broken `Kind` dropdown with normalized facet chips.

2. Build the virtualized result table.
   - Use fixed row heights, sticky headers, pinned first columns, keyboard row
     navigation, and accessible grid semantics.
   - Add local column width, order, hidden-column, and sort persistence.
   - Fixed-height row virtualization and local column width/sort persistence
     are complete. Time, Provider, and Tenant columns are pinned, and keyboard
     row navigation updates the selected-row URL/inspector state. Column
     order/hide controls remain open.

3. Add unified all-tenant chat rows. [first slice complete]
   - Start with account-mirror conversations from all configured live-follow
     accounts.
   - Default to descending provider/update time.
   - Preserve the existing right inspector and URL-selected row behavior.

4. Add live updates.
   - Poll initially, then move to server-sent events or a lightweight event
     feed when available.
   - Update visible rows in place and show a "new results" affordance when the
     operator is scrolled away from the top.

5. Add archive/artifact/run rows into the same table.
   - Merge generated artifacts, uploads, responses, batches, media, and
     evidence into the same row model.
   - Keep row actions and inspector panels kind-specific. The first generic
     action set now covers inspect, copy link, provider URL, and cached asset.

6. Add saved views and advanced search.
   - Persist operator-owned views such as "failed transcript jobs",
     "SoyLei ChatGPT artifacts", "newest Grok media", and "unmaterialized
     outputs".
   - Promote the current local hidden-column/order preference model into named
     presets only when shared saved views are implemented.
   - Local saved views now exist; the remaining work is shared/server-backed
     presets and advanced fielded or semantic search semantics.
   - Add fielded query syntax only after the facet model works.

Search page acceptance criteria:

- Opening `/dashboard?nav=search` immediately shows all cached conversations
  from all tenants, newest first, without submitting a form.
- The table can scroll through hundreds or thousands of rows without loading
  all DOM nodes.
- Sort order, column widths, and visible columns persist across reloads.
- Provider, tenant, kind, status, project, and artifact filters are selectable
  from known values and cannot silently send unsupported strings.
- Selecting a row updates the URL and right inspector without leaving the
  table.
- A direct Search URL restores query, facets, sort, column state where
  applicable, selected row, and inspector state.
- Live updates do not steal focus, change scroll position unexpectedly, or
  reorder the row under the pointer while the operator is interacting.
- Archive and account-mirror lower-level routes remain inspectable from the
  selected row.
