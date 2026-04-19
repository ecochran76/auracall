# Local configuration (JSON5)

Aura-Call reads layered config files (system → user → project tree). Files use JSON5 parsing, so trailing commas and comments are allowed.

If no config file exists, Aura-Call scaffolds a default config using your
detected browser profile.

The primary documented shape is now:
- `browserProfiles`
- `runtimeProfiles`
- `runtimeProfiles.<name>.browserProfile`
- `version: 3`

The compatibility bridge shape still exists and still loads:
- `browserFamilies`
- `profiles`
- `profiles.<name>.browserFamily`
- typically `version: 2`

You can regenerate a file with `auracall profile scaffold`, use
`auracall wizard` for guided setup, or rewrite an existing file with
`auracall config migrate`.
Use `auracall config migrate` to write a v2-style layout from an existing config file:

```sh
auracall config migrate --dry-run
auracall config migrate --in-place --strip-legacy
auracall config migrate --output ~/.auracall/config.v3.json --strip-legacy
auracall profile scaffold --force
auracall wizard
auracall config migrate --bridge-shape --output ~/.auracall/config.bridge.json --strip-legacy
```

When invoking via `tsx` in dev, prefer Node’s `--import` to avoid `pnpm` swallowing `--dry-run`:

```sh
node --import tsx bin/auracall.ts config migrate --dry-run
```

`auracall config migrate`, `auracall profile scaffold`, and `auracall wizard`
now also print a
short bridge summary in the target-model terms so operators can immediately see
which AuraCall runtime profile and browser profile the written config points at.

Use `auracall config show` to inspect the active resolved model in the new
terminology without changing the stored bridge-key layout:

```sh
auracall config show
auracall config show --json
auracall config doctor
auracall config doctor --json
auracall config doctor --strict
auracall profile list
auracall profile list --json
```

The command reports the active AuraCall runtime profile, its referenced browser
profile, the resolved browser target, whether `defaultRuntimeProfile` or the
compatibility selector `auracallProfile` is present, and whether the current
bridge keys are present in the loaded config.

`config show` now also includes a read-only resolved-agent view so future
agent-aware tooling can inspect `agent -> runtimeProfile -> browserProfile`
resolution without rebuilding that chain from raw arrays.

`config show` now also includes a read-only resolved-team view so future
team-aware tooling can inspect `team -> agent -> runtimeProfile -> browserProfile`
resolution without rebuilding that chain from projected arrays.

When `--agent <name>` is passed, `config show` and `config doctor` also surface
the selected-agent resolution chain directly, including the selected agent,
resolved AuraCall runtime profile, and resolved browser profile.

When `--team <name>` is passed, `config show` and `config doctor` surface a
read-only team planning view directly:
- selected team resolution
- member agents
- each member's resolved AuraCall runtime profile
- each member's resolved browser profile

This does not enable team execution or parallelism. It is an inspection and
runtime-planning surface only.

Selector precedence is now explicit in those reports:
- runtime selection uses `--profile` first
- then `--agent`
- then the config default selector
- `--team` remains planning-only and never changes the active runtime selection

Stored session metadata now also preserves that selected-agent provenance as
`options.selectedAgentId`, so detached runs and postmortems can distinguish an
agent-selected run from one started directly with `--profile`.

`auracall status`, `auracall session <id>`, and the corresponding `--json`
surfaces now expose that stored selected-agent provenance directly, so you do
not need to open raw session metadata just to confirm how a run was selected.

The JSON forms now also include a `projectedModel` block that exposes
the target conceptual shape directly:
- `browserProfiles[]`
- `runtimeProfiles[]`
- `agents[]`
- `teams[]`
- `activeRuntimeProfileId`
- `activeBrowserProfileId`

Aura-Call now also accepts the target-shape keys on reads; this projection is
there so operators can inspect the normalized model directly.

Use `auracall profile list` when you want the inventory view instead:
- all AuraCall runtime profiles
- their browser-profile bridges
- their default services
- projected agents and their inherited runtime/browser context
- projected teams and their current agent membership, including unresolved
  members
