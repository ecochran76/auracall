# ChatGPT Conversation Surface Plan

Goal: record the work that closed the ChatGPT browser MVP after project-management CRUD stabilized on the managed WSL Chrome path. Active post-MVP polish is tracked separately in [chatgpt-polish-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/chatgpt-polish-plan.md).

Guardrails:
- keep live validation on non-Pro tiers for this account
- treat file upload as the normal attachment path, not a composer-tool alias
- do not invent non-native behavior if the current ChatGPT UI does not expose it

Current status:
- implemented:
  - browser-mode semantic model selection (`Instant`, `Thinking`, `Pro`)
  - browser-mode thinking depth (`Standard`, `Extended`)
  - browser-mode composer tool/add-on selection for the current `Add files and more` surface
  - existing-conversation composer-tool state inspection/persistence (`browser.runtime.composerTool`)
  - project lifecycle CRUD
  - project memory mode
  - project sources/files CRUD
  - project instructions CRUD
  - root conversation CRUD
  - project-scoped conversation CRUD anchored to the project page `Chats` panel
  - conversation-file read parity
  - conversation source/artifact parity, including downloadable `sandbox:/...` outputs, generated image artifacts, spreadsheet/table artifacts, DOM-only assistant-turn `button.behavior-btn` artifacts, and canvas/textdoc blocks
  - opt-in conversation artifact materialization via `auracall conversations artifacts fetch <conversationId> --target chatgpt` for generated images, inline table artifacts, and DOM-enriched canvas/textdoc text
- closed:
  - project clone is not part of the active plan unless the native UI later exposes a real clone action
- post-MVP polish:
  - deeper conversation-tool state coverage beyond the current acceptance bar
  - a broader live smoke across very large button-backed DOCX/ZIP/JSON/MD bundle chats
  - a fresh logged-in live canvas sample for ongoing smoke validation

## Phase 1. Conversation DOM Recon

Use the authenticated managed ChatGPT conversation surfaces, not project pages, and map:
- root conversation list/sidebar
- current conversation route and stable id extraction
- rename/delete surfaces for existing conversations
- any split between home/sidebar actions and in-conversation actions

Questions to answer:
- which surface is authoritative for list vs rename/delete
- whether conversation actions are row-menu based, header-menu based, or both
- whether route changes are reliable enough to use as post-conditions
- whether current conversation ids are always extractable from `/c/<id>` routes

Observed authority split:
- root conversations: the home/root conversation list is authoritative for rename/delete postconditions, and a successful rename currently causes the same conversation id to bubble to the top of that list after a short 1-2 second lag
- project conversations: the project page conversation list is authoritative; the small sidebar subset shown while a project is selected is not a complete project-chat catalog

Deliverable:
- a short journal entry naming the stable labels, routes, and action surfaces observed live

## Phase 2. Conversation CRUD

Implement in `src/browser/providers/chatgptAdapter.ts`:
- `listConversations(...)`
- `getConversationContext(...)`
- `renameConversation(...)`
- `deleteConversation(...)`

Requirements:
- verify rename from the authoritative refreshed list state, not only an edit event
- for root chats, treat the renamed conversation id moving to the top of the root list with the new title as the success signal
- verify delete from refreshed visible list state, not only route movement
- prefer current browser-service interaction helpers over provider-local click glue
- keep current project flows unchanged

Acceptance:
- a disposable conversation can be created by a browser run, listed, renamed, read back, and deleted cleanly
- root and project-scoped conversations both use their authoritative list surfaces (`/` root list vs project page `Chats`)

## Phase 3. Conversation Attachments/Files

Map and implement the current ChatGPT attachment surfaces for conversations:
- file add/upload in the composer
- sent-turn attachment/file listing
- any delete/remove affordance if the live UI exposes one

Questions to answer:
- whether already-sent files are removable or only visible/read-only
- whether attachment identity is stable enough for remove by id vs filename
- whether sent-turn files should be stored as `conversation-files`, `conversation-attachments`, or both

Requirements:
- keep `--file` as the authoritative upload path
- verify upload from refreshed visible chips/turn state, not a transient picker/toast
- do not claim delete support if the current ChatGPT UI only exposes read-only file chips

## Phase 4. Existing-Conversation Tool/Add-On State

The current composer surface mixes tools, sources, and file-related rows. Add explicit rules for existing conversations:
- how to detect the currently selected composer tool/add-on
- how to switch tools on an existing conversation without confusing unrelated menus
- how to verify tool state when a pill/chip is absent and the current truth only lives in the reopened menu

