# Testing quickstart

- Unit/type tests: `pnpm test` (Vitest) and `pnpm run check` (typecheck).
- Gemini unit/regression: `pnpm vitest run tests/gemini.test.ts tests/gemini-web`.
- Browser smokes: `pnpm test:browser` (builds, checks DevTools port 45871 or `ORACLE_BROWSER_PORT`, then runs headful browser smokes with GPT-5.2 for most cases and GPT-5.2 Pro for the reattach + markdown checks). Requires a signed-in Chrome profile; runs headful but hides the window by default unless Chrome forces focus.
- Grok browser smoke: `pnpm test:grok-smoke` (requires an active Grok session; uses `ORACLE_BROWSER_PORT` or the Oracle browser registry when available).
- To start a DevTools session manually, run `pnpm tsx scripts/start-devtools-session.ts --url=https://grok.com` (prints the host/port and launches Chrome if needed).
- Live API smokes: `ORACLE_LIVE_TEST=1 OPENAI_API_KEY=… pnpm test:live` (excludes OpenAI pro), `ORACLE_LIVE_TEST=1 OPENAI_API_KEY=… pnpm test:pro` (OpenAI pro live). Expect real usage/cost.
- Gemini web (cookie) live smoke: `ORACLE_LIVE_TEST=1 pnpm vitest run tests/live/gemini-web-live.test.ts` (requires a signed-in Chrome profile at `gemini.google.com`).
- MCP focused: `pnpm test:mcp` (builds then stdio smoke via mcporter).
- If browser DevTools is blocked on WSL, allow the chosen port (`ORACLE_BROWSER_PORT`/`ORACLE_BROWSER_DEBUG_PORT` for manual pinning; `pnpm test:browser` defaults to 45871). See `scripts/test-browser.ts` output for firewall hints.
- Scoped browser runs can be smoke-tested by passing `--project-id` / `--conversation-id` to a browser command; they should not change default config behavior.