- the available browser profiles in the current config

Use `auracall config doctor` when you want bridge-health checks instead:
- AuraCall runtime profiles with no explicit browser-profile reference
- runtime profiles that reference missing browser profiles
- agents that reference missing AuraCall runtime profiles
- teams that reference missing agents
- unused browser profiles
- legacy `auracallProfiles` still present
- pass `--strict` when warnings should return a nonzero exit code for scripts/CI
- `auracallProfiles` is now legacy inspection/fallback only:
  - Aura-Call still reports it when present
  - but current `profiles` / `runtimeProfiles` now stay ahead of it for
    active fallback selection

For future troubleshooting of bridge-shape vs target-shape vs mixed-shape
configs, see:

- [config-shape-troubleshooting.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-shape-troubleshooting.md)

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
  - the top-level Aura-Call config entry selected by
    `defaultRuntimeProfile` / `--profile`
  - compatibility key:
    - `auracallProfile`
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
- the preferred public shape is documented in
  [config-model-target-shape.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-target-shape.md)
  and uses:
  - `version: 3`
  - `defaultRuntimeProfile`
  - `browserProfiles`
  - `runtimeProfiles`
- Aura-Call now accepts the target-shape aliases for config loading:
  - `browserProfiles`
  - `runtimeProfiles`
  - `runtimeProfiles.<name>.browserProfile`
- precedence for dual-read is:
  - target keys win over bridge keys
  - mixed/conflicting configs are surfaced by `auracall config doctor`
- target-shape is now the default write mode for:
  - `config migrate`
  - `profile scaffold`
  - `wizard`
- `--target-shape` is still accepted explicitly, but is now mostly useful for
  scripts that want to state the intended write mode directly
- bridge keys remain the compatibility form:
  - usually `version: 2`
  - `auracallProfile` as the compatibility runtime-profile selector
  - `browserFamilies` as the browser-profile bridge
- `profiles` as the AuraCall runtime-profile bridge
- use `--bridge-shape` when you intentionally want compatibility bridge output
- when compatibility bridge output is requested from mixed-shape input:
  - target keys still supply the authoritative values
  - bridge output rewrites back to bridge-only keys instead of preserving a
    mixed-shape file

Transitional authoring note:
- new or cleaned-up service defaults should prefer:
  - `services.<service>`
  - `runtimeProfiles.<name>.services.<service>`
- some current CLI/browser entrypoints still resolve through the root
  `browser` block for transitional compatibility, especially:
  - `--project-id`
  - `--project-name`
  - `--conversation-id`
  - `--conversation-name`
  - `--browser-model-strategy`
  - `--browser-thinking-time`
  - `--browser-composer-tool`
- those CLI flags are still intentionally classified as supported transitional
  root-browser inputs under the current resolver contract
- narrowing checkpoint:
  - `--project-id` and `--project-name` now also mirror into the selected
    `runtimeProfiles.<name>.services.<defaultService>` slot when one concrete
    default service exists
  - `--conversation-id` and `--conversation-name` now also mirror into the
    selected `runtimeProfiles.<name>.services.<defaultService>` slot when one
    concrete default service exists
  - `--browser-model-strategy`, `--browser-thinking-time`, and
    `--browser-composer-tool` now also mirror into the selected
    `runtimeProfiles.<name>.services.<defaultService>` slot when one concrete
    default service exists
  - when no concrete default service exists, they remain root-browser-only
    inputs
- active service binding now prefers the service-scoped values when both the
  service-scoped and root-browser copies exist
- keep `manualLogin` / `manualLoginProfileDir` separate from that precedence:
  they remain browser-execution escape hatches
- treat that root-browser surface as a supported compatibility-alias input, not
  as the preferred long-term authoring layer
- current reassessment:
  - the first bounded compatibility-alias reconciliation pass is complete
  - keep this root-browser alias surface stable unless a later slice
    explicitly chooses deprecation or stronger reporting

Runtime host policy note:
- `runtime.localActions.shell` defines the host/runtime execution ceiling for
  built-in shell local actions
