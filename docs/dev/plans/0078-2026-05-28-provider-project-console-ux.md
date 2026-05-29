# Provider And Project Console UX Plan | 0078-2026-05-28

State: CLOSED
Lane: P01

## Purpose

Build the next greenfield AuraCall product-console workflow after Plan 0077:
provider-account readiness and project/default binding management in
`/console`.

This plan extends the new console direction without touching the retired
frontend pages. Operators should be able to understand which provider accounts
are usable, which browser bindings back them, which project/workspace defaults
are available, and what setup is still required before downstream apps select
agents.

## Current State

- Plan 0077 is closed and delivered `ux/console` at `/console` with the first
  Agents workflow.
- Existing frontend pages such as `/dashboard`, `/agents`, `/config`, and
  `/ops/browser` are legacy or diagnostic surfaces. They are not a design
  baseline for this plan and should not be changed.
- `GET /v1/config/agent-choices` already exposes services, provider accounts,
  execution bindings, semantic model selectors, extras, project bindings,
  effective agents, and validation for the Agents workflow.
- Provider account, browser binding, and project information exists across
  AuraCall runtime config, account-mirror status/readback, provider adapters,
  and diagnostics, but the product console does not yet provide a dedicated
  operator workflow for setup readiness.
- The UX guide requires progressive provider setup, plain-language labels,
  structured controls, inspectors for raw ids, and a hard boundary between
  product workflows and diagnostics.
- Plan 0078 is implemented in `ux/console`: `/console?view=providers` and
  `/console?view=projects` render readback-first inventories derived from
  existing agent choices and validation without changing the legacy frontend.

## Scope

Create Providers and Projects workflows inside the greenfield console:

- add `/console?view=providers` and `/console?view=projects`, or equivalent
  URL-addressable console routes
- add Providers and Projects entries to the console navigation without
  changing legacy routes
- show provider-account readiness by service and account identity using
  operator language: Provider account, Browser binding, Ready, Needs setup,
  Disabled, Attention needed
- show browser-binding health and provenance clearly enough for setup review
  while keeping raw `runtimeProfile`, `tenantKey`, `bindingKey`, profile paths,
  and provider ids behind technical-detail disclosure
- show project/default binding inventory for configured provider accounts,
  including missing default project, unknown project, disabled project, and
  provider-specific workspace/Gem/project labels where available
- provide read-only health refresh or validation actions that reuse existing
  safe readback APIs first
- make Agents workflow links useful: an agent with missing account, binding, or
  project should link to the relevant Provider or Project view with enough
  route state to locate the issue
- document any missing backend contract before adding write APIs

## Non-Goals

- Do not change, extend, restyle, or refactor `/dashboard`, `/agents`,
  `/config`, or `/ops/browser`.
- Do not add login automation, CAPTCHA handling, cookie import, or browser
  account repair in this plan.
- Do not create provider projects, Gems, Grok projects, or ChatGPT projects
  from the console unless a later plan explicitly adds that mutation contract.
- Do not change provider adapter navigation, account-mirror collector behavior,
  or live-follow scheduling semantics.
- Do not replace the Agents editor from Plan 0077; only add cross-links and
  readiness context needed by Providers/Projects.
- Do not expose raw config JSON, profile paths, low-level browser processes, or
  route templates as primary page content.
- Do not remove compatibility fields such as `runtimeProfile`, `projectId`, or
  provider-specific ids from existing configs.

## UX Contract

Primary labels should use operator terms:

- Provider account
- Browser binding
- Project
- Default project
- Ready
- Needs setup
- Attention needed
- Refresh health
- Show technical details

Technical values may appear only in inspectors, tooltips, copyable-id rows, or
Diagnostics links:

- `tenantKey`
- `bindingKey`
- `runtimeProfile`
- provider project ids
- managed browser profile paths
- raw status/config payloads

Each Providers/Projects page should follow the product template:

- page header with title, one-sentence scope, freshness timestamp, and primary
  refresh/validate action
- status strip with connected accounts, needs-setup accounts, ready projects,
  and missing/default-project warnings
- command bar with search, service filter, readiness filter, and refresh
- dense list/table work surface with stable row height and selected row state
- inspector for selected account or project with validation, linked agents,
  next action, and raw ids behind disclosure
- toast or inline feedback for refresh and validation results

## Implementation Slices

### Slice 1 | Provider Readiness Inventory

Status: complete.

- Add the Providers console route and navigation entry.
- Reuse existing choices/status readback to list provider accounts by service,
  account label, readiness, browser binding, and linked agents.
- Add search and filters for service and readiness.
- Add selected-provider inspector with validation summary, linked Agents, and
  technical details hidden by default.
- Keep this slice read-only unless an existing refresh endpoint is already safe
  and documented.

