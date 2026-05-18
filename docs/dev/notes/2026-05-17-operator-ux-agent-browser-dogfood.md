# Operator UX Agent-Browser Dogfood

Date: 2026-05-17

## Scope

Used `agent-browser` against the installed operator dashboard at `http://auracall.localhost/dashboard` to inspect the React operator UX as a live surface rather than a static build artifact.

Screenshots captured during the pass:

- `/home/ecochran76/.agent-browser/tmp/screenshots/screenshot-1779022879941.png` - initial Chats desktop view.
- `/home/ecochran76/.agent-browser/tmp/screenshots/screenshot-1779022898872.png` - Health desktop view before wrap fixes.
- `/home/ecochran76/.agent-browser/tmp/screenshots/screenshot-1779022918447.png` - Runs desktop view before wrap fixes.
- `/home/ecochran76/.agent-browser/tmp/screenshots/screenshot-1779022964927.png` - Search mobile view before overflow fix.
- `/home/ecochran76/.agent-browser/tmp/screenshots/screenshot-1779023214452.png` - Runs desktop view after wrap fixes.
- `/home/ecochran76/.agent-browser/tmp/screenshots/screenshot-1779023236414.png` - Runs mobile view after overflow fix.
- `/home/ecochran76/.agent-browser/tmp/screenshots/screenshot-1779023273303.png` - Authenticated archive search after result clamping.

## What Worked

- `/dashboard` served the React UX from the installed API service on the stable AuraCall host.
- Top navigation, persistent active page state, collapsible side panes, Health, Runs, and Search all loaded through the real browser session.
- `/status` and `/status?recovery=true&sourceKind=all` populated the Health and Runs pages.
- Authenticated archive search worked with an operator API key stored only in browser `sessionStorage`.
- `/v1/archive?q=chatgpt&limit=25` returned the expected archive metrics and result cards through the UX.

## Fixes Applied

- Stopped the mobile shell from producing a page-level horizontal scrollbar.
- Reduced collapsed mobile side panes from 50px to 44px.
- Changed status/run cards from four forced columns to responsive `auto-fit` cards.
- Changed narrow metric rows to single-column labels with ellipsized values.
- Clamped archive result titles/snippets to prevent a long prompt from consuming the viewport.
- Changed the Runs authenticated API card to summarize availability instead of using a long route string as the card headline.

## Remaining UX Debt

- The left context pane and right inspector still render long route templates as dense wrapped text. They are acceptable for the proof-of-concept but should become copyable route chips, expandable code blocks, or a route detail drawer.
- Search results need real ranking, collapsed snippets, and result-type-specific cards. The current cards prove retrieval works but are not yet good enough for large archive browsing.
- Mobile layout is usable after the overflow fix, but the side-pane affordances are still placeholder controls. A real mobile design should use drawers or a sheet.
- The Health and Runs pages expose useful state, but the labels need operator-first language and drill-down actions before this can replace the old debug dashboard.
- `agent-browser` default bundled Chrome failed on this host with exit code 21 and empty stderr. The pass succeeded by explicitly using `/usr/bin/google-chrome-stable --no-sandbox`; that harness issue should be tracked separately from AuraCall UX work.

## Density Follow-Up

Second pass tightened the operator chrome around recognizable icon controls:

- Top navigation now uses icon-only buttons with accessible names and native hover hints.
- The operator account chip is icon-only, with a compact menu for UX settings, tenant config, agents, teams, API keys, and diagnostics.
- Header height, pane toolbars, side-list rows, status chips, cards, tables, run lists, archive filters, and result cards use tighter spacing.
- Shared `:focus-visible` styling keeps the icon-heavy interface keyboard-visible.
- Status readouts ellipsize route templates on mobile instead of expanding into a tall route block.

Additional screenshots:

- `/home/ecochran76/.agent-browser/tmp/screenshots/screenshot-1779023826879.png` - desktop compact icon navigation.
- `/home/ecochran76/.agent-browser/tmp/screenshots/screenshot-1779024018750.png` - mobile compact search view.
- `/home/ecochran76/.agent-browser/tmp/screenshots/screenshot-1779024037448.png` - mobile operator menu and ellipsized route readout.

