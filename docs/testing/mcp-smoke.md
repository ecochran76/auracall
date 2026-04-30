# MCP Smoke Tests (local auracall-mcp)

Use these steps to validate CLI + MCP end-to-end before releasing. The npm package now ships `auracall-mcp`, but the local build remains the fastest path for development (see the `auracall-local` entry in `config/mcporter.json`).

## Checklist (run all four lanes)
1) CLI (API engine)
2) CLI (browser engine)
3) MCP via mcporter (API + browser)
4) Claude Code via MCP (API defaults)

Shared prereqs
- `pnpm build` (ensures `dist/bin/auracall-mcp.js` exists)
- `OPENAI_API_KEY` set in env
- `config/mcporter.json` contains the `oracle` entry pointing to `npx -y @steipete/oracle auracall-mcp` (already committed).
- mcporter available at `/Users/steipete/Library/pnpm/global/5/node_modules/.bin/mcporter`
- For browser runs: Chrome installed; macOS host (headful).
- macOS notifications: `vendor/oracle-notifier/OracleNotifier.app` ships with the package (preferred); falls back to toasted-notifier if missing/broken.

## CLI smokes
- API:
  ```bash
  pnpm run auracall -- --engine api --model gpt-5.2 --prompt "API smoke: say two words"
  ```
- Browser:
  ```bash
  pnpm run auracall -- --engine browser --model "GPT-5.2" --prompt "Browser smoke: say two words"
  ```

## MCP via mcporter
1) List tools/schema to confirm discovery (use the local entry):
   ```bash
   mcporter list auracall-local --schema --config config/mcporter.json
   ```

2) API consult (GPT-5.2):
   ```bash
   mcporter call auracall-local.consult \
     prompt:"Say hello from GPT-5.2" \
     model:"gpt-5.2" \
     engine:"api" \
     --config config/mcporter.json
   ```

3) Sessions list:
   ```bash
   mcporter call auracall-local.sessions hours:12 limit:3 --config config/mcporter.json
   ```

4) Session detail:
   ```bash
   mcporter call auracall-local.sessions id:"say-hello-from-gpt-5-2" detail:true --config config/mcporter.json
   ```

5) Browser smoke:
   ```bash
   mcporter call auracall-local.consult \
     prompt:"Browser smoke" \
     model:"GPT-5.2" \
     engine:"browser" \
     --config config/mcporter.json
   ```
   Uses a built-in browserConfig (ChatGPT URL + cookie sync) and the provided model label for the picker (heads-up: if the ChatGPT UI renames the model label, this may need an update).

## MCP `api_status` against local API

Use this to verify MCP operators can assert the local API scheduler posture
without shelling out to `auracall api status`.

1) Refresh the installed user runtime:
   ```bash
   pnpm run install:user-runtime
   ```

2) Run both local API posture smokes:
   ```bash
   pnpm tsx scripts/smoke-api-status-mcp.ts --mode both --port 18081
   ```

Expected output:
```text
disabled: posture=disabled state=disabled port=18081
enabled: posture=scheduled state=scheduled port=18082
```

The enabled smoke starts `auracall api serve` with
`--account-mirror-scheduler-interval-ms 600000` and expects `scheduled`, not
`ready`, because the scheduler arms its cadence timer immediately. The smoke
does not enable `--account-mirror-scheduler-execute`, does not launch browsers,
and stops each temporary API server before exiting.

## Claude Code smoke (tmux + cli)

Use this to verify Claude Code can reach the Aura-Call MCP server end-to-end.

Prereqs
- `pnpm build`
- `OPENAI_API_KEY` exported (for the API engine default)
- Aura-Call MCP registered with Claude (once per project):  
  `claude mcp add --transport stdio oracle -- auracall-mcp`

Steps
1) Start Claude in tmux:
   ```bash
   tmux new -s claude-smoke 'cd /Users/steipete/Projects/oracle && OPENAI_API_KEY=$OPENAI_API_KEY claude --permission-mode bypassPermissions --mcp-config ~/.mcp/oracle.json'
   ```
2) From another shell, use the helper to drive it:
   ```bash
   bun scripts/agent-send.ts --session claude-smoke --wait-ms 800 --entry double -- \
     'Call the auracall sessions MCP tool with {"limit":1,"detail":true} and show the result'
   ```
3) Validate the pane shows a successful `auracall sessions` tool call (or adjust `--mcp-config` if it reports no tools). When finished, `tmux kill-session -t claude-smoke`.

See `docs/mcp.md` for full tool/resource schemas and behavior.

Tip: The MCP consult tool pulls defaults from your `~/.auracall/config.json` (engine/model/search/prompt suffix/heartbeat/background/filesReport) when the call doesn’t override them.
