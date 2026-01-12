# Local configuration (JSON5)

Oracle reads layered config files (system → user → project tree). Files use JSON5 parsing, so trailing commas and comments are allowed.

If no config file exists, Oracle scaffolds a default `oracleProfile` using your detected browser profile. You can also run `oracle profile scaffold` to regenerate it.

## Example (`~/.oracle/config.json`)

```json5
{
  // Select which oracleProfile to use by default
  oracleProfile: "default",

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

  oracleProfiles: {
    default: {
      // Profile-scoped defaults
      engine: "browser",     // or "api"
      search: "on",          // "on" | "off"
      defaultService: "chatgpt",
      keepBrowser: false,

      browser: {
        chromePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        profilePath: "/Users/me/Library/Application Support/Google/Chrome",
        profileName: "Default",
        cookiePath: "/Users/me/Library/Application Support/Google/Chrome/Default/Network/Cookies",
        headless: false,
        hideWindow: false,
      },

      services: {
        chatgpt: {
          identity: { email: "me@example.com" },
          projectName: "Oracle",
          model: "gpt-5.2-pro",
          thinkingTime: "extended",
          manualLogin: false,
          manualLoginProfileDir: "/Users/me/.oracle/browser-profile",
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

  // Default target for `oracle serve` remote browser runs
  remote: {
    host: "192.168.64.2:9473",
    token: "c4e5f9...", // printed by `oracle serve`
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

1. System config (`/etc/oracle/config.json` on Linux/macOS, `%ProgramData%\\oracle\\config.json` on Windows, or `ORACLE_SYSTEM_CONFIG_PATH`)
2. User config (`~/.oracle/config.json` or `ORACLE_CONFIG_PATH`)
3. Project configs found while walking up from the working directory:
   - `./.oracle/config.json`
   - `./oracle.config.json`

Within each file, later CLI flags still override config, and environment variables continue to override defaults where documented.

- `engine`/`search` can be set globally or inside an `oracleProfile`; profile values apply when `oracleProfile` is selected and no CLI flag overrides them.
- Use `--oracle-profile <name>` to switch profiles for a single run (overrides config).
- `model`, `filesReport`, `heartbeatSeconds`, and `apiBaseUrl` in config override the auto-detected values unless explicitly set on the CLI.
- If `azure.endpoint` (or `--azure-endpoint`) is set, Oracle reads `AZURE_OPENAI_API_KEY` first and falls back to `OPENAI_API_KEY` for GPT models.
- Remote browser defaults follow the same order: `--remote-host/--remote-token` win, then `remote.host` / `remote.token` (or `remoteHost` / `remoteToken`) in the config, then `ORACLE_REMOTE_HOST` / `ORACLE_REMOTE_TOKEN` if still unset.
- `OPENAI_API_KEY` only influences engine selection when neither the CLI nor `config.json` specify an engine (API when present, otherwise browser).
- `ORACLE_NOTIFY*` env vars still layer on top of the config’s `notify` block.
- `sessionRetentionHours` controls the default value for `--retain-hours`. When unset, `ORACLE_RETAIN_HOURS` (if present) becomes the fallback, and the CLI flag still wins over both.
- `services.<service>.url` defines global service URL defaults; `oracleProfiles.<name>.services.<service>.url` can override them per profile.
- `services.<service>.manualLogin` can set a global login mode default; `oracleProfiles.<name>.services.<service>.manualLogin` overrides it per profile (legacy `browser.manualLogin` still works).
- `services.<service>.manualLoginProfileDir` (and its per-profile override) control the persistent profile dir used for manual login.
- Manual login will be renamed to `interactiveLogin` (or `loginMode`) in a future config update; legacy keys will keep working with deprecation warnings.
- Headless/headful settings belong to the browser layer; keep using `browser.headless` and `browser.hideWindow` until the rename lands.
- `services.<service>.thinkingTime` can set a per-service default for ChatGPT Thinking/Pro models (overrides `oracleProfiles.<name>.browser.thinkingTime` when set).
- `oracleProfiles.<name>.services.<service>.identity` sets the username/email used for cache identity; auto-scraping is disabled unless `oracleProfiles.<name>.cache.useDetectedIdentity` is set.
- `oracleProfiles.<name>.browser.profilePath` + `profileName` define the cookie source profile; `cookiePath` overrides the derived Cookies DB location. `profileName` accepts either the on-disk directory (e.g. `Profile 1`) or the friendly UI name (e.g. `Oracle 2`).
- `oracleProfiles.<name>.defaultService` chooses the default browser target when no explicit model or `--target` is set.
- `oracleProfiles.<name>.cache.*` sets defaults for `oracle cache --refresh` (including `refreshHours` and `rootDir`).
- `dev.browserPortRange` sets the fallback DevTools port range used when spawning new Chrome instances (profile/browser overrides still win).
- `browser.*` legacy keys are still accepted and override profile defaults when present (CLI flags still win).
- `browser.blockingProfileAction` controls how Oracle handles a running Chrome profile without DevTools (`fail`, `restart`, `restart-oracle`). Default is `restart-oracle` (only restarts Oracle-managed profiles).

If the config is missing or invalid, Oracle falls back to defaults and prints a warning for parse errors.

Chromium-based browsers usually need both `chromePath` (binary) and `chromeCookiePath` (cookie DB) set so automation can launch the right executable and reuse your login. See [docs/chromium-forks.md](chromium-forks.md) for detailed paths per browser/OS.

## Session retention

Each invocation can optionally prune cached sessions before starting new work:

- `--retain-hours <n>` deletes sessions older than `<n>` hours right before the run begins. Use `0` (or omit the flag) to skip pruning.
- In `config.json`, set `sessionRetentionHours` to apply pruning automatically for every CLI/TUI/MCP invocation.
- Set `ORACLE_RETAIN_HOURS` in the environment to override the config on shared machines without editing the JSON file.

Under the hood, pruning removes entire session directories (metadata + logs). The command-line cleanup command (`oracle session --clear`) still exists when you need to wipe everything manually.

## API timeouts

- `--timeout <seconds|auto>` controls the overall API deadline for a run.
- Defaults: `auto` = 60 m for `gpt-5.1-pro`; non-pro API models use `120s` if you don’t set a value.
- Heartbeat messages print the live remaining time so you can see when the client-side deadline will fire.