- task/team policy may narrow that ceiling, but should not widen it
- current staged values are:
  - `bounded-command`
  - `repo-automation`
  - `extended`
- this currently affects internal local-action execution paths rather than
  adding a new public CLI surface

Version policy:
- `version: 3` means the file is written in the primary target shape
- `version: 2` means the file is written in the compatibility bridge shape
- Aura-Call still loads either version permissively during the transition

## Primary Example (`~/.auracall/config.json`)

```json5
{
  version: 3,

  // Select which AuraCall runtime profile to use by default
  defaultRuntimeProfile: "default",

  globals: {},

  llmDefaults: {
    model: "gpt-5.2-pro",
  },

  // Optional global service URL defaults (override per runtime profile)
  services: {
    chatgpt: { url: "https://chatgpt.com/" },
    gemini: { url: "https://gemini.google.com/app" },
    grok: { url: "https://grok.com/" },
  },

  // Optional host-owned runtime execution policy defaults
  runtime: {
    localActions: {
      shell: {
        complexityStage: "bounded-command",
        allowedCommands: ["node", "npm", "pnpm", "git"],
        allowedCwdRoots: ["/home/you/workspace.local/oracle"],
        defaultShellActionTimeoutMs: "15s",
        maxShellActionTimeoutMs: "120s",
        maxCaptureChars: 8000,
      },
    },
  },

  // Optional named browser profiles
  browserProfiles: {
    default: {
      chromePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      sourceProfileName: "Default",
      sourceCookiePath: "/Users/me/Library/Application Support/Google/Chrome/Default/Network/Cookies",
      bootstrapCookiePath: "/Users/me/Library/Application Support/Google/Chrome/Default/Network/Cookies",
      managedProfileRoot: "/Users/me/.auracall/browser-profiles",
      serviceTabLimit: 3,
      blankTabLimit: 1,
      collapseDisposableWindows: true
    },
    "wsl-chrome-2": {
      chromePath: "/usr/bin/google-chrome",
      sourceProfileName: "Profile 1",
      sourceCookiePath: "/home/me/.config/google-chrome/Profile 1/Network/Cookies",
      bootstrapCookiePath: "/home/me/.config/google-chrome/Profile 1/Network/Cookies",
      display: ":0.0",
      managedProfileRoot: "/home/me/.auracall/browser-profiles",
      wslChromePreference: "wsl"
    }
  },

  // Optional dev-only port range for new Chrome spawns
  dev: {
    browserPortRange: [45000, 45100],
  },

  runtimeProfiles: {
    default: {
      browserProfile: "default",
      engine: "browser",
      search: "on",
      defaultService: "chatgpt",
      keepBrowser: false,
      browser: {
        headless: false,
        hideWindow: false,
      },
      services: {
        chatgpt: {
          identity: { email: "me@example.com" },
          projectName: "Aura-Call",
          model: "gpt-5.2-pro",
          thinkingTime: "extended",
          interactiveLogin: false,
          features: {
            web_search: true,
            deep_research: false,
            company_knowledge: false,
            apps: ["projects", "gpts"]
          }
        },
        grok: {
          identity: { email: "me@example.com" }
        }
      },
      cache: {
        store: "dual",
        refresh: false,
        includeHistory: true,
        includeProjectOnlyConversations: true,
        historyLimit: 2000,
        historySince: null,
        cleanupDays: 365,
        rootDir: null,
        refreshHours: 6,
        useDetectedIdentity: false
      }
    },
    work: {
      browserProfile: "default",
      engine: "browser",
      defaultService: "chatgpt",
      keepBrowser: false,
      services: {
        chatgpt: {
          identity: { email: "me@example.com" },
          projectId: "g-p-123456789"
        }
      }
    },
    "wsl-chrome-2": {
      browserProfile: "wsl-chrome-2",
      engine: "browser",
      defaultService: "chatgpt",
      keepBrowser: false,
      services: {
        chatgpt: {
          identity: { email: "consult@polymerconsultingroup.com" },
          // Optional advanced override. By default Aura-Call derives:
          // ~/.auracall/browser-profiles/wsl-chrome-2/chatgpt
          manualLoginProfileDir: "/Users/me/.auracall/browser-profiles/wsl-chrome-2/chatgpt"
        }
      }
    }
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

  remote: {
    host: "192.168.64.2:9473",
    token: "c4e5f9..."
  },

  azure: {
    endpoint: "https://your-resource-name.openai.azure.com/",
    deployment: "gpt-5-1-pro",
    apiVersion: "2024-02-15-preview"
  },

  heartbeatSeconds: 30,
  filesReport: false,
  background: true,
  sessionRetentionHours: 72,
  promptSuffix: "// signed-off by me",
  apiBaseUrl: "https://api.openai.com/v1"
}
```

