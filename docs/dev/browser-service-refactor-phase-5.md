
  Status: planned

  1) Packaging decision + scope guardrails

  Decision: monorepo package under `packages/browser-service/` with oracle re-exports for stability.

  - Decide packaging approach: monorepo package vs separate repo (doc tradeoffs + final choice).
  - Define what stays in oracle (LLM-specific DOM adapters, cache policy, CLI) vs what moves (browser core,
    session/port registry, DOM utilities, profile/cookie helpers).
  - Output: short decision note + checklist of modules to extract.

  Scope checklist (initial draft):
  - Move to browser-service: `src/browser/browserService/**`,
    `src/browser/chromeLifecycle.ts`, `src/browser/portSelection.ts`, `src/browser/processCheck.ts`,
    `src/browser/reattachHelpers.ts`, `src/browser/profileState.ts`, `src/browser/cookies.ts`,
    `src/browser/utils.ts`, `src/browser/constants.ts`, `src/browser/types.ts`, `src/browser/domDebug.ts`.
  - Defer (LLM/session coupling to unwind): `src/browser/client.ts`, `src/browser/reattach.ts`,
    `src/browser/sessionRunner.ts`.
  - Keep in oracle (LLM layer): `src/browser/llmService/**`, `src/browser/providers/**`,
    `src/browser/policies.ts`, `src/browser/modelStrategy.ts`, `src/browser/prompt.ts`,
    `src/browser/promptSummary.ts`, `src/browser/pageActions.ts`, `src/browser/login.ts`,
    `src/browser/config.ts`.
  - CLI-only glue and cache stay in oracle.

  2) Dependency audit + API surface

  - Inventory BrowserService dependencies and remove oracle-only imports (log, cache, llm selectors).
  - Define the public API: BrowserService base class, registry client, port resolver, profile discovery, DOM helpers,
    and optional credential helper stubs.
  - Add explicit hooks/overrides for provider-specific aliases (ex: profileConflictAction) and config alias mapping.

  Progress notes:
  - Core utilities (constants/utils/types/portSelection/processCheck/profileState/cookies/domDebug/reattachHelpers)
    moved into `packages/browser-service/` with oracle-side re-export stubs for now.
  - Generic service helpers (profile discovery + UI helpers) moved into the package; oracle keeps thin re-exports.
  - Registry implementation moved into the package with an oracle wrapper that binds the registry path.
  - Port resolution core moved into the package with an oracle wrapper to supply env/config defaults.
  - chromeLifecycle moved into the package; oracle wrapper injects the registry path.
  - BrowserService core moved into the package with oracle wrapper for config resolution + session hooks.
  - manualLogin core moved into the package with oracle providing default config injection.
  - Added generic `BROWSER_SERVICE_*` env aliases for package-level cookies and browser runtime settings.
  - session runner core moved into the package; oracle wrapper injects prompt assembly + error handling.

  3) Extraction plan + package layout

  - Create package skeleton (e.g., packages/browser-service/) with tsconfig, build target, exports map.
  - Move code with minimal behavior changes; keep exports stable in oracle via re-export wrappers.
  - Add lint/test wiring for the new package (shared configs or per-package configs).

  4) Oracle integration + compatibility

  - Update oracle imports to use the extracted package (local workspace path at first).
  - Keep config resolution intact; ensure ResolvedUserConfig still flows into BrowserService with no behavior changes.
  - Ensure CLI commands still function with the new package boundary.

  5) Documentation + migration notes

  - Add developer doc for the new package (usage, responsibilities, non-goals).
  - Update internal docs to reference BrowserService package location and API contract.

  6) Verification

  - Run lint + targeted smoke (Grok prompt, projects, conversations).
  - Verify registry behavior + port selection still match current behavior.

  Status update (Phase 5.2):
  - Added `docs/dev/browser-service.md` to capture package responsibilities + integration guidance.
