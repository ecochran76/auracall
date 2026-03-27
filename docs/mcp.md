# MCP Server

`auracall-mcp` is a minimal MCP stdio server that mirrors the Aura-Call CLI. It shares session storage with the CLI (`~/.auracall/sessions` or `AURACALL_HOME_DIR`) so you can mix and match: run with the CLI, inspect or re-run via MCP, or vice versa.

## Tools

### `consult`
- Inputs: `prompt` (required), `files?: string[]` (globs), `model?: string` (defaults to CLI), `engine?: "api" | "browser"` (CLI auto-defaults), `slug?: string`.
- Behavior: starts a session, runs it with the chosen engine, returns final output + metadata. Background/foreground follows the CLI (e.g., GPT‑5 Pro detaches by default).
- Logging: emits MCP logs (`info` per line, `debug` for streamed chunks with byte sizes). If browser prerequisites are missing, returns an error payload instead of running.

### `sessions`
- Inputs: `{id?, hours?, limit?, includeAll?, detail?}` mirroring `auracall status` / `auracall session`.
- Behavior: without `id`, returns a bounded list of recent sessions. With `id`/slug, returns a summary row; set `detail: true` to fetch full metadata, log, and stored request body.

## Resources
- `auracall-session://{id}/{metadata|log|request}` — read-only resources that surface stored session artifacts via MCP resource reads.

## Background / detach behavior
- Same as the CLI: heavy models (e.g., GPT‑5 Pro) detach by default; reattach via `auracall session <id>` / `auracall status`. MCP does not expose extra background flags.

## Launching & usage
- Installed from npm:
  - One-off: `npx auracall auracall-mcp`
  - Global: `auracall-mcp`
- From the repo (contributors):
  - `pnpm build`
  - `pnpm mcp` (or `auracall-mcp` in the repo root)
- mcporter example (stdio):
  ```json
  {
    "name": "auracall",
    "type": "stdio",
    "command": "npx",
    "args": ["auracall", "auracall-mcp"]
  }
  ```
- Project-scoped Claude (.mcp.json) example:
  ```json
  {
    "mcpServers": {
      "auracall": { "type": "stdio", "command": "npx", "args": ["auracall", "auracall-mcp"] }
    }
  }
  ```
- Tools and resources operate on the same session store as `auracall status|session`.
- Defaults (model/engine/etc.) come from your Aura-Call CLI config; see `docs/configuration.md` or `~/.auracall/config.json`.
