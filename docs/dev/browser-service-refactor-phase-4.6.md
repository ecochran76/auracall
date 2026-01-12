
  Status: complete (2026-01-12)

  1) Inventory + contract definition

  - Define the canonical config shape goals (browser vs llm vs service overrides) and list current fields in config.ts
    that are provider‑specific.
  - Output: a short spec doc or checklist (can live in docs/dev/... or the Phase 4 plan file).

  2) Schema ownership split

  - Extract a browserConfigSchema and browserDefaults owned by BrowserService (port range, profile path/name, headless,
    cookie path, display, etc.).
  - Define llmServiceBaseSchema for common keys (model, modelStrategy, defaultProject, etc.).
  - For each service (grok/chatgpt/gemini), add serviceConfigSchema + profileServiceSchema (provider‑specific keys like
    web_search, deep_research, etc.). These can be exported from each service module.

  3) Composed resolver

  - Build a new resolveConfig pipeline that:
      - Loads raw config.
      - Validates with a composed Zod schema from the registry.
      - Produces a ResolvedUserConfig with typed sections: browser, services, oracleProfiles, cache.
  - Keep the existing resolveBrowserConfig but only for browser/process defaults. It should not resolve provider URLs or
    project IDs anymore.

  4) Service instantiation path

  - Update createLlmService to accept the resolved config and be the only place that:
      - Resolves service URLs.
      - Normalizes provider‑specific fields.
      - Generates initial navigation URLs for sessions.

  5) Migration + compatibility

  - Add compatibility shims to map old config keys to the new structure (log warnings, keep behavior).
  - Ensure existing CLI commands work unchanged (tests + smoke).

  6) Remove legacy provider logic

  - Delete/retire src/browser/providers/service.ts usage in config resolution.
  - getProvider remains only in provider adapter layer where needed.

  7) Verification

  - Run pnpm run lint + targeted smoke: Grok prompt, project list, conversation list.
