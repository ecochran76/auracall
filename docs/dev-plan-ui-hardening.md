# UI Hardening + Shared Browser Helpers Plan

## Goals
- Reduce breakage from UI changes in ChatGPT and Grok browser automation.
- Share common automation flows with provider-specific selectors and quirks isolated in config.
- Preserve current behavior; avoid regressions in browser smoke and Grok tests.

## Audit Summary (Current State)
Shared behaviors today:
- Navigation + readiness (`navigateToChatGPT`, `ensurePromptReady`).
- Prompt composition + submit (`submitPrompt`, `clearPromptComposer`).
- Attachment upload (`uploadAttachmentFile`, `uploadAttachmentViaDataTransfer` for remote).
- Assistant response polling (`waitForAssistantResponse`, snapshot/poller).
- Model selection (ChatGPT `ensureModelSelection`, Grok `selectGrokMode`).

Provider-specific divergence:
- Grok flow is separate in `src/browser/actions/grok.ts` with its own selectors and response polling.
- ChatGPT uses `src/browser/constants.ts` selectors + actions in `src/browser/actions/*`.

Fragility hotspots:
- Single selectors for model button/copy button in `src/browser/constants.ts`.
- Attachment menu/plus button and menu items rely on brittle IDs/text.
- Assistant response detection leans on `data-testid`/classnames.
- Grok uses UI classnames and menu roles; improved with fallbacks but still isolated.

## Proposed Refactor (Architecture)
1) **Provider descriptor interface**
   - `BrowserProviderConfig` describing selector arrays + role/text fallbacks:
     - `inputSelectors`, `sendSelectors`, `modelButtonSelectors`, `menuItemSelectors`,
       `assistantBubbleSelectors`, `assistantRoleSelectors`, `copyButtonSelectors`,
       `composerRootSelectors`, `fileInputSelectors`, `attachmentMenuSelectors`.
   - Provider quirks:
     - `openModelMenu` strategy (click vs keyboard fallback).
     - `isLoggedIn` check predicate (URL / DOM based).
     - `responseExtraction` hooks (ChatGPT uses conversation-turn snapshot, Grok uses bubbles).

2) **Shared helper layer**
   - `findFirstSelector(selectors)` + `queryAllSelectors(selectors)` utilities inside evals.
   - `openMenuWithFallback` (click → wait → keyboard fallback).
   - `ensurePromptReadyWithSelectors`, `setPromptWithSelectors`, `submitWithSelectors`.
   - `waitForAssistantResponseWithProvider` (provider-specific extraction via injected hook).

3) **Provider wrappers**
   - `ChatGptProvider` and `GrokProvider` implement config + small overrides.
   - Keep ChatGPT and Grok entrypoints, but route shared calls to provider helpers.

## Implementation Plan (Phased)
Phase 1: Foundations
- Add `src/browser/providers/types.ts` with `BrowserProviderConfig`.
- Add `src/browser/providers/shared.ts` with selector utilities and menu open helpers.
- Define `chatgptProvider` and `grokProvider` configs (selectors + quirks).

Phase 2: Migrate Grok
- Replace Grok selector strings in `src/browser/actions/grok.ts` with provider config usage.
- Use shared `openMenuWithFallback` + `waitForMenu` helpers.
- Keep Grok response extraction but wire through shared helper.
- Run `pnpm test:grok-smoke`.

Phase 3: Migrate ChatGPT
- Replace single selectors in `src/browser/constants.ts` with provider config lists.
- Use shared selector utilities in:
  - `promptComposer.ts` (input + send selectors)
  - `assistantResponse.ts` (assistant selectors + copy button)
  - `attachments.ts` (composer root + menu open)
  - `modelSelection.ts` (menu item selectors)
- Run `ORACLE_BROWSER_PORT=9222 pnpm test:browser`.

Phase 4: Harden + Docs
- Add docs: `docs/browser-mode.md` section “UI hardening + selectors”.
- Add a short `docs/testing.md` note on provider selector smokes.
- Update `docs/dev-plan-grok.md` with shared helper usage if needed.

## Git Hygiene
- Use small, scoped commits per phase:
  1) Provider interface + shared helpers
  2) Grok migration
  3) ChatGPT migration
  4) Docs/test updates
- Keep tests green at each phase; record command outputs in commit message body if helpful.

## Risks / Mitigations
- Risk: Breaking ChatGPT selector matching → mitigate with additive selector lists + smoke tests.
- Risk: Over-abstraction obscures provider-specific behavior → mitigate via provider hooks.
- Risk: Regression in “Answer now” handling → preserve assistantResponse logic unchanged.

## Definition of Done
- Grok and ChatGPT browser smokes pass.
- Selector changes are centralized in provider configs.
- Docs reflect new selector architecture and test guidance.

## Forward-Looking Features (to align abstractions)
- List Projects/Gems (provider APIs or UI-driven discovery).
- List conversations and attach to a conversation by ID.
- Pull conversation context (assistant/user turns) in a structured form.
- Edit project instructions (system/pinned context) where supported.
- Pull/push files (project storage or workspace files) and attach to conversations.
- Pull files from conversations (attachments/downloads).

## Implications for the Architecture
- Provider interface should include:
  - `listProjects()` / `listGems()` (or `listWorkspaces()`) where applicable.
  - `listConversations(projectId?)`, `openConversation(conversationId)`.
  - `readConversationContext(conversationId, opts)`.
  - `updateProjectInstructions(projectId, content)`.
  - `listProjectFiles(projectId)`, `uploadProjectFile(projectId, file)`, `downloadProjectFile(projectId, fileId)`.
  - `listConversationFiles(conversationId)`, `downloadConversationFile(conversationId, fileId)`.
- Shared helpers should support:
  - Navigation to project scopes and conversation URLs.
  - Extracting structured metadata (IDs, titles, timestamps).
  - File transfer workflows (upload + download).
- Test harness should add:
  - Provider capability checks and light smoke coverage for listing + file ops.
