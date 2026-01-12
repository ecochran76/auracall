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