## Route Chip Follow-Up

Third pass replaced long route/template text in operator side panes with compact route chips:

- Route chips show the route name/path, keep the full template in the native hover title, and include a copy icon.
- URL routes also include a compact open-link icon.
- Left-pane context rows are now non-interactive cards so route copy buttons are not nested inside unrelated buttons.
- Right-pane inspector route values use the same route chip component for Health, Search, and Runs surfaces.

Additional screenshots:

- `/home/ecochran76/.agent-browser/tmp/screenshots/screenshot-1779024889377.png` - mobile route readout after route-chip compaction.
- `/home/ecochran76/.agent-browser/tmp/screenshots/screenshot-1779024939497.png` - Health route chips in left context and right inspector.
- `/home/ecochran76/.agent-browser/tmp/screenshots/screenshot-1779024982986.png` - Runs route chips for status, recent runs, and inspect routes.

## Validation

- `pnpm run ux:build`
- `pnpm run build`
- `pnpm run install:user-runtime`
- `systemctl --user restart auracall-api.service`
- `curl -fsS http://auracall.localhost/status`
- `agent-browser` desktop and mobile screenshots against `http://auracall.localhost/dashboard`

## Selected Inspector Follow-Up

Fourth pass made archive search behave like a list/detail operator workflow:

- Search now selects the first returned archive item automatically.
- Each result exposes a compact `Inspect` control with a bounded accessible name.
- The right inspector shows the selected item kind, status, provider, runtime, agent, updated time, and a compact JSON summary.
- Route chips can open relative API routes as well as external provider URLs.
- Result titles are compacted before rendering so huge prompts/transcripts do not poison accessibility snapshots or CDP screenshots.
- The app shell is fixed to viewport height so result browsing scrolls the center viewport instead of losing the side panes.

Additional screenshot:

- `/tmp/auracall-operator-ux-dogfood/fixed-search-inspector.png` - selected archive result with inspector visible and shell-level scrolling disabled.

Validation evidence:

- Authenticated `/v1/archive?q=chatgpt&limit=25` search rendered `25` results.
- Browser eval reported `selected=1`, `results=25`, and `bodyScroll=false`.
- `agent-browser snapshot -i` completed after the large-result compaction fix.

## Archive Detail Follow-Up

Fifth pass made the selected archive item inspector fetch protected item detail:

- Selecting a search result now fetches `/v1/archive/items/{archive_item_id}` with the session-scoped operator key.
- The inspector reports `Loading detail`, `Detail loaded`, or `Detail unavailable` so operators can tell whether they are seeing a hydrated item or only the list summary.
- The selected summary now includes file, provider, ownership, link, and metadata-key fields.
- Inspector action chips are generated from every returned link key, not only a hardcoded subset.

Additional screenshot:

- `/tmp/auracall-operator-ux-dogfood/archive-detail-inspector.png` - hydrated response archive item with response and runtime-run action chips visible.

Validation evidence:

- Installed dashboard at `http://auracall.localhost/dashboard` loaded through `agent-browser` with a throwaway Chrome profile.
- Authenticated search for `first_pass_readout` rendered `25` results and selected one item.
- Browser eval reported `selected=1`, `results=25`, `status="Detail loaded\n5/17/2026, 11:52:55 AM"`, and `actions=["Response","Runtime Run"]`.

## Archive Asset Preview Follow-Up

Sixth pass made file-backed archive items retrievable from the inspector:

- The Search page keeps the operator key in shell state so the right inspector can fetch protected assets without placing bearer credentials in URLs.
- The selected inspector now synthesizes `/v1/archive/items/{archive_item_id}/asset` for file-available items, even when the archive item payload does not include an explicit `links.asset`.
- The asset card shows availability, file name, MIME type, fetched size, and Open/Download object URL actions after a successful fetch.
- Text, JSON, XML, CSV, Markdown, and log assets under 256 KiB render an inline text preview; images and PDFs use object URL previews.

Additional screenshot:

