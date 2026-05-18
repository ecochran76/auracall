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
  tighter table rows, and a denser right inspector.
- Slice 4 is started in read-only form: the Runs page polls
  `/status?recovery=true&sourceKind=all` every 30 seconds and renders recovery
  counts, local-claim metrics, runner-topology metrics, and bounded run-id
  lists. Authenticated deep run listing/inspection can use same-origin operator
  auth from `/dashboard`; external clients remain bearer-protected.
- Slice 3 is started in read-only form: the Search page can query
  `/v1/archive`, fetch item detail, preview/download archive assets, and browse
  cached conversations through the `Chats` page without browser-entered API
  keys.
- API-key inspection, issue, delete, and API-service restart controls exist on
  the Health page. These are narrow operator-administration controls; they do
  not launch provider work.
- The old browser dashboard remains available at `/ops/browser` for low-level
  probes.

Next implementation work should be selected from this plan deliberately, not by
turn-to-turn momentum. Prefer read-only observability and inspection work unless
the slice explicitly updates this plan and validates a narrow operator-control
contract.