## Compatibility Bridge Example

If you are still troubleshooting or maintaining the compatibility bridge shape,
the equivalent browser/runtime keys are:

- `browserFamilies` instead of `browserProfiles`
- `profiles` instead of `runtimeProfiles`
- `profiles.<name>.browserFamily` instead of
  `runtimeProfiles.<name>.browserProfile`

## Layered config + precedence

Config layers are merged in this order (later wins):

1. System config (`/etc/auracall/config.json` on Linux/macOS, `%ProgramData%\\auracall\\config.json` on Windows, or `AURACALL_SYSTEM_CONFIG_PATH`)
2. User config (`~/.auracall/config.json` or `AURACALL_CONFIG_PATH`)
3. Project configs found while walking up from the working directory:
   - `./.auracall/config.json`
   - `./auracall.config.json`

Within each file, later CLI flags still override config, and environment variables continue to override defaults where documented.

- `engine`/`search` can be set globally or inside a runtime profile; runtime-profile values apply when that profile is selected and no CLI flag overrides them.
- Use `--profile <name>` to switch AuraCall runtime profiles for a single run (overrides config).
- Use `--agent <name>` to resolve a run through a reserved agent reference.
  - Today this only selects the referenced AuraCall runtime profile and its browser-profile inheritance.
  - It does not enable separate agent execution behavior yet.
  - `agents.<name>.description`, `instructions`, and `metadata` are accepted
    config fields, but they still do not affect runtime selection, browser
    profile resolution, or default service resolution.
  - `agents.<name>.defaults` also remains execution-inert for now; treat it as
    a placeholder seam, not a live override surface.
  - If both `--profile` and `--agent` are passed, `--profile` wins.
- Use `--team <name>` only for planning and inspection surfaces today.
  - It does not change the active runtime selection.
  - It does not outrank `--profile` or `--agent` because it does not participate in runtime selection yet.
- Profile onboarding and login with managed profiles:
  - `auracall --profile <name> setup --chatgpt` runs the managed-profile setup for that profile and opens a login flow if needed.
  - `auracall --profile <name> login --chatgpt` opens only the managed-profile login flow so you can manually authenticate a second account.
  - `auracall --profile <name> setup --chatgpt --skip-login` verifies an existing session without reopening login.
  - Use `--chatgpt-url` or `profiles.<name>.services.chatgpt.projectId` once signed in to pin to a workspace.
- On WSL, keep the primary WSL Chrome setup on `runtimeProfiles.default` if you want to reuse the long-lived managed browser profile at `~/.auracall/browser-profiles/default/<service>`.
- Use family names like `wsl-chrome-2` for secondary WSL account profiles (for example, `consult@polymerconsultingroup.com`) while keeping `default` as primary.
- Prefer a named `browserProfiles.<name>` block plus `runtimeProfiles.<name>.browserProfile` for runtime/browser-profile wiring instead of teaching raw path wiring as the main pattern.
- `browserProfiles.<name>.keepBrowser` is now the preferred browser-owned home for keep-open behavior.
  - when both are present, `browserProfiles.<name>.keepBrowser` wins over legacy `runtimeProfiles.<name>.keepBrowser`
  - `runtimeProfiles.<name>.keepBrowser` remains fallback-compatible only when no browser-profile value exists
  - compatibility bridge output keeps browser-owned `keepBrowser` on `browserFamilies.<name>`, not on `profiles.<name>`
