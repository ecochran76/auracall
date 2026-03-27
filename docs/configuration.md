# Local configuration (JSON5)

Aura-Call reads layered config files (system → user → project tree). Files use JSON5 parsing, so trailing commas and comments are allowed.

If no config file exists, Aura-Call scaffolds a default `auracallProfile` using your detected browser profile. You can also run `auracall profile scaffold` to regenerate it.
Use `auracall config migrate` to write a v2-style layout from an existing config file:

```sh
auracall config migrate --dry-run
auracall config migrate --output ~/.auracall/config.v2.json
auracall config migrate --in-place --strip-legacy
```

When invoking via `tsx` in dev, prefer Node’s `--import` to avoid `pnpm` swallowing `--dry-run`:

```sh
node --import tsx bin/auracall.ts config migrate --dry-run
```

## Example (`~/.auracall/config.json`)

```json5
{
  version: 2,

  // Select which profile to use by default
  auracallProfile: "default",

  globals: {},

  // Browser defaults shared by profiles (override per profile)
  browserDefaults: {
    chromePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    chromeProfile: "Default",
    chromeCookiePath: "/Users/me/Library/Application Support/Google/Chrome/Default/Network/Cookies",
  },

  llmDefaults: {
    model: "gpt-5.2-pro",
  },

  // Optional global service URL defaults (override per profile)
  services: {
    chatgpt: { url: "https://chatgpt.com/" },
    gemini: { url: "https://gemini.google.com/app" },
    grok: { url: "https://grok.com/" },
  },

  // Optional dev-only port range for new Chrome spawns
  dev: {
    browserPortRange: [45000, 45100],
  },

  profiles: {
    default: {
      // Profile-scoped defaults
      engine: "browser",     // or "api"
      search: "on",          // "on" | "off"
      defaultService: "chatgpt",
      keepBrowser: false,

      browser: {
        headless: false,
        hideWindow: false,
        serviceTabLimit: 3,
        blankTabLimit: 1,
        collapseDisposableWindows: true,
      },

      services: {
        chatgpt: {
          identity: { email: "me@example.com" },
          projectName: "Aura-Call",
          model: "gpt-5.2-pro",
          thinkingTime: "extended",
          interactiveLogin: false,
          manualLoginProfileDir: "/Users/me/.auracall/browser-profiles/default/chatgpt",
          features: {
            web_search: true,
            deep_research: false,
            company_knowledge: false,
            apps: ["projects", "gpts"]
          }
        },
        grok: {
          identity: { email: "me@example.com" },
        },
      },

      cache: {
        refresh: false,
        includeHistory: false,
        historyLimit: 200,
        historySince: null,
        rootDir: null,
        refreshHours: 6,
        useDetectedIdentity: false,
      },
    },
  },

  // Default target for `auracall serve` remote browser runs
  remote: {
    host: "192.168.64.2:9473",
    token: "c4e5f9...", // printed by `auracall serve`
  },

  // Azure OpenAI defaults (only used when endpoint is set)
  azure: {
    endpoint: "https://your-resource-name.openai.azure.com/",
    deployment: "gpt-5-1-pro",
    apiVersion: "2024-02-15-preview"
  },

  heartbeatSeconds: 30,     // default heartbeat interval
  filesReport: false,       // default per-file token report
  background: true,         // default background mode for API runs
  sessionRetentionHours: 72, // prune cached sessions older than 72h before each run (0 disables)
  promptSuffix: "// signed-off by me", // appended to every prompt
  apiBaseUrl: "https://api.openai.com/v1" // override for LiteLLM / custom gateways
}
```

## Layered config + precedence

Config layers are merged in this order (later wins):

1. System config (`/etc/auracall/config.json` on Linux/macOS, `%ProgramData%\\auracall\\config.json` on Windows, or `AURACALL_SYSTEM_CONFIG_PATH`)
2. User config (`~/.auracall/config.json` or `AURACALL_CONFIG_PATH`)
3. Project configs found while walking up from the working directory:
   - `./.auracall/config.json`
   - `./auracall.config.json`

Within each file, later CLI flags still override config, and environment variables continue to override defaults where documented.

