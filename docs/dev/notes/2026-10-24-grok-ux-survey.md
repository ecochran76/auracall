# Grok UX and DOM survey — 2026-10-24

Status: survey complete; implementation and provider mutation acceptance pending.
Source baseline: `1b9197a06`; branch `docs/grok-ux-survey-20261024`.
Scope: existing Grok code, ChatGPT traffic/live-follow comparison, and signed-in
Grok UI inspection on the default AuraCall runtime profile.

## Evidence and boundaries

Opened through `pnpm tsx scripts/browser-tools.ts --auracall-profile default
--browser-target grok tabs --json`. The resolver launched the existing managed
browser profile for default/grok with stock Chrome; its startup performed its
normal stale-lock/session quarantine handling. Initial page: `https://grok.com/`,
complete and visible, no blocking state. Targeted CDP inspection reused that same
page and port. Source was surveyed with CodeGraph and focused source excerpts.

Private DOM captures and screenshots are retained outside Git at
`~/.local/state/auracall/grok-survey-20261024/`. They include account-specific
chat/file/installed-plugin details and must not be copied into shared fixtures.
Capture names: models, attach, chats, plugins, new-menu, bots, bot-editor,
bot-form-fields, skills, connector-detail, composer-app-mention, composer-slash,
recent-files, final-home; screenshots: connector-detail.png and home.png.

Inspection opened menus, plugin tabs, connector detail, blank custom-connector
and Bot creation dialogs. Typed transient `@` and `/` into the empty composer,
then removed them. No prompt submitted, file uploaded/attached, connector
installed/disconnected/reauthenticated, Bot created/installed, or terms accepted.
Browser remains open on the home page with Fast preserved and composer empty.
No existing conversation was opened; chat transcript/action behavior is source
surveyed, not live accepted. No rate limit was deliberately provoked.

## Current DOM algorithms

| Surface | Existing algorithm and source | Maintenance implication |
| --- | --- | --- |
| Login/readiness | `actions/grok.ts:75` checks sign-in URL, not-found/guest CTAs and signed-in identity; prompt readiness polls visible enabled textarea/ProseMirror candidates every 250ms. | Preserve positive identity evidence; a usable editor alone is insufficient. |
| Composer | `providers/grok.ts:6` prefers textarea labels/placeholders then ProseMirror/contenteditable. `actions/grok.ts:164` dispatches pointer/mouse events, focuses and clears input, inserts with CDP; multiline contenteditable prefers DOM injection, verifies normalized text and uses a fallback before throwing. | Live editor is ProseMirror with Ask Grok anything; role changes between textbox and combobox. Add token-aware state rather than flattening app/Bot/skill mentions into plain text. |
| Submit | `actions/grok.ts:301` waits up to 10s for a visible enabled submit button; clicks once, waits 600ms, treats increased response count/disabled submit/empty composer as commit, otherwise sends Enter. | Generic submit fallback can target another form. Disabled-state read currently selects enabled buttons first. Strengthen attribution and uncertain-submit handling before fallback to avoid duplicate sends. Not live exercised here. |
| Model | `actions/grok.ts:408,867` resolves registry labels, opens model trigger, falls back to two Tabs plus Space, finds normalized prefix match inside menu (or globally), clicks; misses only log and return. | Scope to the visible authoritative menu, distinguish entitlement, fail explicit selection on miss and reopen/read aria-checked after success. Keyboard fallback is layout-sensitive. |
| Response | `actions/grok.ts:470,573` captures a baseline; polls every 500ms; new assistant count or longer same-count text establishes new content. Two stable signatures return text/Markdown/HTML. CSS role/bubble selectors and exclusions remove thinking/action/follow-up controls; visible alert/status/toast text detects limits. | A one-second stable pause is not terminal-generation evidence. Same-length replacements and resumed streaming need coverage. Add explicit streaming/terminal/error states and durable turn identity. |
| Upload | `actions/grok.ts:526` finds file input, sets each path, waits up to 10s for basename anywhere in body; missing name logs and proceeds. | Require exact composer attachment identity, upload readiness and error state; duplicate basenames cannot prove attachment. |
| Projects | `grokAdapter.ts:3616` navigates project index, scrapes project URLs from main/nav/aside/body, deduplicates IDs, falls back home if empty. Project creation tags visible name dialogs; sources/files helpers select Sources, expand files, verify persisted names. | Avoid redundant navigation and distinguish empty inventory from failure. These project mutations were not exercised. |
| Chats/history | `grokAdapter.ts:3755` merges open tabs, sidebar and optional bounded history, overlays cached conversations through GrokService. Project list is scoped to project page, with optional history fallback. `clickHistoryMenuItem:8867` tries History aria/text twice after sidebar expansion. `openHistoryDialog:10449` verifies dialog; Show All expansion reads conversation links/data-value IDs. | Live opener is Chats, so History-only discovery is stale. Scope row actions to exact chat IDs; report partial/history coverage and retain project scope. |
| Files | Account files use `/files`, URL-derived IDs and row probes; conversation/project files and contexts are separate adapter paths. Account removal tags exact row, hovers for Delete file, optionally confirms or handles staged Delete. | Existing row anchoring should be retained. Recent-file chooser requires stable IDs, not repeated display names. File deletion/download not live exercised. |
| Workbench | `workbench/grokDiscovery.ts:40` derives Imagine image/video capabilities only; adapter `runPrompt:3430` restricts execution to Imagine capabilities and rejects attachments. Ordinary text prompt execution is separately in browser/index.ts. | Extend discovery/contracts to chat composer, Build, plugins and Bots without conflating these execution paths. |

