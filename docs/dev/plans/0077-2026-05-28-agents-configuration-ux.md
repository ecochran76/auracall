# Greenfield Agents Configuration UX Plan | 0077-2026-05-28

State: CLOSED
Lane: P01

## Purpose

Turn the first AuraCall product UX milestone into a bounded implementation
slice: a product-grade Agents configuration workflow in a new frontend.

This plan applies
[docs/dev/aura-call-ux-specification-guide.md](../aura-call-ux-specification-guide.md)
to agent authoring now that Plan 0076 closed tenant/binding/project choice
readback. The goal is to make agent configuration usable by operators and
downstream app builders without requiring raw JSON editing or provider-account
internals.

The existing frontend is not the starting point. It is unusable for this
product direction and should be retired after the replacement has enough
coverage. Do not extend or cosmetically repair the existing frontend as part of
this plan.

## Current State

- Existing frontend surfaces include `/dashboard`, `/agents`, `/config`, and
  `/ops/browser`. Treat them as legacy/diagnostic surfaces, not as product
  foundations.
- `/agents` has a bounded agent configuration editor backed by existing config
  entity APIs, but that page is not the durable product workflow and should not
  be modified for this plan.
- `GET /v1/config/agent-choices` exposes the cache-first choices needed by the
  replacement UI: services, provider accounts, execution bindings, semantic
  model selectors, provider model ids, extras, project bindings, effective
  agents, and validation.
- Existing agent writes go through `GET /v1/config/agents`,
  `PUT /v1/config/agents/{id}`, and `DELETE /v1/config/agents/{id}`.
- The UX standard requires structured controls, list/detail surfaces,
  inspectors for raw detail, visible validation, accessible controls, and a
  clear diagnostics boundary.
- Plan 0077 is implemented as a new `ux/console` React/Vite app served from
  `/console`. The legacy frontend pages were not extended for the product
  workflow.

## Scope

Build the first durable configuration workflow for Agents in a new product
frontend:

- create a greenfield frontend surface separate from the existing pages
- prefer a new app root such as `ux/console` and a distinct route such as
  `/console` until a later cutover retires or redirects the old frontend
- use a list/detail layout with searchable agent list on the left and the
  editable agent form in the main work surface
- use structured controls for service, provider account, browser binding,
  model selector, extras, and project binding
- show validation and readiness before save, including missing provider
  account, missing browser binding, missing project, disabled/archived agent,
  and unknown selector states
- support create, edit, save, duplicate, archive/disable, and validate flows
  through the existing config APIs
- keep raw `tenantKey`, `bindingKey`, `runtimeProfile`, provider project ids,
  and JSON payloads behind an Advanced inspector
- keep route state URL-addressable enough for handoff:
  `?view=agents&agent=<agent_id>` or an equivalent route in the new app
- preserve compatibility with existing `runtimeProfile`-based agents while
  using tenant/binding language in the primary UI
- reuse stable backend APIs and shared types where appropriate, but do not
  reuse the existing frontend page/component structure as the base

## Non-Goals

- Do not change the existing frontend pages in this slice.
- Do not extend, restyle, or refactor `/dashboard`, `/agents`, `/config`, or
  `/ops/browser`.
- Do not replace every legacy surface in this slice; this plan creates the
  first replacement workflow and defines the retirement path.
- Do not add provider browser refresh, project creation, login, or live
  capability scraping from the Agents page.
- Do not remove `runtimeProfile`, `projectId`, or compatibility fields from
  existing configs.
- Do not add broader run launch, response-batch launch, or workflow execution
  controls from the Agents page.
- Do not introduce a new agent registry backend or new config write API unless
  a narrow missing contract is found and documented in this plan first.
- Do not make API keys, Teams, Providers, or Projects full product workflows in
  this plan; link to their diagnostics or placeholders as needed.

## Retirement Boundary

- Existing frontend surfaces are frozen for product work.
- Bug fixes to existing pages are allowed only when they unblock current
  operators and must not become design precedent.
- The new frontend may link to legacy diagnostics, but it should not embed
  legacy pages or inherit their layout/components.
- Retirement should be explicit in a later cutover slice after the new console
  covers the relevant workflow and has validation evidence.

## UX Contract

Primary labels should use operator language:

- Agent
- Provider account
- Browser binding
- Model selector
- Project
- Ready
- Needs setup
- Disabled
- Show technical details

Technical fields may appear only in inspectors, tooltips, or advanced
copyable-id rows:

- `tenantKey`
- `bindingKey`
- `runtimeProfile`
- provider project ids
- raw config JSON

The first viewport should show:

- page title and one-sentence scope
- freshness timestamp for choices/validation
- primary action to create an agent
- compact status strip for total agents, ready agents, needs-setup agents, and
  disabled/archived agents
- searchable list of agents with status chips
- selected-agent editor or an empty state with next action

## Implementation Slices

### Slice 1 | Readable Agents Workbench

Status: complete.

- Scaffold the new frontend surface and add an Agents route/page there.
- Fetch effective agents and choices through existing same-origin API calls.
- Render compact status, searchable list, selected-agent summary, validation
  warnings, and advanced technical detail without adding new writes.
