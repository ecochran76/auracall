# BrowserService Refactor Phase 1 Plan

## Goal
Consolidate browser session lifecycle and config/profile resolution so Oracle uses a single browser handling path everywhere, without breaking existing CLI behavior.

## Scope (Phase 1)
- Keep all LLM-specific logic intact; focus only on browser core plumbing.
- Align with `docs/dev-plan-browser-refactor/plan.md` while preparing for the broader `browserService` split.

## Deliverables
- Centralized browser session + port resolution used by every CLI entry point.
- Consistent profile identity usage across CLI commands and browser tools.
- A minimal “browser handler” surface that can be promoted into `browserService` later.

## Implementation Steps

1) **Audit and consolidate browser entry points**
   - Enumerate all paths that touch DevTools ports, registry lookups, or profile selection (CLI, login, browser-tools).
   - Route them through a single helper (ex: `BrowserAutomationClient` + `resolveBrowserListTarget`).
   - Remove redundant port checks and direct env/registry reads outside the shared helper.

2) **Normalize session/profile identity**
   - Ensure every session lookup uses `{ profilePath, profileName }`.
   - Registry is always first source; env overrides only for debugging.
   - Confirm cookie path and profile path are deterministic and aligned with profile identity.

3) **Centralize browser launch + attach**
   - One function responsible for spawning or attaching (existing “manual login” logic lives here).
   - Keep display/WSL handling inside the shared module (no CLI duplication).

4) **Refactor CLI command wiring**
   - Ensure `projects`, `conversations`, `rename`, `login`, `doctor` use the shared browser handler instance.
   - Confirm default profile resolution applies consistently (via `resolveConfig`).

5) **Stabilize registry usage**
   - Ensure any spawned session is recorded in the registry.
   - Detect stale sessions and ignore them consistently.

## Non-Goals
- No new LLM service abstractions yet.
- No cross-repo extraction in Phase 1.
- No new UI flows; only reuse and cleanup.

## Validation (No Regressions)
- **Baseline browser list**: `DISPLAY=:0.0 pnpm tsx bin/oracle-cli.ts projects`
- **Conversation list**: `DISPLAY=:0.0 pnpm tsx bin/oracle-cli.ts conversations --target grok --include-history`
- **Prompt run**: `DISPLAY=:0.0 pnpm tsx bin/oracle-cli.ts -p "ping" --force`
- **Login flow**: `DISPLAY=:0.0 pnpm tsx bin/oracle-cli.ts login --target grok`

## Exit Criteria
- All browser interactions resolve port/profile/session via the shared handler.
- No direct registry/port lookups remain in CLI command bodies.
- Manual login/attach behavior remains unchanged from current user experience.