- Other broad browser-owned overrides under `runtimeProfiles.<name>.browser` are still treated more conservatively for now.
  - active resolution now prefers the referenced browser profile for:
    - `chromePath`
    - `display`
    - `managedProfileRoot`
    - `wslChromePreference`
  - conflicting runtime-profile values for source-profile/cookie-source wiring and debug/tab cleanup controls still win in active resolution today
  - keep using that path only as an intentional advanced escape hatch, not as the preferred public authoring surface
- Compatibility bridge equivalents are:
  - `browserFamilies.<name>`
  - `profiles.<name>.browserFamily`
- `auracall wizard` now emits the primary target shape by default for new profile setup.
- use `--bridge-shape` on `wizard`, `profile scaffold`, or `config migrate` only when you intentionally need compatibility bridge output.
- Use separate named profiles for Windows Chrome or other experimental runtimes.
- `model`, `filesReport`, `heartbeatSeconds`, and `apiBaseUrl` in config override the auto-detected values unless explicitly set on the CLI.
- `llmDefaults.model`, `llmDefaults.modelStrategy`,
  `llmDefaults.defaultProjectName`, and `llmDefaults.defaultProjectId` remain
  compatibility-bridge fields.
  - prefer root `model` plus `services.<service>` or
    `runtimeProfiles.<name>.services.<service>` for active
    model/service/project behavior.
- If `azure.endpoint` (or `--azure-endpoint`) is set, Aura-Call reads `AZURE_OPENAI_API_KEY` first and falls back to `OPENAI_API_KEY` for GPT models.
- Remote browser defaults follow the same order: `--remote-host/--remote-token` win, then `remote.host` / `remote.token` (or `remoteHost` / `remoteToken`) in the config, then `AURACALL_REMOTE_HOST` / `AURACALL_REMOTE_TOKEN` if still unset.
- `OPENAI_API_KEY` only influences engine selection when neither the CLI nor `config.json` specify an engine (API when present, otherwise browser).
- `AURACALL_NOTIFY*` env vars still layer on top of the config’s `notify` block.
- `sessionRetentionHours` controls the default value for `--retain-hours`. When unset, `AURACALL_RETAIN_HOURS` (if present) becomes the fallback, and the CLI flag still wins over both.
- `services.<service>.url` defines global service URL defaults; `runtimeProfiles.<name>.services.<service>.url` can override them per runtime profile.
- `runtimeProfiles.<name>.services.chatgpt.url` (or compatibility `profiles.<name>.services.chatgpt.url`) is the right way to pin a runtime profile to a second ChatGPT workspace/project.
  - Example: `auracall --profile work "..."` uses `https://chatgpt.com/g/p-123456789` from `runtimeProfiles.work`.
- If your preference is not a hard URL, use `runtimeProfiles.<name>.services.<service>.projectId` or `.projectName`:
  - `projectId` is the most explicit; Aura-Call builds the scoped project route from it.
  - `projectName` is resolved via cache/name lookup at runtime and can be ambiguous if duplicate titles exist.
- Migration note:
  - If you already use `projectId`/`projectName` in profile service blocks, you can keep that path and avoid URL pinning entirely.
  - URL pinning is most useful when you want a literal target route (for example, a specific non-project chat folder URL) instead of config-driven project resolution.
- `services.<service>.interactiveLogin` can set a global login mode default; `runtimeProfiles.<name>.services.<service>.interactiveLogin` overrides it per runtime profile (legacy `manualLogin` still works).
- `services.<service>.manualLoginProfileDir` (and its per-runtime-profile override) controls the persistent managed browser profile dir used for interactive login.
  - Treat this as an advanced override. The default path is derived from `browser.managedProfileRoot + auracallProfile + service`.
  - It is only meaningful when `manualLogin` / `interactiveLogin` is enabled
    for that same scope.
