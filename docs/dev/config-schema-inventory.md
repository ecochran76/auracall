# Config Schema Inventory (Phase 4.6)

## Goal
Define the target config shape split between BrowserService (browser/process) and LlmService (LLM + provider features). This is a snapshot to guide the schema refactor.

## Current Config Areas (legacy + v2)

### Browser/Process (BrowserService-owned)
- `browserDefaults.*` (v2) / `browser.*` (legacy)
  - `chromePath`, `profilePath`, `profileName`, `cookiePath`
  - `chromeProfile`, `chromeCookiePath`, `display`
  - `debugPort`, `debugPortRange`, `remoteChrome`
  - `headless`, `hideWindow`, `keepBrowser`
  - `manualLogin` / `interactiveLogin` (alias), `manualLoginProfileDir`, `manualLoginCookieSync`
  - `wslChromePreference`
  - `cookieSync`, `cookieSyncWaitMs`, `cookieNames`, `inlineCookies`, `inlineCookiesFile`, `allowCookieErrors`, `noCookieSync`
  - `attachments`, `inlineFiles`, `bundleFiles`
  - `cache.*`, `list.*`, `sessionOpen.*`
  - `profileConflictAction` (generic) + `blockingProfileAction` (legacy alias)

### LLM Defaults (LlmService-owned)
- `llmDefaults.*` (v2)
  - `model`, `modelStrategy`
  - `defaultProjectName`, `defaultProjectId`

### Service Defaults (Generic, BrowserService + LlmService boundary)
- `services.<id>`
  - `url`
  - `identity.*` (name/handle/email)
  - `interactiveLogin` (alias for `manualLogin`)
  - Service-scoped defaults (LLM domain): `projectName`, `projectId`, `conversationName`, `conversationId`, `model`, `modelStrategy`, `thinkingTime`

### Profile Overrides
- `profiles.<name>` (v2) / `auracallProfiles.<name>` (legacy)
  - `engine`, `search`, `defaultService`, `keepBrowser`
  - `browser.*` (BrowserService overrides)
  - `llm.*` (LlmService defaults override)
  - `services.<id>` (service-specific overrides)
  - `cache.*`

## Provider-Specific URL Fields (to move into LlmService)
- `browser.chatgptUrl`, `browser.grokUrl`, `browser.geminiUrl`
- `browser.url` (generic fallback; service chooses how to interpret)

## Known Provider Feature Flags (future schema)
These are not wired yet, but should live under `services.<id>.features` (global) and `profiles.<name>.services.<id>.features` (overrides):
- ChatGPT: `web_search`, `deep_research`, `company_knowledge`, `apps`
- Gemini: `search`, `grounding`, `apps`
- Grok: `search`, `sources`, `apps`

## Required Work (Phase 4.6)
1) Export per-service feature schemas (ChatGPT/Grok/Gemini).
2) Compose a top-level schema using registry contributions.
3) Produce `ResolvedUserConfig` with typed sections (`browserDefaults`, `services`, `profiles`, `llmDefaults`).
4) Keep legacy compatibility via alias + normalization.
