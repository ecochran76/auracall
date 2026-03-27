# Browser Session Management

This doc defines how Oracle manages Chrome sessions, ports, and profiles so we avoid login loss and port conflicts.

## Session identity

A browser session is identified by:

- `profilePath` (user data directory)
- `profileName` (Chrome profile, e.g. `Default`, `Profile 1`; defaults to `Default`)

Providers (ChatGPT/Grok/Gemini) share the same Chrome instance via separate tabs when the profile identity matches. We do not run multiple Chrome instances against the same profile identity.

## Registry

Oracle stores active sessions in `~/.auracall/browser-state.json`. Each entry records:

- `profilePath`
- `profileName`
- `port`
- `host`
- `pid`
- timestamps (`launchedAt`, `lastSeenAt`)

Registry lookups are the primary way to resolve active DevTools ports. Keys are stored as `<profilePath>::<profileName>`. The environment override (`AURACALL_BROWSER_PORT` / `AURACALL_BROWSER_DEBUG_PORT`) is reserved for exceptional debugging.

## Port selection

When spawning a new Chrome instance:

- If `browser.debugPortRange` is set, Oracle selects the first free port in that range.
- If not set, Oracle uses the default range `[45000, 45100]`.
- The chosen port is written to the registry.

When attaching to an existing session:

- Oracle reads the registry and selects the session that matches the configured profile identity (`profilePath` + `profileName`).
- No port probing is done outside the registry, except for the optional env override.

## Profile selection

Oracle always uses the profile specified by config/CLI:

- `browser.manualLoginProfileDir` for the user data directory (legacy naming pending profile refactor)
- `browser.chromeProfile` for the profile name
- `browser.wslChromePreference` (`auto|wsl|windows`) to select WSL-native vs Windows-hosted profiles when auto-discovering.

This ensures cookies and login state persist. Manual login and cookie sync both target this profile identity.

## Notes

- `browser.debugPort` is effectively env-only and should not be set in config.
- `--remote-chrome` bypasses local session management entirely.