Implemented evidence:

- `/console?view=providers` is URL-addressable and selectable from the console
  navigation.
- Provider rows are derived from `GET /v1/config/agent-choices`, grouping
  provider accounts, browser bindings, readiness, and linked agents by service.
- Search, readiness filter, compact metrics, selected row state, and inspector
  validation are implemented without adding provider mutations.

### Slice 2 | Project Binding Inventory

Status: complete.

- Add the Projects console route and navigation entry.
- Show project/workspace/default binding choices by provider account and
  service.
- Identify agents whose default project binding is missing, unknown, disabled,
  or unresolved.
- Add links from project rows to affected agents and from agent validation
  notices back to Projects.
- Keep provider-specific names visible only where they help the operator
  distinguish real choices.

Implemented evidence:

- `/console?view=projects` is URL-addressable and selectable from the console
  navigation.
- Project rows show explicit project/default bindings plus missing-project
  agent rows, readiness, linked agents, service, and provider account context.
- Linked-agent buttons move the console back to `view=agents` with the selected
  agent in route state.

### Slice 3 | Health Refresh And Validation

Status: complete.

- Add bounded refresh/validate controls that reuse existing read-only APIs
  before adding any new contract.
- If existing readback is insufficient, document the exact missing response
  shape in this plan before implementing a narrow endpoint.
- Show persistent setup warnings inline and reserve toasts for completed
  refresh/validation actions.
- Preserve route state through refreshes and validation failures.

Implemented evidence:

- `Refresh health` reuses the same read-only agent choices/config refresh used
  by the Agents workflow.
- No new backend write contract or provider automation contract was added.
- Route state stays on Providers/Projects during refresh; the earlier
  auto-select-agent regression was fixed so loading choices no longer forces
  non-Agent views back to Agents.

### Slice 4 | UX Gate And Handoff

Status: complete.

- Verify desktop and 375px mobile layouts without horizontal page scroll.
- Verify keyboard navigation, focus order, accessible names for icon actions,
  color-independent readiness states, and reduced-motion behavior.
- Verify technical details remain hidden by default.
- Add or update HTTP/browser tests for the new console routes and any new
  backend readback contract.
- Update the roadmap, runbook, dev journal, and fixes log with implemented
  evidence before closing this plan.

Implemented evidence:

- Added an HTTP route regression for `/console?view=providers` and
  `/console?view=projects`.
- `agent-browser` render checks passed for Providers and Projects at desktop
  and 375px mobile widths, with no page-level horizontal overflow and raw row
  technical details hidden by default.
- Screenshots captured:
  - `/tmp/auracall-console-providers-desktop.png`
  - `/tmp/auracall-console-projects-desktop.png`
  - `/tmp/auracall-console-providers-mobile.png`
  - `/tmp/auracall-console-projects-mobile.png`

## Acceptance Criteria

- Providers and Projects are available in the greenfield `/console` surface and
  URL-addressable.
- Existing frontend pages remain untouched and frozen for product work.
- Operators can see provider-account readiness, browser-binding health, project
  defaults, and linked agent setup issues without reading raw JSON.
- Agents with missing account, binding, or project setup link to the relevant
  Providers/Projects context.
- Raw ids and technical payloads stay behind inspectors or Diagnostics links.
- Any new backend contract is narrow, readback-first, documented in this plan,
  and covered by targeted tests.
- The new pages work at 375px width without horizontal page scroll and remain
  usable by keyboard.

## Validation

Validation run:

- `pnpm run console:build`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "greenfield console|agent tenant"`
- `agent-browser` render verification against `/console?view=providers` and
  `/console?view=projects` at desktop and 375px mobile widths:
  - Providers desktop: `scrollWidth=1425`, `clientWidth=1425`, rows `18`,
    raw row details hidden by default
  - Providers mobile: `scrollWidth=360`, `clientWidth=360`, rows `18`, raw
    row details hidden by default
  - Projects desktop: `scrollWidth=1425`, `clientWidth=1425`, rows `38`, raw
    row details hidden by default
  - Projects mobile: `scrollWidth=360`, `clientWidth=360`, rows `38`, raw row
    details hidden by default
- `agent-browser` linked-agent click verification from Providers to
  `/console?view=agents&agent=auracall-chatgpt-finisher`
- `pnpm run plans:audit -- --keep 78`
- `git diff --check`

## Definition Of Done

- Plan 0078 is wired into `ROADMAP.md` and `RUNBOOK.md`.
- Providers and Projects workflows are implemented in `ux/console` without
  changing the legacy frontend pages.
- Provider-account and project-binding readiness is visible in operator
  language with technical details hidden by default.
- Relevant automated and browser validation passes.
- The plan is updated with implemented evidence and closed.