- `/tmp/auracall-operator-ux-dogfood/archive-asset-preview.png` - fetched upload asset with JSON preview and Open/Download actions.

Validation evidence:

- `kind=upload`, query `rubric` rendered `25` upload results and selected one item.
- Browser eval after clicking `Fetch` reported `AVAILABLE yes`, `TYPE application/json; charset=utf-8`, `SIZE 6,785 bytes`, `assetActions=["Open","Download"]`, and `hasTextPreview=true`.

Observed backend/API gap:

- Generated-artifact items with local files can have IDs containing embedded slash text from `sandbox:/mnt/data/...`; `/v1/archive/items/{archive_item_id}` and `/asset` currently return HTTP 400 for those encoded IDs.
- Upload archive IDs without embedded slash text work through the item and asset routes.

## Archive Slash-ID Route Follow-Up

Seventh pass closed the generated-artifact route gap:

- Archive item links now use `/v1/archive/items/b64/{base64url_archive_item_id}` for generated item routes.
- The HTTP archive item and asset route parsers accept both legacy percent-encoded IDs and the new `b64/` ID form.
- File-backed archive items now get an explicit `links.asset` during archive metadata enrichment.
- The operator UX detail and asset fetch helpers now synthesize the same `b64/` route form, so generated-artifact IDs containing `sandbox:/mnt/data/...` do not depend on encoded slash behavior in proxies or URL parsers.

Validation evidence:

- `pnpm exec vitest run tests/http.runArchive.test.ts` passed.
- The focused HTTP test now includes a generated artifact with ID text containing `sandbox:/mnt/data/first_pass_readout.json`; its item detail route and asset route both return HTTP 200 through the new `b64/` route form.
- `pnpm run ux:build` passed after the operator route helper update.

## Chat Dialog Follow-Up

Eighth pass replaced the static Chats placeholder with a read-only conversation browser:

- The Chats page uses the same session-scoped operator key as Search.
- It loads `/v1/account-mirrors/catalog?kind=conversations` for a provider/runtime profile.
- Selecting a conversation fetches `/v1/account-mirrors/catalog/items/{conversation_id}?kind=conversations`.
- Cached conversation messages render as chat bubbles aligned by role.
- The selected conversation header includes the provider link when present.
- Related cached file/artifact/source counts appear below the transcript.

Additional screenshot:

- `/tmp/auracall-operator-ux-dogfood/chat-dialog-view.png` - cached ChatGPT conversation rendered as a dialog transcript.

Validation evidence:

- Installed dashboard at `http://auracall.localhost/dashboard` loaded through `agent-browser` with a throwaway Chrome profile.
- Authenticated `chatgpt/default` conversation load rendered `25` rows, selected one conversation, and rendered `5` chat turns.
- Browser eval reported `userTurns=2`, `assistantTurns=3`, header `Fridge Mullion Repair Guide`, and related counts `11 artifacts` / `9 sources`.

## Operator Superuser Follow-Up

Ninth pass removed the operator-entered API key requirement from the dashboard:

- Same-origin dashboard requests to `/v1/*` now receive an operator-superuser auth context.
- Plain unauthenticated external API requests still require bearer/API-key auth.
- Search, Chats, archive item detail, and archive asset preview no longer prompt for, store, or send browser-entered API keys.
- Dashboard copy now describes same-origin operator access instead of `sessionStorage` or bearer headers.

Additional screenshots:

- `/tmp/auracall-operator-ux-dogfood/search-no-key.png` - Search page showing archive results and fetched asset preview without an API-key field.
- `/tmp/auracall-operator-ux-dogfood/chat-no-key.png` - Chats page showing `chatgpt/default` conversations without an API-key field.

Validation evidence:

