
  Status: planned

  1) Packaging decision + scope guardrails

  - Decide packaging approach: monorepo package vs separate repo (doc tradeoffs + final choice).
  - Define what stays in oracle (LLM-specific DOM adapters, cache policy, CLI) vs what moves (browser core,
    session/port registry, DOM utilities, profile/cookie helpers).
  - Output: short decision note + checklist of modules to extract.

  2) Dependency audit + API surface

  - Inventory BrowserService dependencies and remove oracle-only imports (log, cache, llm selectors).
  - Define the public API: BrowserService base class, registry client, port resolver, profile discovery, DOM helpers,
    and optional credential helper stubs.
  - Add explicit hooks/overrides for provider-specific aliases (ex: profileConflictAction) and config alias mapping.

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