Additional source candidate: in the generated assistant snapshot expression,
`readToastText()` can run before the `const normalizeText` initializer when no
assistant bubble exists (`actions/grok.ts:600`). A visible matching toast node
can therefore raise a temporal-dead-zone error. Reproduce with a sanitized
provider-free DOM fixture before treating this as a confirmed runtime defect.

## Observed UX

| Requested area | Live observation | Indicated work |
| --- | --- | --- |
| Chats | Sidebar button aria-label Chats opens Command Menu with search combobox, Chats/Media tabs, Actions, Show All, grouped dated rows and conversation previews. | Update opener and verify bounded loading/search/preview/action algorithms on sanitized fixtures. Do not count visible rows as complete account history. |
| Prompt composer/workbench | ProseMirror editor; Attach, Fast model trigger, dictation, voice and Private Chat switch. `@` shows Bots and Connectors plus Create a new Bot. `/` shows modes Auto/Fast/Expert/Build and Skills. | Discover active mode, selected Bot, connectors and skills; insert/select tokens with readback and preserve multiline text. Keep dictation/voice/private-mode support separate feature decisions. |
| Current models | Menu lists Auto, Fast (aria-checked true), Expert, Build, Heavy. Heavy has Requires SuperGrok Heavy text. | Bundled `configs/auracall.services.json:584` lists Auto/Fast/Expert/Heavy but omits Build. Treat these as observed UI labels, not proof of underlying model version or successful execution. |
| File/app chooser | Attach menu: Upload a file, Add to project, Recent files, Skills, Connectors. Recent files opens submenu containing repeated basenames. | Separate local uploads, existing files, project assignment and plugin selection. Enumerate stable identity and readiness; do not infer identity from filename. |
| Apps/plugins | Sidebar Plugins opens Connectors/Skills/Bots dialog. Connectors separates Connected from catalog categories and Add actions. Existing connector detail shows Reauthenticate, Disconnect, tool names, All tools enabled, See more and Server URL. | Add inventory/detail/search, catalog versus installed state, exact endpoint matching, tool capability/readback and explicit lifecycle commands. Expanded tools must have coverage metadata. |
| Custom MCP | New Connector opens nested dialog with custom connector option and form: Name, Server URL; placeholders My Connector and https://mcp.example.com/sse; Cancel and Add Connector. Existing connector detail also shows an `/mcp` endpoint. | Implement exact-name/URL install, URL validation, OAuth/human continuation, post-install identity/catalog readback and uncertain-outcome reconciliation. Placeholder does not prove SSE-only transport; authentication/transport matrix remains untested. |
| Skills | Personal skills plus built-in document/PDF/presentation/spreadsheet and Skill Creator entries; slash chooser exposes skill commands. | Add discovery and invocation; separately qualify import/edit/delete. Grok skills are a related gap, distinct from local agent skills. |
| Bots | Searchable catalog with categories, featured cards, authors, descriptions and Add actions; New Bot opens Create Bot with avatar controls, name input, Terms link, Create Bot and Close. Existing personal Bots appear in @ chooser. | Separate catalog/install from owned Bots and creation. Add identity, inspect/select/invoke, then explicit create/update/delete and configuration/readback as separately qualified operations. No post-creation settings or Bot scheduler behavior was inspected. |

“Apps” needs two concepts in the public contract: external Connectors under
Plugins and generated apps in Build mode. The home-page hint explicitly says
Switch to Build Mode to create apps. Build execution/artifacts were not tested.

## Rate limits and live-follow comparison

Existing Grok safeguards are real but narrower than the current ChatGPT path:

