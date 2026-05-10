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
