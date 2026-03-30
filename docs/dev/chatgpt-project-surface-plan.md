# ChatGPT Project Surface Plan

Goal: record the now-finished ChatGPT project-management surface after core project lifecycle CRUD stabilized on the managed WSL Chrome path.

Current status:
- implemented: canonical `g-p-...` route handling, project list/create/rename/delete, create-time memory mode, browser-derived cache identity via `/api/auth/session`, `projects files list|add|remove --target chatgpt`, `projects instructions get|set --target chatgpt`
- not implemented: `projects clone --target chatgpt`
- next active surface: [chatgpt-conversation-surface-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/chatgpt-conversation-surface-plan.md)

## Phase 1. Sources DOM Recon

Use the authenticated managed ChatGPT project page and map the current `Sources` surface before adding adapter code.

Questions to answer:
- which route/tab owns the project source inventory
- whether rows expose stable ids or only visible labels
- whether add/remove flows live on the `Sources` tab, the project settings gear, or both
- whether post-upload success can be verified from the visible list without trusting transient toast text

Deliverable:
- a short journal entry with the stable selectors/labels/flows observed on the live surface

## Phase 2. Project Sources/File CRUD

Status: complete on the managed WSL Chrome path.

Implement the remaining project file surface in `src/browser/providers/chatgptAdapter.ts`.

Required behavior:
- `listProjectFiles(projectId)`
- `uploadProjectFiles(projectId, filePaths)`
- `deleteProjectFile(projectId, fileNameOrId)`
- preserve the canonical-id rule: only `g-p-...` values are authoritative ChatGPT project ids
- verify upload/remove by refreshed visible list state, not only event dispatch or toast presence

Service/CLI expectations:
- reuse the existing generic `projects files ...` CLI surface
- write through to the project file cache once live list/add/remove succeed
- do not regress current create/rename/delete flows

Delivered:
- `auracall projects files add <projectId> --target chatgpt --file <path>`
- `auracall projects files list <projectId> --target chatgpt`
- `auracall projects files remove <projectId> <fileName> --target chatgpt`
- upload/remove now verify success across a fresh `Sources` reload instead of trusting only the immediate post-picker row
- nested `projects files ...` and `projects instructions ...` commands now inherit `--target` the same way the parent `projects` commands do

## Phase 3. Project Instructions

Status: complete on the managed WSL Chrome path.

Use the same project settings surface to add:
- `getProjectInstructions(projectId)`
- `updateProjectInstructions(projectId, instructions)`

Delivered:
- `auracall projects instructions set <projectId> --target chatgpt --file <path>`
- `auracall projects instructions set <projectId> --target chatgpt --text <value>`
- `auracall projects instructions get <projectId> --target chatgpt`
- write success is verified by reopening the same settings sheet and confirming the persisted textarea value
- create-with-instructions now uses the same verification path instead of trusting only the first settings edit pass

Acceptance notes:
- prefer the existing browser-service interaction helpers instead of provider-local click glue
- verify the textarea or saved instructions value after write before returning success

## Phase 4. Project Clone

Only implement clone if the current ChatGPT UI exposes a real project-clone surface.

Rules:
- do not fake clone via export/recreate
- if clone is not present, document that explicitly and stop rather than inventing a non-native behavior

Status:
- deferred/closed until the native UI exposes a real clone action

## Phase 5. Live Disposable Acceptance

Run one disposable end-to-end pass on the authenticated WSL Chrome profile:
- create disposable project
- add source/file
- list sources/files
- remove source/file
- set/get instructions
- rename
- delete
- confirm no disposable leftovers remain

## Risks And Watchpoints

- ChatGPT may expose only row labels, not stable file ids; if so, delete needs careful same-name behavior
- the settings gear already required ordered interaction strategies, so the `Sources` surface may too
- uploader success must be tied to the refreshed list, not trusted from transient upload UI alone
- if the surface broadens beyond strict CRUD, keep cache/catalog behavior aligned with the live visible list instead of speculative hidden APIs

## Immediate Next Step

Project management is green enough to move on. Continue in [chatgpt-conversation-surface-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/chatgpt-conversation-surface-plan.md).
