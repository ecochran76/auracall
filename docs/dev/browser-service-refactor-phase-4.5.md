# Phase 4.5: Config Schema Refactor (BrowserService + LlmService)

## Goal
Refactor config resolution so browser/process settings live in `BrowserService`, while provider and LLM settings are owned by `LlmService` subclasses. Keep current behavior working, but move provider URL and project/conversation resolution out of `config.ts`.

## Target Schema (Conceptual)
```json
{
  "version": 2,
  "globals": {
    "cacheRoot": "/path/optional",
    "logLevel": "info"
  },
  "browserDefaults": {
    "chromePath": "/path/optional",
    "profilePath": "/path/optional",
    "profileName": "Default",
    "cookiePath": "/path/optional",
    "headless": false,
    "display": ":0.0",
    "debugPortRange": [45000, 45100],
    "keepBrowser": true,
    "profileConflictAction": "terminate-existing"
  },
  "llmDefaults": {
    "model": "grok-4.1-thinking",
    "modelStrategy": "select",
    "defaultProjectName": "SABER",
    "defaultProjectId": "123456"
  },
  "services": {
    "chatgpt": {
      "url": "https://chatgpt.com/",
      "manualLogin": true,
      "identity": { "email": "ecochran76@gmail.com" },
      "features": {}
    },
    "gemini": {
      "url": "https://gemini.google.com/",
      "identity": { "email": "ecochran76@gmail.com" },
      "features": {}
    },
    "grok": {
      "url": "https://grok.com/",
      "manualLogin": true,
      "identity": { "email": "ez86944@gmail.com" },
      "features": {}
    }
  },
  "profiles": {
    "default": {
      "defaultService": "grok",
      "browser": { "profilePath": "/home/user/.oracle/browser-profile" },
      "llm": { "model": "grok-4.1-thinking" },
      "services": {
        "grok": { "defaultProjectName": "SABER" }
      }
    },
    "main": {
      "defaultService": "chatgpt",
      "browser": { "profilePath": "/home/user/.config/google-chrome" },
      "services": {
        "chatgpt": { "model": "gpt-5.2-thinking" }
      }
    }
  }
}
```

## Key Decisions
- **`profileConflictAction`** is generic (BrowserService-level): `fail | terminate-existing | attach-existing`.
- **`llmDefaults.defaultProjectName/defaultProjectId`** supported globally and per-profile. If both are set, warn and prefer `defaultProjectId`.
- **Service-level** config (`services.<id>`) remains generic browser automation: url, manualLogin/interactive mode, identity.
- **LLM-level** config (`llmDefaults` + per-profile overrides) owns model and project defaults.
- **Service-specific features** are nested under `services.<id>.features` or per-profile overrides.

## Implementation Outline
1) **Schema split**
   - BrowserService owns `browserDefaults` + profile browser overrides.
   - LlmService owns `llmDefaults` + per-profile `services.<id>` overrides.
2) **Schema composition**
   - Build a top-level Zod schema by combining BrowserService schema + registry of LlmService schemas.
3) **Two-pass resolution**
   - Validate raw config against composed schema.
   - Instantiate LlmService with resolved config to normalize provider URLs and project/conversation IDs.
4) **Compatibility**
   - Accept legacy config and map into v2 with warnings (e.g., `browser` -> `browserDefaults`, `oracleProfiles` -> `profiles`).
5) **Remove provider logic from config.ts**
   - `resolveBrowserConfig` only shapes browser/process settings.
   - Provider URL resolution moves into LlmService.

## Exit Criteria
- `config.ts` no longer depends on provider adapters.
- `createLlmService` is the single owner of provider URL resolution.
- Legacy configs load with warnings; v2 configs load without warnings.
