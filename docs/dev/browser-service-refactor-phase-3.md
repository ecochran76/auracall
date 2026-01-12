# BrowserService Refactor Phase 3 Plan

## Goal
Introduce the `llmService` layer that centralizes LLM-domain primitives (projects, conversations, contexts, files, models) and shared cache/refresh logic while keeping behavior stable.

## Scope (Phase 3)
- Define LLM-domain capabilities and cache identity handling in `llmService`.
- Centralize cache refresh policy, project/conversation name resolution, and cache key derivation.
- Update CLI commands to rely on `llmService` for list/refresh/resolve flows.
- Keep model selection fallback work in this phase.

## Deliverables
- `LlmService` base class with cache identity/context helpers.
- Standardized project/conversation name resolution with refresh rules.
- CLI routes for projects/conversations/cache/name hints using `LlmService`.
- Phase 3 documentation updated with status and follow-ups.

## Implementation Steps

1) **Expose shared cache primitives**
   - Add `resolveCacheIdentity`, `resolveCacheContext`, `getCacheSettings` APIs.
   - Align project/conversation resolution with existing refresh behavior.

2) **Refactor CLI to use `LlmService`**
   - Route `projects`, `conversations`, `cache`, and name-hint resolution through `LlmService`.
   - Remove duplicate cache/resolve helpers from the CLI.

3) **Document + validate**
   - Update Phase 3 plan/roadmap with status.
   - Record any cache/identity behavior changes in the fixes log.

## Validation (No Regressions)
- `oracle projects` refreshes and caches using `LlmService`.
- `oracle conversations` resolves project/conversation names via cache.
- `oracle cache --refresh` still refreshes with history flags.
- Browser prompt run (`oracle -p`) still resolves default project name.

## Exit Criteria
- CLI list/resolve flows go through `LlmService`.
- Cache identity logic lives only in `LlmService`.
- Behavior matches prior cache refresh + name resolution flows.

## Status (2026-01-12)
- In progress: `LlmService` is in place and CLI commands are being migrated.
- Remaining: verify model-selection fallback updates and finish Phase 3 validation checklist.
