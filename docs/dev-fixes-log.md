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