Requirements:
- keep file upload/source rows separate from true tool/add-on selection
- use the current top-level + `More` menu inventory as the baseline

## Phase 5. Scripted ChatGPT Acceptance

Add a live acceptance runner after the above surfaces are green.

Target coverage:
- semantic model selection
- thinking depth selection
- composer tool selection
- project CRUD
- conversation CRUD
- attachment/file add/read behavior
- cleanup of disposable project/conversation artifacts

Pass criteria:
- one clean WSL managed-profile run
- no disposable leftovers
- no Pro usage on this account

## Risks And Watchpoints

- ChatGPT frequently exposes multiple visible menus at once; menu family scoping is part of correctness, not just diagnostics
- the same `Add files and more` menu mixes true tools with source/file rows, so browser behavior must not flatten them into one semantic bucket
- route changes can lag real destructive success; visible list state should stay authoritative for delete verification
- if conversation attachment delete is not present in the native UI, document that explicitly and stop instead of inventing pseudo-delete behavior

## Status — 2026-03-29

Completed:
- Phase 1 DOM recon
  - root/sidebar row menu exposes `Rename`, `Move to project`, `Pin chat`, `Archive`, `Delete`
  - open-conversation header menu exposes `Share`, `View files in chat`, `Move to project`, `Pin chat`, `Archive`, `Delete`
  - ChatGPT root/sidebar titles can truncate long conversation titles, so title-based live filters should not assume the full original prompt survives in the sidebar
- Phase 2 conversation CRUD
  - `listConversations(...)`
  - `readConversationContext(...)`
  - `renameConversation(...)`
  - `deleteConversation(...)`
  - live WSL non-Pro pass proved:
    - create disposable root conversation
    - list by refreshed sidebar state
    - read user/assistant context
    - rename and verify refreshed title
  - status update after the next guarded acceptance pass:
    - root rename is re-proven live after moving it fully onto the sidebar-row `Open conversation options for ...` menu and after teaching `submitInlineRename(...)` to use a real CDP Enter path when needed
    - root delete now starts from that same list-first sidebar-row surface, with the header `Open conversation options` menu kept only as fallback because it really does expose `Delete`
    - fresh-id delete resolution is now fixed too: a raw ChatGPT root conversation id can bypass the refreshed conversation catalog and go straight to the browser delete path
    - the remaining acceptance watchpoint is rate-limit timing during the final destructive cleanup steps, not selector resolution
- Phase 3 conversation attachment/file read parity
  - `listConversationFiles(...)`
  - `readConversationContext(...)` now returns `files[]` for real ChatGPT sent-turn uploads
  - live WSL non-Pro pass proved:
    - force a real upload with `--browser-attachments always` so ChatGPT uses the native file input instead of inlining a small text file into the prompt
    - `conversations files list 69c95f14-2ca0-8329-9d3a-be5d1a1967ab --target chatgpt` returned `chatgpt-real-upload-vmuk.txt`
    - `conversations context get 69c95f14-2ca0-8329-9d3a-be5d1a1967ab --target chatgpt --json-only` returned the same file in `files[]` with a stable synthetic id plus `turnId` / `messageId`
  - product boundary confirmed:
    - users can remove files from the composer before send
    - users cannot delete an already-sent file from a ChatGPT conversation
    - ChatGPT retention/expiry may eventually remove old uploaded files from a conversation independently
    - the only durable user-managed delete surface is project `Sources`
  - conversation context enrichment is now live too:
    - `readConversationContext(...)` returns `sources[]` from assistant `metadata.content_references` / `metadata.citations`
    - `readConversationContext(...)` returns `artifacts[]` for downloadable `sandbox:/...` links embedded in assistant markdown (including spreadsheet-like `.csv` / `.xlsx` downloads), `image_asset_pointer` tool outputs, `ada_visualizations` table outputs, and canvas/textdoc tool messages
    - live WSL proof on `69c3e6d0-3550-8325-b10e-79d946e31562`:
      - `sourceCount = 6`
      - `artifactCount = 30`
      - includes file-backed sources like `proof.pdf`
      - includes downloadable artifacts like `updated skill.zip`, `combined JSON extraction`, and `combined BibTeX extraction`
    - live WSL proof on image chat `69bc77cf-be28-8326-8f07-88521224abeb`:
      - `artifactCount = 4`
      - includes `image` artifacts with `sediment://...` asset pointers plus width/height/size and DALL-E generation metadata
    - live WSL proof on CSV/table chat `bc626d18-8b2e-4121-9c4a-93abb9daed4b`:
      - `artifactCount = 2`
      - includes `spreadsheet` artifacts `Patents with ISURF Numbers` and `New Patents with ISURF Numbers`
      - each artifact preserves the backing ChatGPT `file_id` as `chatgpt://file/<id>` plus `visualizationType = table`
    - live WSL proof on spreadsheet-download chat `69ca9d71-1a04-8332-abe1-830d327b2a65`:
      - `artifactCount = 1`
      - includes `spreadsheet` artifact `parabola_trendline_demo.xlsx`
      - this one comes from a markdown `sandbox:/...xlsx` link rather than `ada_visualizations`
    - live WSL proof on `69c8a0fc-c960-8333-8006-c4d6e6704e6e`:
      - `artifactCount = 1`
      - includes canvas artifact `Probe` with `textdocId`, `documentName`, and `contentText`
  - implementation nuance worth preserving:
    - direct in-page `fetch('/backend-api/conversation/<id>')` can return a JSON `conversation_not_found` payload even when the same page visibly hydrates correctly
    - the robust fallback is CDP `Network.responseReceived` + exact conversation-route matching + `Network.loadingFinished` + `getResponseBody` on a reload of the already-open conversation route
    - do not treat any JSON response body as authoritative; the direct path must only short-circuit when the response is successful and contains a real `mapping`