- Make selected agent route-addressable.
- Leave the existing `/agents` page unchanged and available only as a
  compatibility/debug surface during the transition.

Implemented evidence:

- Added `ux/console` with an independent Vite config, build output under
  `dist/console-ux`, and `/console` as the greenfield route.
- Added `/console?view=agents&agent=<agent_id>` route-state support.
- Added same-origin console API authorization by treating `/console` as an
  operator UI referer without changing the legacy pages.
- Added read-only rendering for choices, effective agents, status metrics,
  agent search, selected-agent summary, validation, and advanced technical
  detail.

### Slice 2 | Structured Editor

Status: complete.

- Add create/edit form state using structured controls backed by
  `agent-choices`.
- Map existing compatibility fields into operator-first fields.
- Preserve unsaved edits during validation failures.
- Show top error summary and field-level errors before save.
- Keep raw JSON as a collapsed advanced editor or inspector escape hatch.

Implemented evidence:

- The Agents form uses structured controls for service, provider account,
  browser binding, model selector, exact model, project binding, and extras
  from `GET /v1/config/agent-choices`.
- Primary UI uses operator terms while advanced details keep `tenantKey`,
  `bindingKey`, `runtimeProfile`, config path, registry path, and raw draft JSON
  behind disclosure.
- Unsaved draft state is local until save, and validation failures stay visible
  in the editor and inspector.

### Slice 3 | Mutations And Feedback

Status: complete.

- Wire save, duplicate, archive/disable, and validate actions through the
  existing config entity APIs.
- Refresh choices, effective agents, and validation after mutations.
- Add toast feedback for successful writes and inline persistent notices for
  unresolved setup issues.
- Keep failure output actionable without dumping raw response payloads into the
  primary page.

Implemented evidence:

- Save uses `PUT /v1/config/agents/{id}`.
- Archive uses `DELETE /v1/config/agents/{id}`.
- Duplicate creates a local draft from the selected agent and saves only when
  the operator confirms.
- Validate refreshes choices and agent readback.
- Success and error feedback appear as compact notices, not raw payload dumps.

### Slice 4 | UX Gate And Handoff

Status: complete.

- Verify keyboard navigation, focus states, labels, icon accessible names,
  reduced-motion behavior, and 375px responsive layout.
- Verify table/list row heights and controls do not shift layout.
- Verify raw JSON, ids, and diagnostics remain behind Advanced/Diagnostics
  disclosure.
- Update README or operator docs only if the user-facing workflow changes
  beyond the new console route.
- Close this plan only after the durable greenfield workflow is the recommended
  Agents configuration surface and the legacy surface has an explicit
  retirement/cutover note.

Implemented evidence:

- `pnpm run build` packages both legacy `operator-ux` and greenfield
  `console-ux` assets.
- Targeted HTTP tests prove `/console` is served separately from `/dashboard`
  and appears in status route discovery.
- Browser render verification on `http://127.0.0.1:18111/console?view=agents`
  passed at `1440x1000` and `375x900` with no horizontal overflow, no console
  errors, raw draft details hidden by default, and the Agents workflow visible.
- The UX guide, roadmap, Plan 0067, fixes log, and runbook state that the
  existing frontend is legacy/diagnostic only and should be retired through
  explicit cutover slices.

## Acceptance Criteria

- A new frontend surface exposes an Agents workflow that follows the UX guide's
  page structure: header, status strip, command bar, work surface, inspector,
  and feedback layer.
- The implementation does not modify existing frontend pages or use them as the
  design baseline.
- Operators can create, edit, duplicate, archive/disable, and validate agents
  without editing JSON for normal fields.
- Service, provider account, browser binding, model selector, extras, and
  project choices come from AuraCall readback rather than hard-coded UI lists.
- Validation clearly explains missing account, missing binding, missing
  project, disabled/archived, and unknown selector states.
- Existing `runtimeProfile`-based agents continue to load and save without
  changing runtime behavior.
- Raw ids and JSON remain available for power debugging but are not the default
  workflow.
- The page works at 375px width without horizontal page scroll and remains
  usable with keyboard navigation and 200% zoom.
- The existing debug/compatibility surfaces remain available but are frozen and
  clearly not the product UX.

## Validation

Validation run:

- `pnpm run build`
- `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "greenfield console|dashboard alias|status reports local and external service discovery|configured route paths|agent tenant|configures AuraCall agents"`
- browser render verification with Puppeteer/Chrome against
  `http://127.0.0.1:18111/console?view=agents`
- `pnpm run plans:audit -- --keep 77`
- `git diff --check`

## Definition Of Done

- Plan 0077 is wired into `ROADMAP.md` and `RUNBOOK.md`.
- The Agents workflow is implemented in the new frontend and documented as the
  first config-UX replacement milestone.
- Existing frontend pages remain unchanged by this plan except for explicit
  retirement/cutover notes in governing docs.
- Existing config API compatibility is preserved.
- Relevant automated validation passes.
- The plan is updated with implemented evidence and closed.
