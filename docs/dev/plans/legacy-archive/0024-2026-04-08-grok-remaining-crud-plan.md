# Grok Remaining CRUD Plan

This plan tracks the remaining Grok browser surfaces after the WSL-primary acceptance bar went green for:

- project CRUD
- project instructions CRUD
- project knowledge file CRUD
- account-wide `/files` CRUD
- conversation CRUD
- conversation-file read/list parity for both project and non-project conversations
- markdown-preserving prompt capture

The goal now is breadth and durability, not re-proving the already-green core flow.

The canonical end-to-end check is now:

```sh
DISPLAY=:0.0 pnpm test:grok-acceptance
```

That WSL runner is green again after the latest Grok fixes for:
- project-create verification recovery by exact name
- more robust Grok submit/commit handling after uploads
- multiline `ProseMirror` prompt preservation
- broader `/files` page readiness detection
- root/non-project conversation-file list/context/cache parity

## Priority Order

### 1. Conversation Files

Why first:
- This is the largest remaining CRUD gap.
- The cache layer already has `conversation-files` and `conversation-attachments` datasets.
- It is the most likely next place where users will expect parity with project files.

Planned slices:
1. Read/list parity
   - add service + CLI support for `conversations files list`
   - write live results into `conversation-files`
   - allow fallback to conversation context `files[]` when the provider does not expose a dedicated list endpoint
2. Live Grok adapter discovery
   - identify the conversation-level file surface in the current UI
   - capture stable selectors and ids
3. Mutation support
   - upload/add
   - remove/delete
   - refreshed cache/catalog parity after each mutation

Exit criteria:
- live list works for project and non-project conversations
- cache file catalog under `conversation-files` matches the visible conversation surface
- scripted acceptance covers at least one disposable conversation file add/list/remove round-trip

### 2. Conversation Attachments / Asset Manifests

Why second:
- The cache/export layer already models `conversation-attachments`.
- Browser prompt uploads already exist operationally, but they are not yet exposed as a first-class CRUD surface.

Planned slices:
1. clarify semantics:
   - distinguish provider-visible conversation files from local uploaded attachment assets
2. read/export parity:
   - make sure `conversation-attachments` manifests line up with actual uploaded browser assets
3. mutation coverage:
   - if Grok exposes attachment removal in the live UI, wire it to CLI and cache

Exit criteria:
- exported conversation attachment manifests are trustworthy
- file assets can be traced from live conversation state to local cache/export rows

### 3. Account File Management Quality

Why:
- `/files` CRUD works, but quota management still needs richer read semantics.

Planned slices:
1. parse more metadata from `/files`
   - size
   - mime/type
   - updated time if exposed
2. compute usage views
   - total count
   - total size when available
   - obvious duplicate-name clusters
3. add safe cleanup affordances
   - identify likely-orphan account files that are no longer referenced elsewhere

Exit criteria:
- users can inspect account-level file pressure before hitting the Grok 1 GB quota wall

### 4. Cross-Surface Reconciliation

Why:
- Grok may surface the same underlying asset in multiple places:
  - project knowledge
  - conversation files
  - account-wide `/files`

Planned slices:
1. reconcile ids/names/remote URLs across datasets
2. prevent weaker surfaces from overwriting stronger metadata
3. make cache/export output explain cross-surface relationships clearly

Exit criteria:
- cache/catalog views can explain how one provider file appears across Grok surfaces without duplicating or losing metadata

### 5. Secondary Coverage

Not blocking:
- Windows Chrome should remain secondary/manual-debug coverage.
- Do not let it block Grok CRUD completion while the WSL path stays green.

## Immediate In-Progress Slice

Current start point:
- conversation-file read/list/cache parity is now complete enough to use as a stable base:
  - `auracall conversations files list <conversationId> --target grok [--project-id <id>]`
  - `conversations context get ...` includes the same `files[]`
  - `conversation-files/<conversationId>.json` is written with the live result
  - the scripted WSL acceptance runner now verifies this on a disposable non-project conversation

Current shipped mutation support:
- append-only add for conversation files is now live on the WSL Grok path:
  - `auracall conversations files add <conversationId> --target grok --prompt <text> -f <path>`
  - Aura-Call sends a new follow-up turn with attachments, refreshes the live `conversation-files` view from that same browser run, and writes the refreshed result through to cache
  - if the conversation is later deleted, Aura-Call now clears the matching `conversation-files` and `conversation-attachments` cache rows instead of leaving dead file rows behind

Current live finding:
- existing Grok conversations still expose the composer `Attach` button for the next turn
- already-sent conversation file chips open a read-only preview pane with `Close`, not delete/download controls
- so conversation-file mutation may be append-only in practice:
  - add = attach on a new follow-up turn
  - remove/delete of an already-sent conversation file is not currently exposed in the live UI

Next immediate slice:
- conversation attachments / asset manifests
  - identify whether Grok exposes a distinct live attachment surface beyond the visible conversation file chips
  - reconcile any attachment/asset ids with `conversation-files`
  - make export/quota/orphan reporting aware of the distinction
