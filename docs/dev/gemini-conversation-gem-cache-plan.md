# Gemini Conversation, Gem, and Cache Plan

## Purpose

Define the bounded plan for bringing Gemini browser conversation and Gem
surfaces up to the same CRUD/cache integration standard already expected from
ChatGPT and Grok, without pretending Gemini should literally copy their UI.

This plan is intentionally about:

- conversation CRUD
- Gem-as-project CRUD
- cache integration and freshness

It is not a plan for:

- more Gemini attachment transport work
- Gemini API parity
- a broad Gemini browser rewrite

## Working model

For Aura-Call architecture purposes:

- Gemini `Gems` should map onto the existing generic `Project` domain
- Gemini chats should map onto the existing generic `Conversation` domain
- Gemini browser state should write through to the existing provider cache
  datasets, not invent Gemini-only cache families

That means the target cache families stay:

- `projects.json`
- `conversations.json`
- `project-conversations/<projectId>.json`
- `contexts/<conversationId>.json`
- `conversation-files/<conversationId>.json`
- `conversation-attachments/<conversationId>/manifest.json`
- `project-knowledge/<projectId>/manifest.json`
- `project-instructions/<projectId>.json`

## Current state

What Gemini already has:

- strong browser prompt support:
  - text
  - native file upload
  - native image upload
  - YouTube
- runtime-profile/browser-profile alignment
- login/doctor/session semantics aligned with Aura-Call runtime profiles
- browser-native upload workflow now using extracted browser-service mechanics

What Gemini does not yet have in the same way ChatGPT/Grok do:

- Gem list/create/rename/delete
- Gem instructions CRUD
- Gem knowledge/file CRUD
- conversation list/read/rename/delete
- conversation cache mirroring
- project/Gem-scoped conversation catalog parity
- disposable acceptance coverage for project/Gem + conversation CRUD

## Architectural constraints

### 1. Keep Gemini-specific UI semantics local

Browser-service should own mechanics only.

Gemini adapter code should own:

- Gem selectors and route rules
- Gemini conversation selectors and route rules
- Gemini-specific rename/delete surfaces
- Gemini-specific wording and diagnostics

### 2. Reuse the generic provider/cache model

Do not introduce:

- `gems.json`
- `gem-conversations/`
- any Gemini-only alias cache family

Internally, Gemini may expose `Gem`, but Aura-Call should normalize it to the
generic `Project` + `Conversation` cache and CLI model.

### 3. Match Grok/ChatGPT behavior at the domain level, not the DOM level

Required parity means:

- generic `projects ...` commands work against Gemini Gems
- generic `conversations ...` commands work against Gemini chats
- caches become trustworthy and refreshable

It does not mean:

- Gemini must share the same UI affordances as ChatGPT/Grok

## Scope split

### Shared/runtime-owned

- cache dataset names and export/search integration
- provider selection / AuraCall runtime profile selection
- generic CLI surfaces:
  - `projects ...`
  - `conversations ...`
- browser-service mechanics

### Gemini-owned

- Gem list/create/rename/delete flow
- Gem instructions and knowledge/file surfaces
- Gemini conversation list/read/rename/delete flow
- Gemini-specific route extraction and post-condition verification

## Recommended slice order

## Slice 1. Gemini Gem and conversation DOM recon

Goal:
- identify the real Gemini surfaces before any CRUD code lands

Questions to answer:

- what is the authoritative Gem list surface
- whether a Gem has a stable id in routes/links/DOM
- whether Gemini exposes:
  - Gem create
  - Gem rename
  - Gem delete
  - Gem instructions/custom behavior
  - Gem file/knowledge surface
- what is the authoritative conversation list surface:
  - global
  - Gem-scoped
- whether current conversation ids are stable in `/app/...` routes
- whether rename/delete live on row menus, header menus, or settings sheets

Deliverable:
- one DOM recon note folded into this plan or dev journal

Exit criteria:
- enough live evidence to name the authoritative list/action surfaces

## Slice 2. Gemini Gem CRUD as generic project CRUD