- `pnpm exec vitest run tests/http.responsesServer.test.ts -t "configured API keys|agent registry and loaded API-key diagnostics"` passed.
- `pnpm run ux:build` passed.
- `pnpm run build` passed.
- `pnpm run install:user-runtime` passed.
- `systemctl --user restart auracall-api.service` and `systemctl --user is-active auracall-api.service` reported `active`.
- `curl http://auracall.localhost/status` reported `ok=true`, auth required with six keys, dashboard URL `http://auracall.localhost/dashboard`, and live follow `healthy`.
- Plain `curl http://auracall.localhost/v1/models` returned HTTP 401, while the same route with `Referer: http://auracall.localhost/dashboard` returned HTTP 200 and `63` models.
- `agent-browser` loaded `http://auracall.localhost/dashboard`, verified Search had no API-key field, searched `kind=upload` with query `rubric`, rendered 25 upload results, fetched an asset, then verified Chats had no API-key field and loaded 25 `chatgpt/default` conversations.

## API Key Management Follow-Up

Tenth pass added operator API-key inspection, issue, and delete controls:

- Added `GET /v1/config/api-keys` for secret-free inspection of the user-scoped service env file.
- Added `DELETE /v1/config/api-keys/{key_id}` to remove a key from `~/.auracall/api.env`; the response reports `restartRequired` because running auth policy is loaded at service start.
- Added an MCP `api_key_delete` tool with the same secret-free delete contract.
- Added a Health-page API Keys section that lists key ids, secret presence, scopes, delete actions, and a compact issue form.
- The issue result can display the one-time secret to the superuser operator; list and delete responses do not expose secrets.

Additional screenshot:

- `/tmp/auracall-operator-ux-dogfood/api-keys-health.png` - Health page API Keys table and issue form, rendered without browser-entered credentials.

Validation evidence:

- `pnpm exec vitest run tests/http.responsesServer.test.ts -t "issues scoped API keys|configured API keys|agent registry and loaded API-key diagnostics"` passed.
- `pnpm run ux:build` passed.
- `pnpm exec tsc -p tsconfig.build.json --pretty false` passed.
- `pnpm run build` passed.
- `pnpm run install:user-runtime` passed.
- `systemctl --user restart auracall-api.service` and `systemctl --user is-active auracall-api.service` reported `active`.
- `curl http://auracall.localhost/status` reported `ok=true`, `routes.configApiKeys=/v1/config/api-keys`, `routes.configApiKeyDeleteTemplate=DELETE /v1/config/api-keys/{key_id}`, and live follow `healthy`.
- A temp-env smoke issued `operator-ui-smoke`, listed one redacted key without leaking the secret, deleted it, and reported zero remaining temp-env keys.
- `agent-browser` verified the Health page renders six existing key rows and the issue form, then saved the screenshot above.

## Service Restart Control Follow-Up

Eleventh pass added a dashboard-safe API service restart workflow after API-key issue/delete operations:

- Added `POST /status` service control payload support for `restart-api-service`.
- Added a `dryRun` mode and injectable restart scheduler so the HTTP behavior is testable without restarting the process.
- The default scheduler runs `systemctl --user restart auracall-api.service` after the response is returned.
- Added a Health-page `Restart API` control next to API-key refresh.
- API-key mutation results now tell the operator to restart before external clients rely on changed key state.

Additional screenshot:

- `/tmp/auracall-operator-ux-dogfood/api-keys-restart-button.png` - Health page API Keys section with the compact `Restart API` control.

Validation evidence:

- `pnpm exec vitest run tests/http.responsesServer.test.ts -t "API service restart|issues scoped API keys|configured API keys"` passed.
- `pnpm exec tsc -p tsconfig.build.json --pretty false` passed.
- `pnpm run ux:build` passed.
- `pnpm run build` passed.
- `pnpm run install:user-runtime` passed.
- `systemctl --user restart auracall-api.service` and `systemctl --user is-active auracall-api.service` reported `active`.
- `POST http://auracall.localhost/status` with `serviceControl.restart-api-service` and `dryRun=true` returned `scheduled=false`, `unitName=auracall-api.service`, and the expected restart command.
- After the manual restart, `http://auracall.localhost/status` briefly returned `Bad Gateway`, then recovered; direct and local-hosted status checks reported `ok=true`, live follow `healthy`, and 9 live-follow accounts.
- `agent-browser` verified the installed dashboard at `http://auracall.localhost/dashboard` renders the API Keys panel and `Restart API` control, then saved the screenshot above.

