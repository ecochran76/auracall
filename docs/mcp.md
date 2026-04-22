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

### `team_run`
- Inputs: either compact fields (`teamId`, `objective`, optional `title`, `promptAppend`, `structuredContext`, `responseFormat?: "text" | "markdown" | "json"`, `outputContract?: "auracall.step-output.v1"`, `maxTurns`, and bounded `localActionPolicy`) or a prebuilt flattened `taskRunSpec` validated with Aura-Call's live `TaskRunSpec` schema.
- Behavior: creates and executes one bounded team run through the existing `TaskRunSpec -> TeamRun -> runtimeRun` path. The structured result is `object = "team_run"` with `taskRunSpec` and deterministic execution ids/status.
- Provenance: compact MCP-created runs are stamped with `trigger = "mcp"` and `requestedBy.kind = "mcp"`; prebuilt `taskRunSpec` inputs preserve their validated provenance.

### `media_generation`
- Inputs: `provider: "gemini" | "grok"`, `mediaType: "image" | "video"`, `prompt`, and optional `model`, `transport`, `count`, `size`, `aspectRatio`, `outputDir`, and metadata.
- Behavior: creates one request through Aura-Call's shared media-generation contract and returns `object = "media_generation"` with durable artifact metadata. The tool surface is live now; provider-backed Gemini/Grok execution remains gated until the media adapters are wired.
- Provenance: MCP-created media requests are stamped with `source = "mcp"` in the structured response metadata.

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