Goal:
- make `projects --target gemini` work through the Gemini Gem surface

Target behavior:

- `listProjects(...)`
- `createProject(...)`
- `renameProject(...)`
- `deleteProject(...)`

Likely rules:

- normalize Gemini Gem ids into the generic `Project.id`
- verify create/rename/delete from refreshed visible list state or route state,
  not only click success
- only add clone if Gemini exposes a real native clone surface

Cache requirement:

- write through to `projects.json`

Exit criteria:

- disposable Gem create/list/rename/delete round-trip
- cache reflects the refreshed live Gem catalog

## Slice 3. Gemini Gem instructions and knowledge/file CRUD

Goal:
- match the current generic project surfaces where Gemini has a real equivalent

Target behavior if the UI supports it:

- `getProjectInstructions(...)`
- `updateProjectInstructions(...)`
- `listProjectFiles(...)`
- `uploadProjectFiles(...)`
- `deleteProjectFile(...)`

Important rule:

- only implement Gem instructions/knowledge if Gemini exposes a real durable
  Gem-level surface
- do not fake Gem knowledge by stuffing files into ordinary conversations

Cache requirement:

- instructions:
  - `project-instructions/<projectId>.json`
- Gem knowledge/files:
  - `project-knowledge/<projectId>/manifest.json`

Exit criteria:

- one disposable Gem proves instructions and/or knowledge round-trip if the
  native UI supports them
- unsupported surfaces are documented explicitly if absent

## Slice 4. Gemini conversation CRUD

Goal:
- make `conversations --target gemini` trustworthy and cache-backed

Target behavior:

- `listConversations(...)`
- `readConversationContext(...)`
- `renameConversation(...)`
- `deleteConversation(...)`

Required distinctions:

- global conversations
- Gem-scoped conversations if Gemini exposes a true Gem-local conversation
  catalog

Cache requirement:

- global:
  - `conversations.json`
- Gem-scoped:
  - `project-conversations/<projectId>.json`
- context:
  - `contexts/<conversationId>.json`

Exit criteria:

- disposable conversation create/read/rename/delete round-trip
- project/Gem-scoped cache split only if Gemini actually exposes it

## Slice 5. Conversation files, attachments, and cache mirroring

Goal:
- align Gemini’s attachment/file behavior with the existing generic cache model

Important distinction:

- durable conversation-visible files
- local prompt attachments/assets

Target behavior:

- `listConversationFiles(...)` only if Gemini exposes a stable sent-chat file
  surface
- `conversation-attachments` should continue to track the local uploaded asset
  side where that is the stronger truth

Cache requirement:

- `conversation-files/<conversationId>.json`
- `conversation-attachments/<conversationId>/manifest.json`

Exit criteria:

- cache meaning is explicit and trustworthy
- do not claim post-send delete if Gemini does not expose it natively

## Slice 6. Gemini disposable acceptance

Goal:
- define the Gemini browser acceptance bar the same way Grok/ChatGPT already
  have one

Minimum target coverage:

- Gem list/create/rename/delete
- Gem instructions and knowledge/files if supported
- conversation list/context/rename/delete
- cache freshness after live reads/mutations
- cleanup with no disposable leftovers

Acceptance rule:

- run one AuraCall runtime profile / browser profile pairing at a time
- keep WSL Chrome primary

## Decision rules

### If Gemini lacks a real Gem surface

Stop and record:

- Gemini supports conversations only
- generic `projects --target gemini` remains unsupported

### If Gemini has Gems but no durable knowledge/files or instructions

Implement:

- Gem CRUD

Do not implement:

- fake project instructions
- fake project knowledge

### If Gemini has no Gem-scoped conversation catalog

Keep:

- global `conversations.json`

Do not invent:

- `project-conversations/<projectId>.json` entries from heuristic URL grouping

## Recommended immediate next step

Start with Slice 1 only:

- live DOM recon for:
  - Gem catalog
  - Gem create/settings/actions
  - conversation list surfaces
  - conversation route/id extraction

Do not start CRUD code before that recon is written down.
