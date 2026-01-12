# BrowserService Refactor Phase 4 Plan

## Goal
Port Grok/ChatGPT/Gemini to `llmService` subclasses and fully decouple service-specific DOM workflows from the CLI, while preserving current behavior.

## Scope (Phase 4)
- Introduce `LlmService` subclasses per provider (Grok/ChatGPT/Gemini).
- Move provider-specific DOM logic into adapters that implement the `llmService` contract.
- Route CLI operations through `llmService` subclasses rather than direct provider calls.
- Ensure cache/project/conversation flows are unified across services.

## Deliverables
- `src/browser/llmService/providers/grokService.ts`
- `src/browser/llmService/providers/chatgptService.ts`
- `src/browser/llmService/providers/geminiService.ts`
- Shared DOM helpers for list/rename/history where possible.
- CLI updated to instantiate `llmService` providers via a registry/factory.
- Updated docs and Phase 4 validation checklist.

## Implementation Steps

1) **Define provider subclasses**
   - Create `LlmService` subclasses that wrap existing provider adapters.
   - Declare capability flags and default URLs in each subclass.

2) **Move provider logic behind `llmService`**
   - Migrate listProjects/listConversations/rename/getUserIdentity to subclasses.
   - Keep adapters focused on DOM selectors and interaction primitives.

3) **CLI wiring**
   - Replace direct provider calls with `llmService` subclass methods.
   - Ensure `BrowserAutomationClient` remains a thin wrapper or is removed from CLI paths.

4) **Validation**
   - Smoke test projects/conversations/rename/login/doctor for Grok/ChatGPT.
   - Confirm cache refresh and name resolution work across providers.

## Exit Criteria
- Provider-specific logic lives under `llmService` subclasses.
- CLI does not call provider adapters directly.
- Cache + name resolution flows are unified across services.

## Status (2026-01-12)
- Planned.