- `interactiveLogin` is the preferred name; legacy `manualLogin` keys keep working with deprecation warnings.
- `services.<service>.features` holds provider-specific feature flags. Typical keys:
  - `chatgpt`: `web_search`, `deep_research`, `company_knowledge`, `apps`
  - `grok`: `search`, `sources`, `apps`
  - `gemini`: `search`, `grounding`, `apps`
- Headless/headful settings belong to the browser layer; keep using `browser.headless` and `browser.hideWindow` until the rename lands.
- `browser.hideWindow: true` is now the recommended default for headful browser automation. Aura-Call launches Chrome with `--start-minimized`, suppresses `Page.bringToFront()` on reuse paths, and only auto-hides windows it just launched itself. On WSL/X11, treat this as a no-focus-steal guarantee first and a literal minimized-state guarantee second, because Chrome's DevTools window-bounds API can still report `windowState: normal` while `_NET_ACTIVE_WINDOW` stays unchanged.
- `services.<service>.thinkingTime` can set a per-service default for ChatGPT Thinking/Pro models (overrides `profiles.<name>.browser.thinkingTime` when set).
- `runtimeProfiles.<name>.services.<service>.identity` sets the username/email used for cache identity; auto-scraping is disabled unless `runtimeProfiles.<name>.cache.useDetectedIdentity` is set.
- `runtimeProfiles.<name>.browser.profilePath` + `profileName` define the source browser profile; `cookiePath` overrides the derived Cookies DB location. `profileName` accepts either the on-disk Chromium directory (for example `Profile 1`) or the friendly UI label.
- when both exist, active resolution now prefers the referenced browser profile
  over conflicting runtime-profile browser aliases for:
  - `blockingProfileAction`
  - `chromePath`
  - `display`
  - debug-port controls
  - `headless`
  - `hideWindow`
  - `remoteChrome`
  - tab/window cleanup controls
  - `managedProfileRoot`
  - source browser profile / cookie-source wiring
  - `wslChromePreference`
- the remaining live runtime-profile `browser` advanced override surface is now
  empty for the browser-owned launch/browser-family field class in this lane.
- if a runtime profile still carries browser-owned fields after that rewrite:
  - with a referenced browser profile, those runtime values are compatibility
    residue and should be removed or migrated
  - without a referenced browser profile, those values are still live only
    because the runtime profile has not been moved onto an explicit browser
    profile yet
- `runtimeProfiles.<name>.defaultService` chooses the default browser target when no explicit model or `--target` is set.
- `agents` and `teams` are reserved top-level config blocks for the future config-model refactor.
  - Aura-Call now lets `--agent <name>` resolve through `agents.<name>.runtimeProfile` for selection semantics only.
  - `agents.<name>.description`, `instructions`, and `metadata` remain
    organizational/future-workflow fields today.
  - `agents.<name>.defaults` remains a placeholder seam and does not currently
    change runtime selection, browser profile resolution, or default service
    resolution.
  - this phase does not define any typed live agent-owned defaults yet; if
    you need different live behavior, model it as a different AuraCall runtime
    profile instead of assuming the agent layer already owns execution
    defaults.
  - They still do not introduce separate agent or team execution behavior yet.
- `runtimeProfiles.<name>.cache.*` sets defaults for cache behavior (including `store`, `refreshHours`, and `rootDir`).
- `runtimeProfiles.<name>.cache.includeProjectOnlyConversations` controls whether refresh also inserts project-only conversation IDs that were not present in the global history snapshot.
- `runtimeProfiles.<name>.cache.cleanupDays` sets the default retention window for `auracall cache cleanup --days`.
- Mirror-oriented cache defaults are usually `includeHistory: true`, `includeProjectOnlyConversations: true`, `historyLimit: 2000`, and `cleanupDays: 365`.
- `runtimeProfiles.<name>.cache.store` controls cache backend: `json` keeps legacy JSON files only, `sqlite` uses SQLite only (`cache.sqlite` per provider+identity), and `dual` reads/writes SQLite plus the JSON mirror (recommended migration mode).
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
