# Service Volatility Inventory

## Purpose

Inventory the hard-coded, service-specific volatility currently embedded in Aura-Call so the manifest schema is designed from real usage instead of guesses.

This is the prerequisite for implementation under [service-volatility-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-volatility-refactor-plan.md).

## Existing Data-Driven Footholds

The repo already has two useful footholds that should be extended, not bypassed:

- `configs/auracall.services.json`
  - currently stores Grok browser model labels and aliases
- `src/browser/llmService/providers/schema.ts`
  - already defines typed per-service feature schema shapes

Those should inform the manifest architecture.

## Cross-Cutting Volatility

These are not owned by one service alone, but they currently contain service-specific drift:

### Model Alias and Default Resolution

- `src/oracle/config.ts`
  - logical model list
  - current-Pro aliasing
  - API model ids
  - pricing/input-limit metadata
- `src/cli/options.ts`
  - fuzzy model-token interpretation
- `src/cli/browserConfig.ts`
  - browser picker label mapping
- `src/schema/resolver.ts`
  - engine-specific model defaults
- `src/oracle/gemini.ts`
  - Gemini SDK model-id translation map

Manifest ownership candidate:
- `models`

Code ownership retained:
- resolution order
- fallback behavior
- provider compatibility policy

### URL and Compatible-Host Families

- `src/browser/constants.ts`
- `src/browser/urlFamilies.ts`
- `src/browser/service/browserService.ts`

Manifest ownership candidate:
- `routes`
- `hosts`

Code ownership retained:
- tab selection logic
- target matching strategy
- navigation/recovery order

Current status:
- ChatGPT compatible hosts/base URL/cookie origins and route templates are already manifest-backed.
- Gemini base/app URL plus cookie origins are now manifest-backed for central login/default-config consumers.
- Grok base/project/files/conversation route templates are now manifest-backed for central provider URL builders and selected adapter helpers.
- Grok project-conversations route plus browser-runtime/launch fallbacks now also read through manifest-backed helpers in the central adapter/runtime callers.
- Remaining route drift is deeper provider-local workflow usage, especially inside `src/browser/providers/grokAdapter.ts`, and should continue in bounded follow-on slices.

## Service Inventory

## ChatGPT

### Current Hard-Coded Areas

#### Models and Browser Labels

- `src/oracle/config.ts`
  - `CURRENT_OPENAI_PRO_ALIAS`
  - `CURRENT_OPENAI_PRO_API_MODEL`
  - OpenAI GPT model configs
- `src/cli/options.ts`
  - fuzzy mapping of `pro`, `5.1`, `5.2`, `instant`, `thinking`
- `src/cli/browserConfig.ts`
  - `BROWSER_MODEL_LABELS`
  - `normalizeChatGptModelForBrowser(...)`

Manifest ownership candidate:
- `models.aliases`
- `models.browserLabels`
- `models.browserNormalization`

#### Routes and Host Families

- `src/browser/constants.ts`
  - `CHATGPT_URL`
  - `COOKIE_URLS`
- `src/browser/urlFamilies.ts`
  - ChatGPT compatible hosts
- `src/browser/providers/chatgptAdapter.ts`
  - `CHATGPT_HOME_URL`
  - `CHATGPT_COMPATIBLE_HOSTS`
  - project and conversation route templates

Manifest ownership candidate:
- `routes.baseUrl`
- `routes.cookieOrigins`
- `routes.compatibleHosts`
- `routes.project`
- `routes.conversation`

#### Selector Families and Static UI Labels

- `src/browser/providers/chatgpt.ts`
  - input/send/model/menu/copy/file/attachment selectors
- `src/browser/providers/chatgptAdapter.ts`
  - project dialog selectors
  - settings labels
  - tagged row/action attributes
  - tab ids/labels
  - generic dialog text matches
- `src/browser/constants.ts`
  - prompt/action/menu/upload selectors derived from ChatGPT provider config

Manifest ownership candidate:
- `selectors`
- `labels`
- `dom`

Code ownership retained:
- open/fallback order
- row tagging strategy
- DOM extraction execution

Current status:
- provider-level ChatGPT selector families now read from `configs/auracall.services.json`
- low-risk ChatGPT UI labels / label sets now read from `configs/auracall.services.json`
- selected static DOM anchors now also read from `configs/auracall.services.json`
- remaining work in this area is the adapter-local selector family/drift layer beyond those named anchors, not the provider config layer

#### Feature and Connected-App Fingerprints

- `src/browser/llmService/providers/schema.ts`
  - `web_search`
  - `deep_research`
  - `company_knowledge`
  - `apps`
- `src/browser/providers/chatgptAdapter.ts`
  - known app token dictionary for feature signature probing
  - feature detector version string

Manifest ownership candidate:
- `features.flags`
- `features.appTokens`

Code ownership retained:
- probe execution
- merge strategy with configured features
- cache invalidation policy

#### Artifact Classification

- `src/browser/providers/chatgptAdapter.ts`
  - sandbox artifact classification
  - spreadsheet extension mapping
  - image/canvas/download/spreadsheet kind normalization
  - DOM download button classification

