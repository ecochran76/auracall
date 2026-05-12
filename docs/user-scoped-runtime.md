# User-Scoped Runtime

Use this when you want the day-to-day `auracall` command and local API service
to run from an installed user-owned package copy instead of from the live repo
checkout. This is the primary dogfood/install path while public npm
distribution is deferred.

## Install Runtime And API Service

Use this as the default local upgrade path:

```bash
pnpm run install:user-runtime-service
```

The command installs the current checkout into `~/.auracall/user-runtime`,
refreshes the `~/.local/bin/auracall` wrappers, installs or updates the
`auracall-api.service` user unit, and restarts the API service from the new
runtime.

Verify:

```bash
systemctl --user status auracall-api.service
curl http://127.0.0.1:18095/status
```

## Install From The Current Checkout

Use this lower-level command only when you want to refresh the installed CLI
without touching the API service:

```bash
pnpm run install:user-runtime
```

The command:

- runs `pnpm run build`
- packs the current checkout with `npm pack`
- installs the package tarball into `~/.auracall/user-runtime`
- writes wrappers to `~/.local/bin/auracall` and
  `~/.local/bin/auracall-mcp`

Verify:

```bash
~/.local/bin/auracall --version
~/.local/bin/auracall config show --team auracall-solo
```

Make sure `~/.local/bin` is on `PATH` if you want `auracall` to resolve to the
user-scoped runtime by default.

## Options

```bash
pnpm run install:user-runtime -- --prefix ~/.auracall/user-runtime --bin-dir ~/.local/bin
pnpm run install:user-runtime -- --skip-build
pnpm run install:user-runtime -- --dry-run
```

Use `--skip-build` only when `dist/` already reflects the current checkout.

## Runtime State

The installed package copy is separate from the repo, but Aura-Call runtime
state stays in the normal user state directory:

- config: `~/.auracall/config.json`
- browser/account state: `~/.auracall/browser-state.json`
- managed browser profiles: `~/.auracall/browser-profiles/...`
- runtime runs and runners: `~/.auracall/runtime/...`

That means the installed runtime can reuse the same signed-in managed browser
profiles that repo dogfooding used.

## User API Service

Install or refresh only the local API service:

```bash
pnpm run install:user-api-service
```

The command writes `~/.config/systemd/user/auracall-api.service`, enables it,
and restarts it. The unit runs:

```bash
~/.local/bin/auracall api serve
```

`api serve` reads host, port, dashboard URLs, and the account mirror scheduler
from `~/.auracall/config.json`, so the service stays pinned to the configured
operator surface. Logs append to:

```bash
~/.auracall/logs/api-18095.log
```

The installer also creates a user-scoped dotenv file when it is missing:

```bash
~/.auracall/api.env
```

The systemd unit loads that file with `EnvironmentFile=-%h/.auracall/api.env`.
The generated file is `0600` and contains a random local API key plus
OpenAI-compatible client defaults:

```bash
AURACALL_API_AUTH_REQUIRED=1
AURACALL_API_KEY_ID=local-agent
AURACALL_API_KEY=...
AURACALL_BASE_URL=http://127.0.0.1:18095/v1
AURACALL_MODEL=agent:instant-chatgpt-ecochran76
OPENAI_BASE_URL=http://127.0.0.1:18095/v1
OPENAI_API_KEY=...
```

Other local agents can load this file directly and call the AuraCall API with
the standard OpenAI client knobs. Keep the file outside the repo; rotate it by
editing or deleting `~/.auracall/api.env` and reinstalling/restarting the user
API service.

Privileged local MCP operators can also issue additional scoped keys with
`api_key_issue`. The tool appends `AURACALL_API_KEY_IDS` plus matching
`AURACALL_API_KEY_<ID>` variables for one agent or team, validates the target
against the effective config plus registry catalog, and returns the
OpenAI-compatible base URL/key/model values. Restart `auracall-api.service`
after issuing a key so systemd reloads this environment file.

Unscoped operator API clients can use the same issue path through
`POST /v1/config/api-keys/issue`. Scoped execution keys cannot call this route.
The issue response returns the new secret once, so store it immediately in the
calling agent's user-scoped environment. The Agents / Teams dashboard exposes
the same operator-only key issue flow.

Use `pnpm run smoke:api-key-issue` to verify the issue route against a
short-lived local API fixture and temporary env file without mutating
`~/.auracall/api.env`.

Use MCP `api_key_diagnostics` before or after restart to inspect
`~/.auracall/api.env` without returning secrets. Use
`GET /v1/config/agent-diagnostics` to inspect the running API process's loaded
key ids and effective agent/team reachability. Use
`auracall config agent-diagnostics` for the same local registry/env-file report
without requiring the API service to be running.

Verify:

```bash
systemctl --user status auracall-api.service
curl http://127.0.0.1:18095/status
```

Useful options:

```bash
pnpm run install:user-api-service -- --dry-run
pnpm run install:user-api-service -- --no-start
pnpm run install:user-api-service -- --env ~/.auracall/api.env
pnpm run install:user-api-service -- --log ~/.auracall/logs/api-18095.log
```
