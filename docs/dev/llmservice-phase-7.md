# Phase 7: Grok Feature Completion + LlmService Abstraction

## Goals
- Round out Grok feature coverage while extracting generic LLM behavior into `llmService`.
- Keep Grok UI/DOM logic confined to `grokService`.
- Solidify cache as a lightweight mirror of the user’s service account.
- Make prompt/session behavior predictable and configurable.

## Non-Goals
- ChatGPT feature parity (comes after Grok is solid).
- Full data migration tooling for legacy caches beyond best-effort import.
- Automated credential retrieval (only stubs).

## Guiding Principles
- Generic behavior belongs in `llmService` and shared cache modules.
- UI/DOM selectors and URL templates belong in provider services.
- Cache is a mirror of the remote account, keyed by `service + identity`.
- Follow the browser automation playbook for recon, scoping, and verification:
  - `docs/dev/browser-automation-playbook.md`

## Sequencing (Dependencies)
- Phase 7.1: Cache + identity foundation (schema, store interface, export formats).
- Phase 7.2: Prompt planning + URL resolution (project/conversation scope + `latest` rules).
- Phase 7.3: Project operations (CRUD + push/pull).
- Phase 7.4: Conversation operations (CRUD + move + branch + attachment sync).
- Phase 7.5: Error taxonomy + diagnostics.
- Phase 7.6: Tests + smoke expansion.

## Workstreams

### 1) Cache Architecture (LlmService-level)
**Scope**
- Decide storage backend: keep JSON tree with indexing layer or move to a lightweight DB (SQLite).
- Define canonical cache layout keyed by `service/<identity>/...`.
- Provide indexing/search over:
  - Project metadata
  - Conversation metadata
  - Message context (full transcript)
  - Attachments (user + model)

**Deliverables**
- `CacheStore` interface with pluggable backends:
  - `JsonCacheStore` (current layout + index files)
  - `SqliteCacheStore` (optional future, feature-flagged)
- Documented cache schema + index layout (`docs/dev/cache-schema.md`).
  - Includes project instruction markdown + metadata, knowledge manifest + files, and conversation attachment storage.
- Export tools:
  - `auracall cache export --scope project|conversation --format json|md|zip|html|csv`
  - Include attachments and optional transcript indexes
- Workspace overrides:
  - Config overrides to map a project or conversation to a user-defined folder.
- Sync tools:
  - `auracall projects pull|push` for instruction + knowledge files.
  - `auracall projects sync --mode merge|overwrite` (bidirectional).
- Conversation rehydration:
  - Ability to branch a new conversation from cached context, optionally to another provider.
- Active-file reconciliation:
  - Query provider for currently attached/active files; re-upload missing ones.

**Open design points**
- Whether transcripts are stored as structured JSON, Markdown, or both.
- Whether attachment metadata should be normalized across providers.

### 2) Prompt Flow & Session Management (LlmService-level)
**Scope**
- Define deterministic behavior for:
  - `--force` (bypass duplicate prompt guard only; reuse policy is separate)
  - Conversation selection (`id`, `name`, `latest`, `latest-1`, etc.).
  - Project resolution via cache or live refresh.
- Consistent prompt pipeline:
  - Resolve project + conversation → compose URL → apply options → deliver prompt → capture response.

**Deliverables**
- `PromptPlan` struct in `llmService`:
  - `targetUrl`, `projectId`, `conversationId`, `promptMode`, `reusePolicy`
- Unified URL resolution in `llmService`:
  - Provider hooks for URL templates:
    - project URL
    - conversation URL
- `--force` rules documented and enforced in one place (duplicate prompt guard only).
- Standard response post-processing hook (provider-specific):
  - e.g., Grok’s elapsed time suffix trimming.

### 3) Project Support (GrokService + LlmService)
**Scope**
- Full project listing (already implemented, harden).
- Project rename.
- Project clone.
- Project instructions CRUD.
- Knowledge file CRUD.
- Pull/push to workspace.
- Project file list/add/remove (sources tab).

