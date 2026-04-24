# BrowserService Refactor Roadmap | 0011-2026-04-14

State: OPEN
Lane: P01

## Current State

- roadmap classification: maintenance-only unless a concrete browser-service
  substrate mismatch blocks current behavior or the primary service/runner lane
- a concrete substrate mismatch was closed on 2026-04-21:
  `docs/dev/plans/0021-2026-04-21-browser-operation-dispatcher.md`
  now serializes managed-profile CDP ownership and has serial live proof for
  default Grok/ChatGPT/Gemini profile separation
- the selector-diagnosis drift reproduced during that live smoke is now closed:
  - `docs/dev/plans/0022-2026-04-21-provider-selector-diagnosis-hardening.md`
- a new concrete browser-service reliability mismatch is now open:
  - `docs/dev/plans/0053-2026-04-23-browser-control-plane-completion.md`
  - current gap: mutation authority is still split across browser-service
    helpers, provider adapters, and legacy browser flows, so the earlier
    operation dispatcher is not yet the full browser control plane
- this roadmap is still the live long-running browser-service architecture track referenced from the main roadmap
- the browser-profile family subtrack is now canonical under:
  - `docs/dev/plans/0008-2026-04-14-browser-profile-family-refactor.md`
- the current need is stable canonical placement for the long-running browser service roadmap, not a rewrite of its phase structure
- the old loose path will remain searchable in the legacy archive once the canonical roadmap is wired

# BrowserService Refactor Roadmap

## Purpose
Define the high-level path to peel Oracle’s browser automation into a reusable base library (`browserService`) with an LLM-specific layer (`llmService`). This roadmap complements `docs/dev-plan-browser-refactor/plan.md` and expands its scope into a service-agnostic architecture.

## Vision
- **browserService**: reusable automation core for browser session management, profile/cookie handling, port/registry resolution, DOM utilities, and generic navigation. This layer is service-agnostic and domain-agnostic.
- **llmService**: LLM-specific layer (interface + base class) that adds projects/conversations/contexts, cache policy, model selection, and consistency guarantees.
- **Service adapters**: Grok/ChatGPT/Gemini implement only service-specific selectors, URLs, and UI nuances.
- **UI vs data separation**: keep DOM scraping/interaction adapters separate from data/cache adapters for testability and flexibility.

## Roadmap Phases

### Phase 1: Consolidate Browser Core (aligns with existing plan)
- Centralize browser session lifecycle, registry, and port selection into a single module.
- Normalize profile identity usage and cookie/profile discovery.
- Ensure CLI routes through the shared browser handler.

### Phase 2: Formalize browserService
- Define the base class interface, responsibilities, and hooks (navigation, tab selection, DOM ops, capability flags).
- Move browser utilities (UI discovery helpers, dialog handling, selectors, navigation primitives) under the base class or its support modules.
- Document the reusable API surface for non-LLM automation.

Status: complete (2026-01-12). Phase 2 utilities and adapters now route through `BrowserService`.

### Phase 3: Introduce llmService
- Define LLM-domain primitives (projects, conversations, contexts, files, models, capabilities).
- Centralize cache refresh policy and name/id resolution.
- Provide standard lifecycle hooks for list/refresh/rename/open flows.

Status: complete (CLI list/resolve flows now use `llmService`; model picker fallback warns on failure).

### Phase 4: Port existing services
- Implement Grok/ChatGPT/Gemini as `llmService` subclasses.
- Move service-specific DOM and workflows into adapters (selectors, URLs, UI affordances).
- Replace CLI glue with calls into the base classes.

### Phase 5: Externalize the browser core
- Decide packaging: monorepo package vs separate repo.
- Extract browserService into a reusable package with minimal dependencies.
- Version and document the stable API for external automation projects.

### Phase 6: Package hardening + integration cleanup
- Stabilize the browser-service public API and documentation.
- Move remaining generic helpers out of Oracle into browser-service.
- Add unit tests for browser-service core utilities.

### Phase 7: Profile-scoped operation dispatch

Status: closed through
`docs/dev/plans/0021-2026-04-21-browser-operation-dispatcher.md`.

- Route managed-profile CDP operations through one dispatcher key per managed
  browser profile/service.
- Serialize or explicitly block operations that would otherwise race on tab
  selection, navigation, login, or live probing.
- Treat login/human-verification flows as exclusive operations.
- Keep this below the AuraCall runtime service/runner layer; do not turn it
  into a broad multi-runner scheduler in this phase.

### Phase 8: Provider selector diagnosis hardening

Status: closed through
`docs/dev/plans/0022-2026-04-21-provider-selector-diagnosis-hardening.md`.

- Separate account/profile health from conversation-output readiness in
  doctor selector diagnosis.
- Treat healthy Grok and ChatGPT home/new-chat surfaces as valid doctor
  outcomes when no assistant turn is expected.
- Treat provider workbench routes, such as Grok `/imagine`, as their own
  selector-diagnosis surface when they do not expose normal chat-only controls.
- Keep blocking-state detection and conversation-surface checks strict.

### Phase 9: Mutation control-plane completion

Status: open through
`docs/dev/plans/0053-2026-04-23-browser-control-plane-completion.md`.

- Finish the browser-service dispatcher boundary so managed-profile browser
  mutations route through one browser-service-owned control plane.
- Centralize navigation, reload, target reuse/open navigation, and related
  mutation audit logging.
- Reduce provider adapters and legacy browser flows to declaring mutation
  intent instead of issuing direct page mutations.

## Deliverables
- `browserService` base class + supporting utilities.
- `llmService` base class + common cache/refresh logic.
- Service adapters for Grok/ChatGPT/Gemini.
- Updated CLI wiring + documentation for the new layers.

## Notes
- This roadmap assumes the existing browser refactor plan remains the execution guide for Phase 1.
- Detailed phase plans should live in per-phase files and link back here.
- Policy logic (cache vs refresh vs live scrape) should be centralized and reused across CLI commands.
- Credential helpers should start as stubs (config/env) to prepare for future password/OTP retrieval.
- Headless/headful should be handled in browserService; rename `manualLogin` to `interactiveLogin` (or `loginMode`) with legacy alias mapping and deprecation warnings.