- `engine`/`search` can be set globally or inside an `auracallProfile`; profile values apply when `auracallProfile` is selected and no CLI flag overrides them.
- Use `--profile <name>` to switch profiles for a single run (overrides config).
- On WSL, keep the primary WSL Chrome setup on `profiles.default` if you want to reuse the long-lived managed profile at `~/.auracall/browser-profiles/default/<service>`; use separate named profiles for Windows Chrome or other experimental runtimes.
- `model`, `filesReport`, `heartbeatSeconds`, and `apiBaseUrl` in config override the auto-detected values unless explicitly set on the CLI.
- If `azure.endpoint` (or `--azure-endpoint`) is set, Aura-Call reads `AZURE_OPENAI_API_KEY` first and falls back to `OPENAI_API_KEY` for GPT models.
- Remote browser defaults follow the same order: `--remote-host/--remote-token` win, then `remote.host` / `remote.token` (or `remoteHost` / `remoteToken`) in the config, then `AURACALL_REMOTE_HOST` / `AURACALL_REMOTE_TOKEN` if still unset.
- `OPENAI_API_KEY` only influences engine selection when neither the CLI nor `config.json` specify an engine (API when present, otherwise browser).
- `AURACALL_NOTIFY*` env vars still layer on top of the config’s `notify` block.
- `sessionRetentionHours` controls the default value for `--retain-hours`. When unset, `AURACALL_RETAIN_HOURS` (if present) becomes the fallback, and the CLI flag still wins over both.
- `services.<service>.url` defines global service URL defaults; `profiles.<name>.services.<service>.url` can override them per profile.
- `services.<service>.interactiveLogin` can set a global login mode default; `profiles.<name>.services.<service>.interactiveLogin` overrides it per profile (legacy `manualLogin` still works).
- `services.<service>.manualLoginProfileDir` (and its per-profile override) control the persistent profile dir used for interactive login.
- `interactiveLogin` is the preferred name; legacy `manualLogin` keys keep working with deprecation warnings.
- `services.<service>.features` holds provider-specific feature flags. Typical keys:
  - `chatgpt`: `web_search`, `deep_research`, `company_knowledge`, `apps`
  - `grok`: `search`, `sources`, `apps`
  - `gemini`: `search`, `grounding`, `apps`
- Headless/headful settings belong to the browser layer; keep using `browser.headless` and `browser.hideWindow` until the rename lands.
- `services.<service>.thinkingTime` can set a per-service default for ChatGPT Thinking/Pro models (overrides `profiles.<name>.browser.thinkingTime` when set).
- `profiles.<name>.services.<service>.identity` sets the username/email used for cache identity; auto-scraping is disabled unless `profiles.<name>.cache.useDetectedIdentity` is set.
- `profiles.<name>.browser.profilePath` + `profileName` define the cookie source profile; `cookiePath` overrides the derived Cookies DB location. `profileName` accepts either the on-disk directory (e.g. `Profile 1`) or the friendly UI name (e.g. `Aura-Call 2`).
- `profiles.<name>.defaultService` chooses the default browser target when no explicit model or `--target` is set.
- `profiles.<name>.cache.*` sets defaults for `auracall cache --refresh` (including `refreshHours` and `rootDir`).
- `dev.browserPortRange` sets the fallback DevTools port range used when spawning new Chrome instances (profile/browser overrides still win).
- `browser.*` legacy keys are still accepted and override profile defaults when present (CLI flags still win).
- `browser.debugPortStrategy` controls how Aura-Call chooses a DevTools port when it launches Chrome. `fixed` honors `browser.debugPort` / `AURACALL_BROWSER_PORT`; `auto` lets Chrome choose and then adopts the real endpoint from `DevToolsActivePort`. `AURACALL_BROWSER_PORT_STRATEGY` can override it at runtime. On WSL when `browser.chromePath` points at a Windows Chrome executable, Aura-Call now defaults to `auto`.
- `browser.debugPort` and `--browser-port` are best treated as fixed-port escape hatches for local debugging or special manual workflows. They are no longer the recommended primary configuration for integrated WSL -> Windows Chrome runs.
- `browser.blockingProfileAction` controls how Aura-Call handles a running Chrome profile without DevTools (`fail`, `restart`, `restart-managed`). Default is `restart-managed` (only restarts Aura-Call-managed profiles). (`restart-auracall` is still accepted as an alias.)
- `browser.managedProfileRoot` sets the profile root considered Aura-Call-managed when `blockingProfileAction=restart-managed`.
- `browser.serviceTabLimit`, `browser.blankTabLimit`, and `browser.collapseDisposableWindows` control Aura-Call’s tab/window cleanup policy per profile. Defaults are `3`, `1`, and `true`: reuse exact/blank/same-origin/compatible-host tabs first, then keep at most 3 matching-service tabs, at most 1 spare blank tab, and collapse extra windows only when every tab in that window is disposable for the same profile/service action.

If the config is missing or invalid, Aura-Call falls back to defaults and prints a warning for parse errors.

Chromium-based browsers usually need both `chromePath` (binary) and `chromeCookiePath` (cookie DB) set so automation can launch the right executable and reuse your login. See [docs/chromium-forks.md](chromium-forks.md) for detailed paths per browser/OS.

## Session retention

Each invocation can optionally prune cached sessions before starting new work:

- `--retain-hours <n>` deletes sessions older than `<n>` hours right before the run begins. Use `0` (or omit the flag) to skip pruning.
- In `config.json`, set `sessionRetentionHours` to apply pruning automatically for every CLI/TUI/MCP invocation.
- Set `AURACALL_RETAIN_HOURS` in the environment to override the config on shared machines without editing the JSON file.

Under the hood, pruning removes entire session directories (metadata + logs). The command-line cleanup command (`auracall session --clear`) still exists when you need to wipe everything manually.

## API timeouts

- `--timeout <seconds|auto>` controls the overall API deadline for a run.
- Defaults: `auto` = 60 m for `gpt-5.1-pro`; non-pro API models use `120s` if you don’t set a value.
- Heartbeat messages print the live remaining time so you can see when the client-side deadline will fire.
