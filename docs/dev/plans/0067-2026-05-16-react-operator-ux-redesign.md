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

- The existing HTML dashboard remains the debug/proof surface at the current
  operator routes.
- JSON API, CLI, and MCP surfaces now expose durable run status, account mirror
  status, archive search, archive item readback, asset download, asset lookup,
  and evidence attachment.
- Buffer CLI has a usable React/Vite operator-shell precedent: sticky top bar,
  dense operator tables, persistent local UI preferences, toast feedback, and
  collapsible/resizable side panes.

Remaining:

- Build a separate React/Vite AuraCall operator app instead of extending the
  existing inline HTML dashboard.
- Define the shell layout, route taxonomy, state ownership, and API client
  boundary before moving feature pages into it.
- Add real page implementations incrementally after the shell is stable.
- Decide when `/dashboard` should route to the new app and where the debug
  dashboard remains mounted.

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
The current debug dashboard remains separate. The app should be buildable with
Vite and eventually serve as static assets from the AuraCall API service.

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

2. API client and health readback
   - add typed client helpers for `/status`, archive search, run status, and
     account mirror status
   - make `Health` a real read-only status surface
   - keep the debug dashboard linked but visually separate

3. Archive and chat browsing
   - implement `Chats` as a chat-dialog view over cached conversations and
     archive-linked provider conversations
   - implement `Search` over archive records first, then wire lexical/semantic
     search as those APIs mature
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
- The shell does not perform provider browser work or mutate jobs.

## Definition Of Done For First Slice

- `ux/operator` contains a buildable React/Vite shell.
- `package.json` exposes `ux:dev` and `ux:build`.
- Roadmap and plan index reference this plan.
- Validation passes with `pnpm ux:build` and targeted repository checks.
