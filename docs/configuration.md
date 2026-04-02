# Local configuration (JSON5)

Aura-Call reads layered config files (system → user → project tree). Files use JSON5 parsing, so trailing commas and comments are allowed.

If no config file exists, Aura-Call scaffolds a default `auracallProfile` using your detected browser profile. The scaffold now emits a named browser-profile bridge (`browserFamilies.default` plus `profiles.default.browserFamily = "default"`) instead of only teaching profile-local browser blobs. You can also run `auracall profile scaffold` to regenerate it.
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

## Terminology

Use these terms consistently:

- `browser profile`
  - a browser-service level runtime/account family config such as `default` or
    `wsl-chrome-2`
  - this owns browser execution concerns like executable path, source cookie
    path, managed profile root, WSL-vs-Windows behavior, and debug-port policy
- `source browser profile`
  - the native Chromium profile used for bootstrap/cookie sourcing
  - examples: `Default`, `Profile 1`, `Profile 2`
- `managed browser profile`
  - the Aura-Call-owned automation profile directory derived from the browser
    profile plus service
- `AuraCall runtime profile`
  - the top-level Aura-Call config entry selected by `auracallProfile` /
    `--profile`
  - this chooses a browser profile and adds service/model/project/cache defaults

In short:
- browser profile = browser/account family
- AuraCall runtime profile = workflow defaults layered on top of a browser profile

Reserved future layers:
- `agents`
  - will reference AuraCall runtime profiles and add instructions/persona/task defaults
- `teams`
  - will group agents without redefining browser or runtime-profile state

Target-model note:
- the current public bridge keys are still:
  - `browserFamilies`
  - `profiles`
- the longer-term target shape is documented in
  [config-model-target-shape.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-target-shape.md)
  and will likely evolve toward:
  - `browserProfiles`
  - `runtimeProfiles`
- until that refactor lands, prefer treating:
  - `browserFamilies` as the browser-profile bridge
  - `profiles` as the AuraCall runtime-profile bridge

## Example (`~/.auracall/config.json`)

```json5
{
  version: 2,

  // Select which AuraCall runtime profile to use by default
  auracallProfile: "default",

  globals: {},

  // Browser defaults shared by browser profiles (override per runtime profile)
  browserDefaults: {
    chromePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    chromeProfile: "Default",
    chromeCookiePath: "/Users/me/Library/Application Support/Google/Chrome/Default/Network/Cookies",
  },

  // Optional named browser profiles. AuraCall runtime profiles can point at
  // one with profiles.<name>.browserFamily and still override fields locally.
  browserFamilies: {
    "wsl-chrome-2": {
      chromePath: "/usr/bin/google-chrome",
      chromeProfile: "Default",
      chromeCookiePath: "/home/me/.config/google-chrome/Default/Network/Cookies",
      bootstrapCookiePath: "/home/me/.config/google-chrome/Default/Network/Cookies",
      display: ":0.0",
      managedProfileRoot: "/home/me/.auracall/browser-profiles",
      wslChromePreference: "wsl"
    }
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
      // AuraCall runtime-profile defaults
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
        store: "dual", // json | sqlite | dual
        refresh: false,
        includeHistory: true,
        includeProjectOnlyConversations: true,
        historyLimit: 2000,
        historySince: null,
        cleanupDays: 365,
        rootDir: null,
        refreshHours: 6,
        useDetectedIdentity: false,
      },
    },
    work: {
      // Separate ChatGPT workspace context for the same identity
      engine: "browser",
      defaultService: "chatgpt",
      keepBrowser: false,
      services: {
        chatgpt: {
          identity: { email: "me@example.com" },
          // Equivalent to hard-pinning the workspace URL:
          projectId: "g-p-123456789",
        },
      },
    },
    // Runtime profile that uses a secondary browser profile for another account
    "wsl-chrome-2": {
      engine: "browser",
      browserFamily: "wsl-chrome-2",
      defaultService: "chatgpt",
      keepBrowser: false,
      services: {
        chatgpt: {
          identity: { email: "consult@polymerconsultingroup.com" },
          // Optional advanced override. By default Aura-Call derives:
          // ~/.auracall/browser-profiles/wsl-chrome-2/chatgpt
          manualLoginProfileDir: "/Users/me/.auracall/browser-profiles/wsl-chrome-2/chatgpt",
        },
      },
    },
  },

  // Reserved future layers. Parsed today, not executed yet.
  agents: {
    researcher: {
      runtimeProfile: "default",
      description: "Reserved future agent config",
      instructions: "Not yet executed by Aura-Call"
    }
  },
  teams: {
    ops: {
      agents: ["researcher"],
      description: "Reserved future team config"
    }
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
- Profile onboarding and login with managed profiles:
  - `auracall --profile <name> setup --chatgpt` runs the managed-profile setup for that profile and opens a login flow if needed.
  - `auracall --profile <name> login --chatgpt` opens only the managed-profile login flow so you can manually authenticate a second account.
  - `auracall --profile <name> setup --chatgpt --skip-login` verifies an existing session without reopening login.
  - Use `--chatgpt-url` or `profiles.<name>.services.chatgpt.projectId` once signed in to pin to a workspace.
- On WSL, keep the primary WSL Chrome setup on `profiles.default` if you want to reuse the long-lived managed profile at `~/.auracall/browser-profiles/default/<service>`.
- Use family names like `wsl-chrome-2` for secondary WSL account profiles (for example, `consult@polymerconsultingroup.com`) while keeping `default` as primary.
- Prefer a named `browserFamilies.<family>` block plus `profiles.<name>.browserFamily` for runtime/browser-profile wiring instead of teaching raw path wiring as the main pattern.
- `auracall wizard` now emits that browser-profile bridge directly for new profile setup.
- Use separate named profiles for Windows Chrome or other experimental runtimes.
- `model`, `filesReport`, `heartbeatSeconds`, and `apiBaseUrl` in config override the auto-detected values unless explicitly set on the CLI.
- If `azure.endpoint` (or `--azure-endpoint`) is set, Aura-Call reads `AZURE_OPENAI_API_KEY` first and falls back to `OPENAI_API_KEY` for GPT models.
- Remote browser defaults follow the same order: `--remote-host/--remote-token` win, then `remote.host` / `remote.token` (or `remoteHost` / `remoteToken`) in the config, then `AURACALL_REMOTE_HOST` / `AURACALL_REMOTE_TOKEN` if still unset.
- `OPENAI_API_KEY` only influences engine selection when neither the CLI nor `config.json` specify an engine (API when present, otherwise browser).
- `AURACALL_NOTIFY*` env vars still layer on top of the config’s `notify` block.
- `sessionRetentionHours` controls the default value for `--retain-hours`. When unset, `AURACALL_RETAIN_HOURS` (if present) becomes the fallback, and the CLI flag still wins over both.
- `services.<service>.url` defines global service URL defaults; `profiles.<name>.services.<service>.url` can override them per profile.
- `profiles.<name>.services.chatgpt.url` (or legacy `profiles.<name>.browser.url`) is the right way to pin a profile to a second ChatGPT workspace/project.
  - Example: `auracall --profile work "..."` uses `https://chatgpt.com/g/p-123456789` from `profiles.work`.
