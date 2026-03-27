# Browser Automation Client Refactor Plan

## Context
The `bin/auracall.ts` file has become a "god object", conflating CLI argument parsing with complex browser automation logic. Features like project listing, conversation management, renaming, and diagnostics are manually implemented in each command handler, leading to duplicated code (DRY violations) and poor testability.

## Objective
Extract a `BrowserAutomationClient` class to encapsulate all browser connection, provider resolution, and command dispatch logic. The CLI should act as a thin layer that parses arguments and delegates to this client.

## Session + Profile Principles (added 2026-01-10)
These are the intended behaviors for session management and login flows as we refactor:

- **Profile identity** is `{ profilePath, profileName }`. This is the stable key for registry, reuse, and session resolution.
- **Registry first**: active sessions are resolved from `~/.auracall/browser-state.json` (env override only for debugging).
- **Login flow intent**: “manual login” means a *human-interactive* bootstrap of the persistent profile; it is not a disposable profile.
- **Profile reuse**: Oracle should reuse a live session for the same profile identity and spawn a new one only when missing.

### Future extensions (post-refactor goals)
- **Multi-profile config blocks**: allow multiple named profile identities (e.g., `profiles.<name>`) so different folders/targets can select different logins via config layering.
- **Smart defaults**: when no profile is configured, attempt to detect a Chromium-based default browser/profile and attach to it before falling back to `~/.auracall`.
- **Profile discovery precedence** (target behavior):
  1) Explicit config/CLI profile identity.
  2) Discovered system/browser profile (Chromium-based).
  3) Oracle-managed profile under `~/.auracall`.

## Implementation Phases

### Phase 1: Create `BrowserAutomationClient`
**File:** `src/browser/client.ts`

Create a class that standardizes interaction with the active browser session.

*   **Static Factory**: `fromConfig(config: UserConfig, options: { target?: string })`
    *   Determines the active provider (Grok/ChatGPT).
    *   Resolves the active debug port using the registry (moved from CLI).
    *   Initializes the provider adapter.
*   **Instance Methods**:
    *   `listProjects(options?)`: Delegates to provider.
    *   `listConversations(options?)`: Delegates to provider.
    *   `renameConversation(id, name, options?)`: Delegates to provider.
    *   `diagnose()`: Wraps `src/inspector/doctor.ts`.
    *   `login()`: Wraps the manual login launch logic.

### Phase 2: Centralize Shared Logic
**Files:** `src/browser/chromeLifecycle.ts`, `src/browser/service/portResolution.ts` (or similar)

1.  **Port Resolution**: Move `resolveBrowserListPort` from `bin/auracall.ts` to `src/browser/chromeLifecycle.ts` or `src/browser/service/portResolution.ts`. It should remain robust (checking Env -> Config -> Registry -> File).
2.  **Login Logic**: Ensure `launchManualLoginChrome` and related helpers are exported from `src/browser/chromeLifecycle.ts` or `src/remote/server.ts` so `BrowserAutomationClient` can use them without circular deps.

### Phase 3: Refactor CLI Commands
**File:** `bin/auracall.ts`

Systematically replace the body of each command with `BrowserAutomationClient` usage.

1.  **`projects`**:
    *   *Old*: Manually resolve port, checking provider capabilities, handling caching fallback.
    *   *New*: `client.listProjects()`. (Note: The caching/fallback logic might belong inside the client or remain in the CLI if it's purely presentation-layer. Ideally, the client handles the "fetch" part, and CLI handles the "display/cache" part, OR the client handles caching too. Let's start with client handling the *fetch*).
2.  **`conversations`**:
    *   Replace manual provider calls with `client.listConversations()`.
3.  **`rename`**:
    *   Replace with `client.renameConversation()`.
4.  **`login`**:
    *   Replace with `client.login()`.
5.  **`doctor`**:
    *   Replace with `client.diagnose()`.

### Phase 4: Cleanup
1.  Remove `getProvider`, `resolveBrowserListPort`, and other isolated helper functions from `bin/auracall.ts`.
2.  Ensure imports are clean.

## Benefits
*   **Single Responsibility**: CLI parses args; Client executes logic.
*   **Reusability**: The client can be used by the MCP server or other tools easily.
*   **Consistency**: All commands resolve the "active browser" using the exact same logic.

## Status (2026-01-10)
*   Phase 1: Complete (client added in `src/browser/client.ts`).
*   Phase 2: Complete (port resolution + login helpers centralized).
*   Phase 3: Complete (projects/conversations/rename/login/doctor use client; cache refresh/name resolution routed via LlmService; model picker fallback emits warning on failure).
*   Phase 4: Complete (legacy helper cleanup + import pruning).
