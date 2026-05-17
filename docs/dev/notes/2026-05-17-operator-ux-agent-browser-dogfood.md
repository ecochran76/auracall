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

## Validation

- `pnpm run ux:build`
- `pnpm run build`
- `pnpm run install:user-runtime`
- `systemctl --user restart auracall-api.service`
- `curl -fsS http://auracall.localhost/status`
- `agent-browser` desktop and mobile screenshots against `http://auracall.localhost/dashboard`
