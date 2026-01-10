# Browser Automation Client Refactor Plan

## Context
The `bin/oracle-cli.ts` file has become a "god object", conflating CLI argument parsing with complex browser automation logic. Features like project listing, conversation management, renaming, and diagnostics are manually implemented in each command handler, leading to duplicated code (DRY violations) and poor testability.

## Objective
Extract a `BrowserAutomationClient` class to encapsulate all browser connection, provider resolution, and command dispatch logic. The CLI should act as a thin layer that parses arguments and delegates to this client.

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
**Files:** `src/browser/chromeLifecycle.ts`, `src/browser/portResolution.ts` (or similar)

1.  **Port Resolution**: Move `resolveBrowserListPort` from `bin/oracle-cli.ts` to `src/browser/chromeLifecycle.ts` (or a new utility). It should remain robust (checking Env -> Config -> Registry -> File).
2.  **Login Logic**: Ensure `launchManualLoginChrome` and related helpers are exported from `src/browser/chromeLifecycle.ts` or `src/remote/server.ts` so `BrowserAutomationClient` can use them without circular deps.

### Phase 3: Refactor CLI Commands
**File:** `bin/oracle-cli.ts`

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
1.  Remove `getProvider`, `resolveBrowserListPort`, and other isolated helper functions from `bin/oracle-cli.ts`.
2.  Ensure imports are clean.

## Benefits
*   **Single Responsibility**: CLI parses args; Client executes logic.
*   **Reusability**: The client can be used by the MCP server or other tools easily.
*   **Consistency**: All commands resolve the "active browser" using the exact same logic.