- spreadsheet/public-share note:
  - the public spreadsheet share surface still looks download-first (`Updated bundle ZIP`, `Implementation summary`, etc.)
  - the richer logged-in shape is now confirmed through `metadata.ada_visualizations` with `type = table` plus a backing `file_id`
  - keep spreadsheet normalization anchored to that logged-in payload shape rather than share-page buttons
- first artifact materialization slice:
  - `auracall conversations artifacts fetch <conversationId> --target chatgpt` now stores supported artifacts under `conversation-attachments/<conversationId>/files/...`
  - each fetch also writes `conversation-attachments/<conversationId>/artifact-fetch-manifest.json` with per-artifact `materialized|skipped|error` status while leaving the normal attachment manifest schema unchanged
  - live serialized proof on image chat `69bc77cf-be28-8326-8f07-88521224abeb`:
    - `artifactCount = 4`
    - `materializedCount = 4`
    - all four `image` artifacts resolve to real `.png` files fetched from ChatGPT's live `backend-api/estuary/content?id=file_...` URLs
  - live serialized proof on table chat `bc626d18-8b2e-4121-9c4a-93abb9daed4b`:
    - `artifactCount = 2`
    - `materializedCount = 2`
    - both `ada_visualizations` table artifacts materialize as CSVs scraped from the rendered inline grids
  - live serialized proof on DOCX + canvas chat `69caa22d-1e2c-8329-904f-808fb33a4a56`:
    - `artifactCount = 2`
    - `materializedCount = 2`
    - the canvas/textdoc now materializes from DOM-enriched `contentText`
    - the DOCX button now materializes as `comment_demo.docx` by capturing the signed `backend-api/estuary/content?id=file_...` URL from the native button click and fetching it directly
  - live serialized proof on assistant-turn button artifact discovery in `69bded7e-4a88-8332-910f-cab6be0daf9b`:
    - `artifactCount = 86`
    - includes DOM-only download artifacts like `Codebase status report`, `Machine-readable handoff JSON`, `Fresh investigation bundle`, and repeated `Turn report` / `Machine-readable handoff` bundles across assistant turns
  - live serialized proof on spreadsheet-download chat `69ca9d71-1a04-8332-abe1-830d327b2a65`:
    - `artifactCount = 1`
    - `materializedCount = 1`
    - the workbook `parabola_trendline_demo.xlsx` now materializes through the embedded spreadsheet card's first unlabeled header button, which emits the same signed `backend-api/estuary/content?id=file_...` anchor transport as other binary downloads
  - current deliberate boundary:
    - broader bundle-heavy live proof on ZIP/JSON/MD button artifacts is still a useful follow-up, but the underlying signed-anchor transport is now proven through both the DOCX path and the embedded spreadsheet-card workbook path
    - the previously used canvas sample `69c8a0fc-c960-8333-8006-c4d6e6704e6e` no longer returns a live canvas artifact on this account, so use a fresh canvas chat when validating the textdoc/canvas materializer path
  - implementation nuances worth preserving:
    - overall conversation-surface readiness is not enough; image/table materialization must wait for artifact-specific DOM readiness
    - for image artifacts with duplicate titles, only an exact file-id match is safe; title fallback can bind the wrong image variant
    - DOM-only assistant download buttons live in the whole assistant turn `section[data-testid^="conversation-turn-"]`, not necessarily inside the `[data-message-author-role]` node
    - many button-backed binary downloads do not use fetch/XHR; a native click synthesizes an anchor click to a signed `backend-api/estuary/content?id=file_...` URL
    - do not run multiple live ChatGPT artifact fetches in parallel against the same managed browser session because they share one active signed-in tab and can interfere with each other's navigation/state
