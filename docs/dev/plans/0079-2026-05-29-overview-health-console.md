# Overview And Health Console Plan | 0079-2026-05-29

State: CLOSED
Lane: P01

## Purpose

Complete the next greenfield AuraCall product-console milestone after Plans
0077 and 0078: an Overview and Health command center in `/console`.

The page should answer the operator's first question: what is healthy, what
needs attention, and where should I go next? It must use plain-language status
and link into the existing console workflows without exposing raw status JSON
as the first viewport.

## Current State

- Plan 0077 is closed and delivered the greenfield Agents workflow in
  `ux/console`.
- Plan 0078 is closed and delivered Providers and Projects workflows in
  `ux/console`.
- The legacy `/dashboard`, `/agents`, `/config`, and `/ops/browser` pages remain
  frozen as legacy/diagnostic surfaces.
- `/status` already exposes local service posture, live-follow severity,
  background drain state, runner topology, account-mirror scheduler state,
  route discovery, and public/local service URLs.
- `GET /v1/config/agent-choices` and `GET /v1/config/agents` already expose
  provider account, project, and agent readiness without requiring browser
  work.
- No durable Overview page exists in `/console`; `Overview` appears in nav but
  has not been implemented as a product workflow.
- Plan 0079 is implemented in `ux/console`: `/console` now defaults to
  Overview and `/console?view=overview` renders a readback-first command
  center from existing status, agent-choice, and agent readback APIs.

## Scope

- Add `/console?view=overview` as the default greenfield console route.
- Fetch `/status` alongside existing agent choices and agent readback.
- Summarize service reachability, provider account health, agent readiness,
  live-follow posture, scheduler/backpressure, background drain, and runner
  topology in the first viewport.
- Present an attention queue that links to Agents, Providers, Projects, Runs,
  Search, or Diagnostics depending on the issue.
- Show recent/system context from status readback without dumping raw payloads.
- Keep raw route templates, ids, runner internals, and full status JSON behind
  technical-detail disclosure or Diagnostics links.
- Preserve the existing Agents, Providers, and Projects workflows.

## Non-Goals

- Do not change or extend the legacy frontend pages.
- Do not add new browser automation, provider login, provider repair, or
  project mutation flows.
- Do not add a new backend status endpoint unless existing readback is
  insufficient for a clearly documented requirement.
- Do not add broader Runs, Search, API Access, or Diagnostics product workflows
  beyond links and compact readiness cards.
- Do not make `/status` raw JSON the primary product experience.

## UX Contract

Primary labels should use operator language:

- Service
- Provider accounts
- Agents
- Live follow
- Background work
- Attention needed
- Ready
- Waiting
- Open Agents
- Open Providers
- Open Projects
- Open Diagnostics

Technical values may appear only in inspectors or technical-detail disclosure:

- raw route templates
- runner ids
- tenant keys
- binding keys
- runtime profile ids
- raw status JSON

## Implementation Slices

### Slice 1 | Overview Route And Readback

Status: complete.

- Add `overview` to console route parsing and navigation.
- Load `/status` with existing choices/agents readback.
- Keep `/console` defaulting to Overview.

Implemented evidence:

- `overview` is part of console route parsing and top navigation.
- `/console` without a view now defaults to Overview.
- Console refresh loads `/status`, `/v1/config/agent-choices`, and
  `/v1/config/agents` together.

### Slice 2 | Health Summary

Status: complete.

- Add first-viewport health metrics for service, agents, provider accounts,
  live follow, and background work.
- Derive tones from existing readiness and status fields.
- Avoid raw JSON in primary cards.

Implemented evidence:

- Overview status strip reports service reachability, ready agents, ready
  provider accounts, and attention count.
- Health snapshot cards summarize Agents, Provider accounts, Projects, and
  Live follow with tones derived from existing validation/readiness/status.
- Background work and runner state are summarized in the inspector rather than
  exposed as raw JSON.

### Slice 3 | Attention Queue And Next Actions

Status: complete.

- Add a compact attention queue from invalid agents, provider/project setup
  rows, live-follow attention targets, service auth state, and scheduler
  backpressure.
- Link each action to the relevant console view or legacy Diagnostics boundary.

Implemented evidence:

- Attention rows are derived from invalid agents, non-ready provider rows,
  non-ready project rows, live-follow attention targets, and scheduler
  backpressure.
- Agent, Provider, and Project issues link back into existing console
  workflows; live-follow and low-level service issues link to Diagnostics.

### Slice 4 | Validation And Handoff

Status: complete.

- Add route tests for `/console` and `/console?view=overview`.
- Verify desktop and mobile rendering with raw details hidden by default.
- Update `ROADMAP.md`, `RUNBOOK.md`, `docs/dev/dev-journal.md`, and
  `docs/dev-fixes-log.md`.
- Close this plan only after the Overview is implemented and validated.

Implemented evidence:

- HTTP route tests cover `/console`, `/console?view=overview`,
  `/console?view=providers`, and `/console?view=projects`.
- Automated and browser validation is recorded below.
- Roadmap, runbook, dev journal, and fixes log were updated in the same slice.

## Acceptance Criteria

- `/console` and `/console?view=overview` render the Overview workflow.
- Overview is the active nav item by default.
- The first viewport summarizes service, provider, agent, live-follow, and
  background-work health in operator language.
- The page shows a prioritized attention queue with links to existing console
  workflows or Diagnostics.
- Raw status payloads and technical route/id details are hidden by default.
- The implementation does not modify legacy frontend pages.
- The page works at 375px width without horizontal page scroll.
- Existing Agents, Providers, and Projects routes continue to work.

## Validation

Validation run:

- `pnpm run console:build`
- `pnpm run typecheck`
- focused HTTP route tests for greenfield console routes
- browser render checks for `/console?view=overview` at desktop and 375px
  mobile widths
- `pnpm run build`
- `pnpm run install:user-runtime-service`
- installed local and external route checks for `/console?view=overview`
- `pnpm run plans:audit -- --keep 79`
- `git diff --check`

Evidence:

- `pnpm run console:build`
- `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "greenfield console"`
- `pnpm run typecheck`
- `pnpm run plans:audit -- --keep 79`
- `git diff --check`
- `agent-browser` desktop render at `/console?view=overview`:
  `h1=Overview`, active nav `Overview`, Next Actions/Health Snapshot/Service
  Readback visible, raw technical details hidden, `scrollWidth=1265`,
  `clientWidth=1265`, screenshot
  `/tmp/auracall-console-overview-desktop.png`
- `agent-browser` mobile render at 375px:
  `h1=Overview`, active nav `Overview`, Next Actions/Health Snapshot/Service
  Readback visible, raw technical details hidden, `scrollWidth=360`,
  `clientWidth=360`, screenshot
  `/tmp/auracall-console-overview-mobile.png`
- `agent-browser` default route check: `/console` renders `h1=Overview` with
  active nav `Overview`.
- `agent-browser errors --clear` reported no browser console errors.
- `pnpm run build`
- `pnpm run install:user-runtime-service`
- installed local route check:
  `http://127.0.0.1:18095/console?view=overview` serves
  `/console/assets/index-DrQ2dWNk.js`
- external route check:
  `https://auracall.ecochran.dyndns.org/console?view=overview` redirects to
  Authelia with the Overview route preserved.

## Definition Of Done

- Plan 0079 is wired into `ROADMAP.md` and `RUNBOOK.md`.
- Overview/Health is implemented in `ux/console` without changing legacy pages.
- Health summary and attention queue are derived from existing readback.
- Relevant automated and browser validation passes.
- The plan is updated with implemented evidence and closed.
