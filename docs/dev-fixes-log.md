# Dev Fixes Log

This log captures notable fixes, what broke, why, and how we verified the repair. The goal is to preserve lessons learned and avoid repeating regressions.

## When to update

- After fixing a regression, production bug, or flaky behavior.
- After discovering a confusing failure mode or tricky debugging step.
- After landing a workaround that should be revisited.

## Entry format

- Date:
- Area:
- Symptom:
- Root cause:
- Fix:
- Verification:
- Follow-ups:

## Entries

- Date: 2026-01-24
- Area: Grok project files (new Personal Files modal UX)
- Symptom: `projects files add/list/remove` regressed after UI change; old Sources selectors no longer matched reliably.
- Root cause: Grok moved file interactions behind a `Personal files` modal (search input + Attach button + hover remove + Save), while old code assumed direct Sources-row controls.
- Fix: Reworked Grok file flows to the new modal lifecycle:
  - open `Personal files` modal from project Sources context
  - upload via modal attach/file-input path
  - delete via hover row action, verify pending-remove state (`opacity-50`, `line-through`, `Undo`), then commit with modal `Save`
  - list from modal rows for current UI variant
- Verification:
  - `pnpm tsx bin/oracle-cli.ts projects files add <projectId> -f <file> --target grok`
  - `pnpm tsx bin/oracle-cli.ts projects files remove <projectId> <fileName> --target grok`
  - `pnpm tsx bin/oracle-cli.ts projects files list <projectId> --target grok`

- Date: 2026-01-24
- Area: Grok project sources (Files collapsible + uploads)
- Symptom: `projects files add/remove` failed when the Files list was empty; helper threw `Button not found` and attach menu never opened.
- Root cause: The Files collapsible toggle is sometimes absent when there are no rows; strict toggle matching caused a hard failure.
- Fix: `ensureProjectSourcesFilesExpanded` now tolerates a missing toggle and only expands when a toggle is visible; added a stepwise smoke script to validate sources flows.
- Verification: `pnpm tsx scripts/verify-grok-project-sources-steps.ts 1 <projectId>` and step 5/6 upload+remove succeed.

- Date: 2026-01-14
- Area: Grok project menu (clone/rename) + menu helpers
- Symptom: `projects clone` opened the user/profile menu (items like Settings/Help) and failed to find Clone; rename failed right after clone.
- Root cause: `openMenu` trusted `aria-controls` and did not fall back when the id was missing; project menu detection used broad `aria-haspopup="menu"` and raced DOM readiness.
- Fix: `openMenu` now falls back to the provided menu selector when `aria-controls` resolves to a missing element; `openProjectMenuButton` waits for `button[aria-label="Open menu"]` and matches by label (avoids profile menu).
- Verification: `pnpm tsx bin/oracle-cli.ts projects clone "My Project" "My Project Clone 2" --target grok` and `projects rename <id> "My Project Clone"` succeeded.

- Date: 2026-01-24
- Area: Grok project sources tab selection
- Symptom: `projects files list <id>` failed with “Sources tab not found” even on `?tab=sources`.
- Root cause: Sources tablist can lag or be missing; when content is already rendered, there’s no tab to click.
- Fix: `ensureProjectSourcesTabSelected` now waits for a tablist but treats a rendered sources container as success; only throws if neither tab nor content exists.
- Verification: `pnpm tsx bin/oracle-cli.ts projects files list <projectId> --target grok` returned file names.

- Date: 2026-01-14
- Area: Grok smoke tests + cache CLI usage
- Symptom: Smoke checklist referenced `oracle cache --target grok`, which is not a supported flag (command failed).
- Root cause: Cache CLI is provider-agnostic and does not accept a target override.
- Fix: Updated smoke checklist to use `oracle cache` and added an explicit `--browser-target grok` prompt variant.
- Verification: Live Grok smoke run completed (prompt, projects refresh, conversations list, project prompt, reattach, registry).

- Date: 2026-01-09
- Area: Grok browser conversation scraping (history dialog)
- Symptom: `oracle conversations --target grok --include-history` returned empty results with `SyntaxError` from `Runtime.evaluate`.
- Root cause: Unescaped backslashes in regex literals inside the injected history-dialog script caused JS parse errors (e.g., `\s` collapsed to `s`, `//c/` became a comment).
- Fix: Escaped regex literals inside the template string (match and cleanup patterns, `/c/` pathname regex) so the injected script remains valid JavaScript.
- Verification: Live Grok conversation fetch returned a full list via `pnpm tsx bin/oracle-cli.ts conversations --target grok --refresh --include-history`.
- Follow-ups: Ensure `updatedAt` parsing finds timestamps in the current Grok UI.

- Date: 2026-01-10
- Area: Grok browser conversation timestamps (history dialog)
- Symptom: Conversation list rendered but `updatedAt` was always `undefined`.
- Root cause: History rows render relative time in a plain text element (e.g., a `div` with "1 hour ago"), not in `<time>` or ARIA attributes, so the scraper never parsed it.
- Fix: Scan descendant text nodes in each history row for short relative/absolute timestamps and parse them before falling back to title cleanup.
- Verification: Live Grok conversation fetch returned populated `updatedAt` values via `pnpm tsx bin/oracle-cli.ts conversations --target grok --refresh --include-history`.