- `browser/index.ts:1197-1370` uses profile-scoped simple-provider guard JSON;
  default detected cooldown five minutes, maximum automatic wait 30 seconds,
  write spacing 12 seconds (also an eight-second post-commit quiet constant).
  Relative retry text accepts integer seconds/minutes/hours. Detection is driven
  by error text and visible response toasts; successful mutations retain active
  cooldown fields.
- `simpleProviderGuard.ts:46` persists
  `cache/providers/grok/__runtime__/rate-limit-<profile>.json`.
- Shared browser-service `providerTrafficGovernor.ts:187` already supplies lease
  assertion, persisted action start/complete, warning freezing and optional backend
  request admission. Reuse this interface; do not invent another independent
  Grok traffic ledger or assume its generic existence proves Grok wiring.
- Current ChatGPT utility service routes reads/writes through governed affinity
  operations; GrokService has the simpler buildListOptions/provider dispatch path.
  `accountMirror/refreshService.ts:1359` explicitly returns null for persisted
  cooldown readback when provider is not ChatGPT. Target census has ChatGPT warning
  handling and Gemini anti-bot handling; no equivalent Grok visible-warning branch.
- Collector detail handling (`chatgptMetadataCollector.ts:2960`) gives ChatGPT
  chunking, retained provider sessions, zero retry/cache fallback and explicit
  governor resolution. Grok does not get these branches. Preserve existing
  provider-specific collection behavior until a deliberate Grok contract replaces it.
- Plan0415 is historical diagnosis and still marked OPEN; current shared governor
  source now includes optional backend request admission. Do not repeat its older
  “no request admission exists” conclusion as current fact. Operations, network
  requests and response observations remain separate measurement units.

## Ranked maintenance and feature backlog

| Priority | Slice | Acceptance needed |
| --- | --- | --- |
| P0 | Grok shared-account traffic governance across text prompts, utility CRUD, discovery, uploads, plugins/Bots and live-follow. | Synthetic concurrent callers sharing stores; visible warning freezes all later admissions; distinct operation/request caps, durable cooldown reasons, exact account/profile/target attribution; preserve serialized mode. |
| P0 | Live-follow parity and instrumentation. | Preflight/poll warning probes, persisted cooldown/status/next eligible time, bounded retries and cancellation, partial/resumable inventory, per-phase counts and reasons, no cached success masking failed live reads. Verify scoped native request coverage before claiming parity. |
| P0 | Repair Chats opener and explicit model selection; add Build discovery. | Current Chats dialog fixtures; selected-state/entitlement readback; missing/ambiguous models reject; preserve current model strategy. |
| P0 | Submit, upload and response completion hardening; toast source candidate. | Delayed commit/unknown outcome never re-sends blindly; exact attachment ready; paused streaming not terminal; new turn identity; first-turn visible-toast fixture. |
| P1 | Connector inventory and custom MCP lifecycle. | Distinguish installed/catalog/unavailable/incomplete; exact endpoint/account; prepare/install/readback; OAuth continuation; no blind retry on ambiguous installation; inspect tools and reauth/disconnect independently. |
| P1 | Bot inventory, selection and invocation. | Stable owned/catalog identity; author/provenance; @ token readback; isolated Bot context; response/artifact provenance; explicit confirmation for external actions or schedules. |
| P1 | Bot creation and maintenance. | Create/configure/update/remove with exact readback and uncertain outcome handling. Discover post-create settings through a separately authorized canary; do not assume connector/skill/schedule semantics. |
| P1 | Composer plugins/files/skills workbench. | Structured @ and / selection, recent files by ID, selected-token projection, fresh capability snapshots; UI/API/CLI/MCP contracts agree. |
| P2 | Build generated-app capability and artifacts. | Discover availability, invoke explicitly, bind app/artifact to owning conversation, distinguish preview/export/publish. No publish authority from preview. |
| P2 | DOM drift diagnostics and reusable controls. | Scoped visible dialogs/menu items, nested-dialog back/close, bounded sanitized fixtures, feature snapshot/diff; no raw chat/account data in Git or aggregate telemetry. |

Recommended sequence: source-only P0 fixtures and shared Grok governor wiring,
then read-only connector/Bot inventory, then one explicitly selected install/create
canary per lifecycle. No quota numbers or provider mutations are approved by this
survey. Broader feature implementation remains open.

## Validation and memory disposition

DOM and screenshots prove the listed visible surfaces on this account/date;
source inspection proves described algorithms only. No implementation tests were
run because this is a documentation-only survey. Validate document links and
`git diff --check` before checkpointing. Raw evidence is intentionally private
and reproducible by the exact default-profile browser-tools command above.

Memory disposition: forbidden — no explicit user request to save agent memory;
repository notes are the requested survey record. A non-write receipt is retained
with the private evidence. Graphiti discovery was advisory, not runtime proof.
