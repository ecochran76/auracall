# Browser-Service Registry + Instance Tracking Plan

## Goal
Make browser-service the authoritative source of truth for active browser instances and tabs, with fault-tolerant
registry persistence. Oracle (and other consumers) should be able to reliably select the right instance and tab
per service/profile across CLI sessions.

## Scope
### In Scope
- Registry schema v2 with instance metadata, tab inventory, and service association.
- DevTools scan utilities to refresh registry state.
- Generic matching hooks to select instances/tabs without LLM-specific logic.
- Oracle integration: leverage new APIs for Grok/ChatGPT/Gemini routing.

### Out of Scope
- Deep DOM heuristics for specific providers (stay in Oracle).
- Automatic login/auth flows (stay in Oracle).
- UI-driven reattach logic (stay in Oracle for now).

## Design
### Registry schema v2 (browser-service)
Each registry entry includes:
- `pid`, `host`, `port`
- `profilePath`, `profileName`
- `launchedAt`, `lastSeenAt`
- `args?: string[]` (CLI args used to launch; best-effort only)
- `services?: string[]` (arbitrary labels: `chatgpt`, `grok`, `gemini`, or external app)
- `tabs?: Array<{ targetId?: string; url?: string; title?: string; type?: string }>`
- `lastKnownUrls?: string[]`

### Core APIs
- `scanInstances(options)`
  - Pings DevTools port for each registered instance.
  - Uses `Target.getTargets` to populate `tabs`.
  - Updates `lastSeenAt`, `lastKnownUrls`.
  - Drops dead instances (fault tolerant).
- `resolveInstance(options)`
  - Filters by profile identity and optional service matcher.
  - Chooses instance with most-recent `lastSeenAt`.
- `resolveTab(options)`
  - Inputs: `matchUrl`, `matchTitle`, `preferTypes`, `preferExisting`.
  - Returns best-fit tab or `null` (caller decides to open a new tab).

### Fault Tolerance Rules
- If DevTools port unreachable → mark stale and drop registry entry.
- If tab list is empty → keep instance but clear `tabs`.
- If URL mismatch → keep instance, return `null` tab (caller opens).

## Oracle Integration
### Required changes
- Inject `service matcher` functions per provider:
  - ChatGPT: URL contains `chatgpt.com` (or custom configured base URL).
  - Grok: URL contains `grok.com`.
  - Gemini: URL contains `gemini.google.com`.
- Use `resolveInstance` for:
  - browser list, reattach, `conversations`, `projects`, `--target` routing.
- Use `resolveTab` for:
  - prefer existing service tab before opening a new tab.

### Expected benefits
- Eliminate port-not-found errors when a browser is already open.
- Reduce redundant spawns across CLI sessions.
- Make “use the right tab” deterministic and testable.

## Smoke Testing Scheme
### Local smoke (fast)
1) Start Chrome with DevTools enabled using Oracle.
2) Run `oracle status` / `oracle conversations --target grok` and verify:
   - Registry updated with current PID/port.
   - Tabs list includes Grok tab URL.

### Scripted smoke (automation)
1) Run `pnpm tsx scripts/test-browser.ts` to ensure DevTools connectivity.
2) Run `pnpm tsx bin/oracle-cli.ts projects --target grok --refresh`.
3) Run `pnpm tsx bin/oracle-cli.ts conversations --target grok --refresh --include-history`.
4) Verify registry JSON has updated `tabs` and `lastKnownUrls`.

### Fault tolerance smoke
1) Close Chrome manually.
2) Run a list command and confirm:
   - Registry entry is pruned.
   - Oracle spawns a fresh instance if `ensurePort` is required.

## Phased Implementation
### Phase A: Registry v2
- Update registry schema + read/write helpers.
- Add migration for legacy entries (no args/tabs).

### Phase B: DevTools scan utilities
- Implement `scanInstances()` with `Target.getTargets`.
- Add `resolveInstance` + `resolveTab` APIs.

### Phase C: Oracle wiring
- Add provider URL matchers to select instance/tab.
- Update CLI list flows to use new resolver paths.

### Phase D: Tests + docs
- Add unit tests for registry schema migration and tab scan.
- Update `docs/dev/browser-service.md` with registry API usage.

## Risks
- DevTools permissions may fail if Chrome is not launched with debugging enabled.
- Tabs can change rapidly; registry is best-effort snapshot.
- Custom service URLs (ChatGPT projects/folders) must be included in matchers.