- Date: 2026-01-10
- Area: Grok browser conversation list (title cleanup)
- Symptom: `oracle conversations --target grok` returned empty results or a `Runtime.evaluate` `SyntaxError`.
- Root cause: Regex literals inside the injected list script used `\t`/`\n` escapes inside a template string, which injected literal newlines and broke regex parsing in the browser.
- Fix: Replace the title-cleanup regexes with `\\s`-based patterns so the injected script is valid.
- Verification: Pending (rerun Grok conversation list after patch).

- Date: 2026-01-10
- Area: Grok browser conversation timestamps (history + list)
- Symptom: `updatedAt` missing when Grok rendered short relative times (e.g., `2h`, `3d`) or when history dialog stayed open after scraping.
- Root cause: Timestamp parsing only handled “X hours ago” wording and didn’t recognize short unit tokens; dialog close relied on generic modal close paths only.
- Fix: Parse short relative units (`2h`, `3d`, `5w`, `2mo`, etc.) and add a history-toggle fallback when closing dialogs.
- Verification: Pending (rerun Grok conversation list/history with `--include-history` and confirm `updatedAt` populated + dialog closed).

- Date: 2026-01-11
- Area: Browser session reattach (dangling sessions)
- Symptom: `oracle session <id> --render` hangs when the browser instance died, even though the session still exists.
- Root cause: Reattach path assumes an active DevTools port and does not validate liveness before waiting.
- Fix: Pending (add fast liveness check against registry/port and fail with a clear message + relaunch hint).
- Verification: Pending (reattach should fail fast when Chrome is closed).

- Date: 2026-01-10
- Area: Grok assistant selectors (doctor + response polling)
- Symptom: `oracle doctor --target grok` failed `assistantBubble`, `assistantRole`, and `copyButton` when using the new Grok UI classes.
- Root cause: Message rows no longer use `.message-bubble` classes; assistant rows are now `div.relative.group.flex.flex-col.items-start`, with action buttons (Copy) nested under the same row.
- Fix: Updated Grok provider selectors to target the new row classes and align assistant detection with `items-start`.
- Verification: Live DOM inspection via `pnpm tsx scripts/browser-tools.ts eval ...` against a Grok conversation.

- Date: 2026-01-10
- Area: Browser registry (manual login + cookie export)
- Symptom: `oracle doctor` reported missing DevTools port even with a login window open.
- Root cause: Manual login + cookie export launches Chrome via `chrome-launcher` without registering the instance in `browser-state.json`.
- Fix: Register the DevTools port/pid after login chrome launches so registry lookups succeed.
- Verification: TBD (rerun doctor after login launch).

- Date: 2026-01-12
- Area: Cache identity + name resolution (llmService)
- Symptom: Cache refresh/name resolution logic diverged across CLI commands and duplicated LlmService behavior.
- Root cause: Cache helpers lived in `bin/oracle-cli.ts` instead of the new LlmService layer.
- Fix: Centralized cache identity/context and name resolution in `src/browser/llmService/llmService.ts`, routing CLI list/resolve flows through it.
- Verification: Pending (rerun `oracle projects`, `oracle conversations`, and `oracle cache --refresh`).
- Follow-ups: Validate model-selection fallback in Phase 3.

- Date: 2026-01-12
- Area: Grok main sidebar state detection (history workflows)
- Symptom: Sidebar open/closed detection reported inverted states during toggle smoke tests.
- Root cause: Width-based checks can be inverted depending on layout/scroll state; the toggle icon state is more reliable.
- Fix: Detect open state via `button[data-sidebar="trigger"] svg.lucide-chevrons-right.rotate-180` (open). Keep width/right-edge check (`rect.width > 120 && rect.right > 40`) as a fallback if SVG changes.
- Verification: `scripts/verify-grok-main-sidebar-toggle.ts` reports correct state transitions.

- Date: 2026-01-12
- Area: Browser-service DOM wait helpers
- Symptom: Sidebar open check occasionally failed right after navigation; time-based sleeps were brittle.
- Root cause: Waits were time-based instead of selector-based, so the toggle could be queried before it was in the DOM.
- Fix: Added `waitForSelector` to `packages/browser-service/src/service/ui.ts` and used it in `ensureMainSidebarOpen` to wait for `button[data-sidebar="trigger"]`.
- Verification: `scripts/verify-grok-project-remove-steps.ts 2 <projectId>` no longer fails due to missing sidebar toggle.
- Fix: Grok project-create model picker needed `pointerdown`/`mousedown` before `click()` to open the Radix listbox. Added this in `resolveProjectInstructionsModal` and `verify-grok-project-create-model-picker.ts`.
- Verification: `pnpm tsx scripts/verify-grok-project-create-steps.ts 2 "My Project" "Instructions here" "Grok 4.1 Thinking"` sets the model correctly.
- Docs: Added `docs/dev/browser-service-tools.md` to centralize reusable browser-service UI helpers and patterns.
- Fix: Project instructions get/set now ensure project sidebar open and wait for the Edit Instructions button via `waitForSelector` before clicking.
- Fix: Project instructions get no longer fails when the edit dialog is already open; we short-circuit on textarea presence and skip model-menu inspection unless a model change is requested.
- Fix: Grok history rename flow required real mouse hover. Added `hoverElement` to browser-service (CDP mouse move + `elementFromPoint` verification) and used it to reveal hover-only controls in the history dialog.
- Verification: `pnpm tsx scripts/verify-grok-history-rename-steps.ts 4 <conversationId>` shows Rename/Delete controls consistently; CLI rename succeeds.

- Date: 2026-01-12
- Area: Dev workflow hygiene
- Note: Keep commits tight and scoped; stage new scripts/docs intentionally, and clean up/commit before switching phases to avoid losing automation learnings.
