# AuraCall UX Specification Guide

Status: reference
Audience: AuraCall frontend implementers and reviewers
Applies to: the greenfield AuraCall product console, future config surfaces,
and any replacement for the inline HTML operator pages

## Purpose

AuraCall needs a product-grade operator interface. The frontend should help an
operator configure provider accounts, agents, projects, API access, searches,
runs, and diagnostics without reading raw service internals first.

This guide defines the UX standard for that work. Use it when designing,
implementing, or reviewing AuraCall UI changes.

## Product Standard

AuraCall is an operator console for AI service orchestration. It should feel
precise, modern, calm, and capable. It should not feel like a debug dump.

The interface must:

- lead with the task the operator came to do
- show status in plain language before technical detail
- hide raw JSON, route templates, internal ids, and logs behind inspectors
- use modern controls: tabs, segmented controls, searchable selects, drawers,
  command bars, validation summaries, toasts, and keyboard-friendly tables
- use motion to explain state changes, not to decorate the page
- keep `/ops/browser` and equivalent low-level pages available as diagnostics,
  not as the primary product UX

The main failure mode to avoid is a page full of large read-only panels that
show cryptic facts without telling the operator what to do next.

## Operator Personas

Design for these users, in this order:

1. **App builder**
   - Wants to create agents that downstream apps can select.
   - Needs valid service, account, model, project, and capability choices.
   - Does not want to understand browser profile internals.

2. **Service operator**
   - Wants to know whether providers are connected and jobs are healthy.
   - Needs attention queues, failed runs, and clear remediation actions.
   - Needs raw evidence only after a specific issue is selected.

3. **Power debugger**
   - Needs logs, raw JSON, route templates, browser processes, and provider
     state.
   - Should use diagnostic drawers or dedicated diagnostic pages.
   - Should never force every operator to scan debug detail by default.

## Information Architecture

Top-level navigation should be task-oriented:

- **Overview**
  - service status, provider account health, active warnings, and recent work
- **Agents**
  - create, edit, duplicate, archive, and validate named agents
- **Providers**
  - service accounts, tenants, browser bindings, auth state, and capability
    availability
- **Projects**
  - provider projects/workspaces/Gems/Grok projects and default bindings
- **Runs**
  - active work, run history, retries, cancellations, and queue posture
- **Search**
  - cached conversations, artifacts, files, evidence, and provider history
- **API Access**
  - API keys, scopes, reachable agents/teams, and secret rotation
- **Diagnostics**
  - logs, raw routes, raw payloads, browser processes, low-level probes, and
    legacy debug links

Do not organize the primary UI around backend nouns such as registry records,
runtime run objects, route templates, or internal payload types. Those objects
can appear in inspectors after the operator selects a task or record.

## Page Template

Every product page should use the same structure:

1. **Page header**
   - title, one-sentence scope, freshness timestamp, and primary action

2. **Status strip**
   - compact, high-signal state such as connected, needs setup, running,
     paused, failed, or no data

3. **Command bar**
   - search, filters, view controls, and bulk actions

4. **Work surface**
   - list/detail, table/detail, wizard, or focused form

5. **Inspector**
   - selected record summary, linked actions, validation, history, and raw
     detail behind disclosure controls

6. **Feedback layer**
   - toasts for completed actions, inline validation for forms, and an error
     summary for submit failures

Avoid page-level grids of unrelated cards. Use cards only when each card is a
clickable object, repeated item, modal, or focused tool.

## Configuration UX

Configuration pages must be rebuilt as workflows, not panels.

### Overview

Show:

- provider accounts connected
- agents valid
- project defaults configured
- API access configured
- warnings that need action

Do not show:

- raw `/status` payloads
- long route templates
- browser process lists
- unselected logs

### Agent Editor

Use a list/detail layout.

Left side:

- searchable agent list
- status chips: valid, missing account, missing project, disabled
- service/account/project summary

Right side:

- identity: name, description, role
- provider: service, tenant, execution binding
- behavior: model selector, extras, instructions
- project: default binding and override policy
- validation: clear warnings and fixes
- advanced: collapsed JSON and raw ids

Primary actions:

- create agent
- save changes
- duplicate
- archive
- validate

Do not require JSON editing for normal agent work. JSON is an advanced escape
hatch.

### Provider Account Setup

Use progressive setup:

1. choose provider
2. select or create tenant account
3. bind to an AuraCall runtime/browser execution profile
4. confirm capabilities and model selectors
5. test read-only health

Use plain labels:

- "Provider account" instead of "tenant" in primary copy
- "Browser binding" instead of "runtimeProfile" in primary copy
- "Advanced id" for raw `tenantKey`, `bindingKey`, and provider ids

Technical names can appear in tooltips, inspectors, and API reference links.

### Project Binding

Project binding must answer four questions:

- Which provider account owns this project?
- Is the agent using an inherited default or its own project?
- Can this run override the project?
- Is the selected project still available in the provider cache?

Use status labels:

- Agent default
- Provider account default
- Override available
- Missing project
- No project configured

Do not make downstream app users copy provider project ids unless they choose
an explicit override.

## Interaction Patterns

### Forms

Use structured controls whenever the value has known choices:

- searchable select for provider account, browser binding, model selector, and
  project