**Deliverables**
- `llmService` project API:
  - `listProjects`, `getProject`, `renameProject`, `updateInstructions`,
    `listKnowledge`, `uploadKnowledge`, `deleteKnowledge`, `pullProject`, `pushProject`
- `grokService` implements:
  - UI flows for each operation.
  - DOM selectors isolated to grok adapter.
- File operations:
  - `listProjectFiles`, `uploadProjectFiles`, `deleteProjectFile` (Grok Sources tab).
  - Reuse shared UI helpers for hover actions and collapsible lists.

**TODO**
- Grok project clone: menu button lookup still fails in clone flow even though project rename works.
  - Clone flow should share the same menu-button selection logic as rename.
  - Add DOM probe instructions if selectors don’t resolve.
- Grok project instructions read: Edit Instructions button is brittle; add probe output if selector fails.
- File operations:
  - Confirm sources tab flow is stable after model/prompt changes.
  - Add explicit handling when the Files section is collapsed.
  - ✅ Implemented list/add/remove via Sources tab with collapsible handling + hover actions.

### 4) Conversation Support (GrokService + LlmService)
**Scope**
- Full listing (already implemented, harden).
- CRUD:
  - Create new, rename, delete.
  - Fetch/store full context + attachments.
  - Query active files.

**Deliverables**
- `llmService` conversation API:
  - `listConversations`, `getConversation`, `renameConversation`,
    `deleteConversation`, `branchConversation`, `syncAttachments`, `moveConversation`
- `grokService` implements UI flows + DOM parsing.

### 5) Error Handling & Resilience (Shared)
**Scope**
- Detect navigation failures:
  - missing project/conversation
  - auth mismatch or logged out
- Detect UI changes:
  - missing model picker entries
  - changed selectors
- Detect cache mismatches after mutations (create/rename/clone/delete).

**Deliverables**
- Consistent error taxonomy (`LlmServiceError`, `NavigationError`, `AuthError`, `UiMismatchError`).
- Provider hooks to map UI failures to typed errors.
- Diagnostic hints in CLI output + `oracle doctor` hooks.
- Post-mutation verification checklist:
  - Confirm URL change and extract ID after create/clone/rename flows.
  - Update cache deterministically when the URL confirms the new target.

### 6) Tests & Smoke
**Scope**
- Unit tests for:
  - Prompt plan resolution
  - Cache index query/exports
  - Provider URL templating
- Live smoke:
  - Use `docs/dev/smoke-tests.md` as baseline.
  - The WSL-primary Grok acceptance checklist in `docs/dev/smoke-tests.md` is the current definition-of-done bar.
  - It must cover project create/list/rename/clone/instructions/files/remove, conversation create/list/context/rename/delete, markdown capture, cache freshness, and cleanup.
  - Keep Windows Chrome as secondary/manual-debug coverage until its human-session and debug-session behavior is cleaner.
  - TODO: rerun `auracall cache export --format md|html` after context scraping is implemented (requires cached contexts).
  - Sidebar/history helpers: ensure `ensureMainSidebarOpen` runs before history modal flows and use sidebar-toggle helpers for Grok.

## Phase 7 Output
- Grok feature suite complete for prompt/projects/conversations + cache mirroring.
- Clear separation of concerns between `llmService` and `grokService`.
- Cache system ready for multi-service reuse.

## Decisions & Open Questions
- Export formats: `json`, `md`, `zip`, `html`, `csv`.
- “Latest” resolution: scoped to project when a project is active. `--no-project` forces global scope.
  - Grok: global “latest” is the first history entry (may belong to a project).
  - ChatGPT: `--no-project` selects latest conversation not in a project.
- Project knowledge is durable; conversation files are ephemeral and should be reconciled.
- Conversation CRUD must include moving conversations between projects.
- Cache sync supports both destructive sync and additive merge.
- Cache backend: JSON + index by default; SQLite optional later.
- Decision: `--force` only bypasses duplicate prompt guard; reuse/new conversation is controlled separately.
- Prompt reuse policy: reuse only when an explicit conversation selector is provided; otherwise start new.
- Open: branching context representation (raw transcript only vs transcript + normalized context).
- Open: file operation defaults (fail fast when project name resolves to a different ID vs warn/confirm).