- If your preference is not a hard URL, use `profiles.<name>.services.<service>.projectId` or `.projectName`:
  - `projectId` is the most explicit; Aura-Call builds the scoped project route from it.
  - `projectName` is resolved via cache/name lookup at runtime and can be ambiguous if duplicate titles exist.
- Migration note:
  - If you already use `projectId`/`projectName` in profile service blocks, you can keep that path and avoid URL pinning entirely.
  - URL pinning is most useful when you want a literal target route (for example, a specific non-project chat folder URL) instead of config-driven project resolution.
- `services.<service>.interactiveLogin` can set a global login mode default; `profiles.<name>.services.<service>.interactiveLogin` overrides it per profile (legacy `manualLogin` still works).
- `services.<service>.manualLoginProfileDir` (and its per-runtime-profile override) controls the persistent managed browser profile dir used for interactive login.
  - Treat this as an advanced override. The default path is derived from `browser.managedProfileRoot + auracallProfile + service`.
- `interactiveLogin` is the preferred name; legacy `manualLogin` keys keep working with deprecation warnings.
- `services.<service>.features` holds provider-specific feature flags. Typical keys:
  - `chatgpt`: `web_search`, `deep_research`, `company_knowledge`, `apps`
  - `grok`: `search`, `sources`, `apps`
  - `gemini`: `search`, `grounding`, `apps`
- Headless/headful settings belong to the browser layer; keep using `browser.headless` and `browser.hideWindow` until the rename lands.
- `browser.hideWindow: true` is now the recommended default for headful browser automation. Aura-Call launches Chrome with `--start-minimized`, suppresses `Page.bringToFront()` on reuse paths, and only auto-hides windows it just launched itself. On WSL/X11, treat this as a no-focus-steal guarantee first and a literal minimized-state guarantee second, because Chrome's DevTools window-bounds API can still report `windowState: normal` while `_NET_ACTIVE_WINDOW` stays unchanged.
- `services.<service>.thinkingTime` can set a per-service default for ChatGPT Thinking/Pro models (overrides `profiles.<name>.browser.thinkingTime` when set).
- `profiles.<name>.services.<service>.identity` sets the username/email used for cache identity; auto-scraping is disabled unless `profiles.<name>.cache.useDetectedIdentity` is set.
- `profiles.<name>.browser.profilePath` + `profileName` define the source browser profile; `cookiePath` overrides the derived Cookies DB location. `profileName` accepts either the on-disk Chromium directory (for example `Profile 1`) or the friendly UI label.
- `profiles.<name>.defaultService` chooses the default browser target when no explicit model or `--target` is set.
- `agents` and `teams` are reserved top-level config blocks for the future config-model refactor. Aura-Call parses them today so the shape can be documented and tested, but they do not drive runtime behavior yet.
- `profiles.<name>.cache.*` sets defaults for cache behavior (including `store`, `refreshHours`, and `rootDir`).
- `profiles.<name>.cache.includeProjectOnlyConversations` controls whether refresh also inserts project-only conversation IDs that were not present in the global history snapshot.
- `profiles.<name>.cache.cleanupDays` sets the default retention window for `auracall cache cleanup --days`.
- Mirror-oriented cache defaults are usually `includeHistory: true`, `includeProjectOnlyConversations: true`, `historyLimit: 2000`, and `cleanupDays: 365`.
- `profiles.<name>.cache.store` controls cache backend: `json` keeps legacy JSON files only, `sqlite` uses SQLite only (`cache.sqlite` per provider+identity), and `dual` reads/writes SQLite plus the JSON mirror (recommended migration mode).
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