- Phase 5 scripted acceptance
  - `scripts/chatgpt-acceptance.ts` is now the canonical guarded WSL ChatGPT browser acceptance runner
  - latest clean transcript:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts`
    - returned `PASS` on suffix `lyveco`
    - disposable project `g-p-69c9b2d3940c8191beca8032978bd981`
    - disposable conversation `69c9b37a-3c94-832d-be89-5ceaf91bd748`
  - important final acceptance learnings:
    - the runner needs a longer timeout budget for mutating ChatGPT commands because the rolling write guard can legitimately keep a live mutation alive longer than 120s before the command itself even executes
    - the runner now survives real ChatGPT cooldowns during rename/delete cleanup and resumes the same acceptance pass instead of reporting a false terminal failure
    - ChatGPT root delete confirmation should trust the real `Delete chat?` dialog + `delete-conversation-confirm-button` even when the old page title text has drifted
    - ChatGPT project remove must scope `Delete project` to the tagged project-settings dialog because the settings sheet can coexist with a separate `Too many requests` dialog

Implementation notes worth preserving:
- rename is more reliable through the sidebar row `Open conversation options for ...` menu than through the open-conversation header menu
- the open-conversation header `Open conversation options` menu is not a rename surface on the current root conversation DOM; it exposes `Share`, `View files in chat`, `Move to project`, `Pin chat`, `Archive`, and `Delete`
- after choosing `Rename` from the sidebar row menu, the editable title field is just a plain visible `input[type="text"]` populated with the current title value
- delete now prefers the same sidebar row menu and only falls back to the header menu if the sidebar path does not surface confirmation
- ChatGPT delete confirmation can no longer rely on the pre-delete page title text matching the live confirmation dialog text exactly; the real visible `Delete chat?` dialog plus `delete-conversation-confirm-button` is the authoritative state
- context reads can hit the right route before the turn DOM finishes hydrating; the adapter now polls the turn DOM and does one reload/retry before failing
- ChatGPT small-text `--file` runs must use `--browser-attachments always` during live recon/acceptance if you want a real file upload surface; `auto` can inline the text into the prompt and never create a sent-turn file tile
- the authoritative read surface for current ChatGPT conversation files is the sent user-turn tile group (`role="group"` with `aria-label=<filename>`), not the transient picker row and not an assumed `View files in chat` dialog
- real file identity on the current surface is best modeled as synthetic `conversationId + turn/message id + tile index + file name`; the live DOM did not expose a stronger native file id on the sent-turn tile
- post-send delete is intentionally out of scope for ChatGPT conversation files unless the native product later exposes a real removal affordance; project sources remain the only file-delete surface Aura-Call should automate on ChatGPT
- project removal must scope itself to the tagged settings dialog rather than generic dialog roots because ChatGPT can stack a separate `Too many requests` dialog over the same project page without closing the settings sheet

## Immediate Next Step

Re-run the guarded ChatGPT browser bar after the account cooldown clears, but only with the new acceptance runner behavior in place:

- `scripts/chatgpt-acceptance.ts` now aborts instead of sleeping through a long ChatGPT cooldown and resuming minutes later
- project-chat rename verification now prefers the row-menu label and does one fresh list reload before failing
- `scripts/chatgpt-acceptance.ts` is now phaseable:
  - `--phase project`
  - `--phase project-chat --project-id ...`
  - `--phase root-base`
  - `--phase root-followups --conversation-id ...`
  - `--phase cleanup --project-id ... [--conversation-id ...]`

Phase 4 existing-conversation tool/add-on state is implemented. The remaining live check is getting the expanded guarded acceptance bar green again without tripping a new long cooldown.