- segmented control for small mutually exclusive modes
- checkbox or switch for binary settings
- textarea only for long instructions or notes
- JSON editor only in an Advanced section

Submit validation should:

- keep the operator's input
- show a top error summary
- link each error to the field
- show the same message next to the field
- explain how to fix the value

Do not validate every keystroke unless the field is a simple local format
check.

### Tables

Use dense, readable tables for large lists.

Required behavior:

- sticky header when the table scrolls
- stable row height
- selectable row with detail inspector
- column visibility controls when there are more than eight useful columns
- pinned columns for identity and status
- compact row actions with icons and accessible names
- empty, loading, error, and filtered-empty states

Do not wrap long ids in primary cells. Truncate with copy controls and show the
full value in the inspector.

### Drawers And Inspectors

Use inspectors for detail that should not dominate the page:

- raw JSON
- event timelines
- route templates
- logs
- raw provider ids
- low-level browser/process data

Inspectors should open from a selected object and preserve the user's table or
list position.

### Notifications

Use toasts for completed actions and inline notices for persistent state.

Good toast examples:

- "Agent saved."
- "API key created. Copy the secret now."
- "Project cache refreshed."

Bad toast examples:

- "Mutation target registry."
- "Operation succeeded with result object."
- "Status: ok."

## Visual Design

Use a calm, dense product UI.

Baseline:

- light neutral surface
- one restrained accent color
- four-level text contrast: primary, secondary, muted, faint
- 4px spacing grid
- 6px to 8px radius for routine controls
- tabular numbers for metrics
- monospace only for ids, commands, paths, and code
- borders and subtle surface tint before heavy shadows

Avoid:

- oversized cards for every metric
- large rounded panels with little content
- decorative gradients, glowing borders, and large empty hero areas
- purple-blue gradient dominance
- status colors used as decoration
- stacked panels inside panels

Use icons where they improve scanning:

- copy
- open
- refresh
- save
- archive
- warning
- connected/disconnected
- expand/collapse

Each icon-only button needs an accessible name and a hover title.

## Motion

Motion should make state changes easier to follow.

Use:

- 120ms to 180ms transitions for hover/focus
- 180ms to 240ms for drawers, collapses, and route transitions
- ease-out for entering content
- ease-in for leaving content
- skeletons or shimmer only for data that normally loads quickly

Avoid:

- looping decorative animation
- animated charts unless the motion communicates data change
- transitions that delay operator actions

Honor `prefers-reduced-motion`.

## Language

Use operator-first language.

Say:

- Provider account
- Browser binding
- Agent
- Project
- Needs setup
- Ready
- Paused
- Failed
- Retry
- Archive
- Copy id
- Show technical details

Avoid in primary UI:

- runtimeProfile
- tenantKey
- bindingKey
- registry mutation target
- projected model
- source kind
- object payload
- materialization unless the page is specifically about assets

Technical terms can appear in:

- API docs
- advanced inspectors
- copyable id fields
- diagnostic pages
- developer tooltips

## Accessibility

Every product screen must support:

- keyboard navigation
- visible focus states
- accessible names for icon buttons
- semantic headings in logical order
- labels for every input
- color-independent status meaning
- error summaries for submit failures
- responsive layout without horizontal page scroll at 375px width

Tables and lists must remain usable with zoom at 200%.

## Performance

Large operational datasets need bounded rendering.

Use:

- pagination or cursor loading
- virtualized rows for long tables
- bounded raw JSON previews
- lazy inspectors
- debounce for search input
- cached choices with explicit refresh controls

Do not render thousands of DOM rows or full raw payloads by default.

## Debug Surface Boundary

AuraCall should keep diagnostic power, but it must be separated from product
workflows.

Product surfaces:

- Overview
- Agents
- Providers
- Projects
- Runs
- Search
- API Access

Diagnostic surfaces:

- logs
- browser processes
- raw status payloads
- raw route discovery
- raw JSON records
- low-level provider probes
- legacy inline HTML dashboards

Primary product pages may link to diagnostics, but they should not embed
diagnostic panels by default.

## Review Checklist

Use this checklist before accepting frontend work:

- The page has one primary job.
- The first viewport shows useful state and a clear next action.
- The operator can complete the common workflow without opening raw JSON.
- Technical identifiers are hidden until selected or expanded.
- Empty states explain what to do next.
- Error states explain what failed and how to fix it.
- Long lists use tables, search, filters, and inspectors.
- Controls use stable dimensions and do not shift layout.
- Text fits at desktop and mobile widths.
- The page works at 375px width without horizontal page scroll.
- Icon buttons have accessible names.
- Motion honors `prefers-reduced-motion`.
- Raw logs, route templates, and browser process data live under Diagnostics.

## Non-Goals

This guide does not define API contracts, provider automation behavior, or the
exact React component hierarchy. It defines the UX standard those
implementations must satisfy.

## Implementation Implication

Do not keep extending the current frontend as the product experience. Treat
`/dashboard`, `/agents`, `/config`, and `/ops/browser` as legacy or diagnostic
surfaces unless a narrow operational bug fix requires touching them.

New product UX should start in a separate frontend surface and should not reuse
the existing page/component structure as the baseline. If a slice needs a
temporary debug view, put it under Diagnostics and keep it visually separate
from the primary workflow. Retiring or redirecting old routes should happen in
explicit cutover slices after the replacement workflow is proven.