Manifest ownership candidate:
- `artifacts.kinds`
- `artifacts.extensionRules`
- `artifacts.payloadMarkers`

Code ownership retained:
- payload parsing
- download transport/materialization
- DOM merge logic

Current status:
- low-risk ChatGPT artifact taxonomy now reads from `configs/auracall.services.json`, including spreadsheet-vs-download extension rules, content-type-to-extension mappings, extension-to-MIME mappings, default image/spreadsheet/canvas titles, and the bounded payload markers used for image/table classification
- remaining work in this area is the behavioral layer: payload recursion, merge semantics, DOM probe normalization, and binary materialization/transport decisions

#### Rate-Limit Tuning

- `src/browser/chatgptRateLimitGuard.ts`
  - cooldown values
  - mutation weights
  - quiet windows
  - action-specific weight/quiet policy
- `src/browser/providers/chatgptAdapter.ts`
  - provider-local recovery pause

Manifest ownership candidate:
- `rateLimits`

Code ownership retained:
- persisted guard state
- cooldown enforcement
- dialog dismissal/retry mechanics

## Grok

### Current Hard-Coded Areas

#### Browser Model Labels

- `configs/auracall.services.json`
  - current Grok browser model labels and aliases
- `src/services/registry.ts`
  - model registry loading and label resolution
- `src/browser/providers/grokModelMenu.ts`
  - label normalization function

Manifest ownership candidate:
- extend the existing services registry or fold it into the broader service manifest format

Code ownership retained:
- registry loader
- normalization execution

#### Routes and Host Families

- `src/browser/constants.ts`
  - `GROK_URL`
- `src/browser/urlFamilies.ts`
  - Grok compatible hosts
- `src/browser/providers/grokAdapter.ts`
  - `GROK_HOME_URL`
  - `GROK_FILES_URL`
  - `GROK_PROJECTS_INDEX_URL`
  - project/file URL expectations

Manifest ownership candidate:
- `routes.baseUrl`
- `routes.files`
- `routes.projectIndex`
- `routes.compatibleHosts`

#### Selector Families and UI Labels

- `src/browser/providers/grok.ts`
  - provider selector families
- `src/browser/providers/grokAdapter.ts`
  - sidebar/menu/title/source/file selectors
  - button aria-label assumptions
  - generic title heuristics

Manifest ownership candidate:
- `selectors`
- `labels`

Code ownership retained:
- row/menu interaction strategy
- visibility/focus logic
- scraper execution

#### Feature Flags

- `src/browser/llmService/providers/schema.ts`
  - `search`
  - `sources`
  - `apps`

Manifest ownership candidate:
- `features.flags`
- later, `features.appTokens` if Grok app probing grows beyond config-only flags

#### Conversation/File Heuristics

- `src/browser/providers/grokAdapter.ts`
  - generic conversation title list
  - file row parsing assumptions

Manifest ownership candidate:
- `artifacts`
- `conversationHeuristics`

Code ownership retained:
- parsing/extraction functions
- preference ordering for duplicate rows

## Gemini

### Current Hard-Coded Areas

#### API and Web Model IDs

- `src/oracle/gemini.ts`
  - API model-id map
- `src/gemini-web/client.ts`
  - `GeminiWebModelId`
  - per-model request headers
- `src/gemini-web/executor.ts`
  - web model fallback rules

Manifest ownership candidate:
- `models.aliases`
- `models.apiIds`
- `models.webIds`
- `models.webHeaders`

#### Routes and Host Families

- `src/browser/urlFamilies.ts`
  - Gemini compatible hosts
- `src/gemini-web/client.ts`
  - app URL
  - generate/upload endpoints
- `src/gemini-web/executor.ts`
  - URL validation policy

Manifest ownership candidate:
- `routes.baseUrl`
- `routes.compatibleHosts`
- `routes.generate`
- `routes.upload`

Code ownership retained:
- request execution
- validation and fallback behavior

#### Browser/Auth Surface

- `src/gemini-web/executor.ts`
  - cookie names
  - required-cookie policy
  - Google origin list
- `src/browser/login.ts`
  - Gemini login URLs

Manifest ownership candidate:
- `auth.cookieNames`
- `auth.requiredCookies`
- `auth.origins`
- `routes.loginHints`

Code ownership retained:
- cookie loading
- auth validation behavior

#### Feature Flags

- `src/browser/llmService/providers/schema.ts`
  - `search`
  - `grounding`
  - `apps`

Manifest ownership candidate:
- `features.flags`

## Recommended First Extraction Slice

The lowest-risk first slice is ChatGPT, but only for:

- model aliases
- browser model labels
- route templates
- compatible hosts
- feature/app token definitions used by cache signatures

Do not start with ChatGPT selectors, artifact rules, or rate-limit tuning. Those are higher-churn and more tightly coupled to workflow code.

## Follow-On Planning Requirement

Before implementation starts:

1. write the service-specific plan for the chosen service
2. name the exact regression suite
3. name the required acceptance gate

Current first service plan:
- [service-volatility-chatgpt-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-volatility-chatgpt-plan.md)