## Live Follow Status Follow-Up

Twelfth pass tightened the Health page live-follow readout after a transient `attention-needed` status cleared on the next full `/status` read:

- The Live Follow card now reports enabled and unconfigured target counts separately.
- The accounts table header now includes total, enabled, and attention counts.
- The accounts table adds a compact reason column so operators can distinguish `min interval`, `already running`, and `identity missing`.
- Unconfigured blocked profiles no longer get shown as row-level `Attention`; the table shows their actual block reason while the rollup remains `0 attention` for enabled targets.
- Raw enum labels are converted to readable chips such as `Idle Waiting`, `Min Interval`, and `Identity Missing`.

Additional screenshot:

- `/tmp/auracall-operator-ux-dogfood/live-follow-reasons-loaded.png` - Health page live-follow table showing 5 enabled targets, 4 unconfigured targets, and 0 attention targets.

Validation evidence:

- `curl http://auracall.localhost/status` reported live follow `healthy`, 5 enabled targets, 4 unconfigured targets, and 0 attention targets.
- `pnpm run ux:build` passed.
- `pnpm exec tsc -p tsconfig.build.json --pretty false` passed.
- `pnpm run install:user-runtime` passed.
- `agent-browser` verified the installed dashboard at `http://auracall.localhost/dashboard` renders the live-follow counts and readable reason chips, then saved the screenshot above.

## Live Follow Filter Follow-Up

Thirteenth pass added compact table filters to the Health page live-follow accounts section:

- Added `All`, `Enabled`, `Unconfigured`, `Attention`, and `Running` filter chips with live counts.
- The table heading now reports the visible row count against the total target count.
- Empty filter results render a specific empty-state row instead of looking like the API has no live-follow data.
- The `Attention` filter only includes configured/enabled attention targets, so unconfigured identity-missing profiles remain visible under `Unconfigured`.

Additional screenshots:

- `/tmp/auracall-operator-ux-dogfood/live-follow-filter-unconfigured.png` - Unconfigured filter showing four non-enabled targets and identity-missing reasons.
- `/tmp/auracall-operator-ux-dogfood/live-follow-filter-empty-attention.png` - Attention filter showing the zero-attention empty state.

Validation evidence:

- `pnpm run ux:build` passed.
- `pnpm run install:user-runtime` passed.
- `agent-browser` loaded `http://auracall.localhost/dashboard`, clicked `Unconfigured`, verified 4 visible rows, clicked `Attention`, verified 0 rows and the empty-state message, then closed the browser.

## Live Follow Inspector Follow-Up

Fourteenth pass added a read-only drill-down path for live-follow accounts:

- Selecting a live-follow account now updates the right inspector instead of
  requiring operators to correlate `/status` JSON manually.
- The inspector joins `/status.liveFollow.targets.accounts[]` with
  `/status.accountMirrorStatus.entries[]` so it can show expected/detected
  identity, account level, browser profile, provider guard state, timing,
  content counts, mirror completeness, active completion, and API route chips.
- A compact provider-cell inspect button was added because row-ref clicks were
  unreliable in `agent-browser`; the full row remains selectable for normal
  pointer and keyboard use.

Additional screenshot:

- `/tmp/auracall-operator-ux-dogfood/live-follow-account-inspector.png` -
  Health page right inspector populated for `chatgpt / wsl-chrome-3`, including
  SoyLei expected/detected identity and Pro account level.

Validation evidence:

- `pnpm run ux:build` passed.
- `pnpm exec tsc -p tsconfig.build.json --pretty false` passed.
- `pnpm run install:user-runtime` passed.
- `curl http://auracall.localhost/status` reported `ok=true`, live follow
  `healthy`, 9 live-follow accounts, 5 enabled accounts, and 0 attention
  targets.
- `agent-browser` loaded `http://auracall.localhost/dashboard`, clicked the
  `Inspect chatgpt wsl-chrome-3` control, verified the right inspector shows
  identity, account level, guard, timing, counts, and route chips, then saved
  the screenshot above.
