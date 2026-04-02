# WSL Runbook: Oracle ChatGPT Browser (WSL Chrome)

Goal: Run ChatGPT browser automation from WSL using a Linux Chrome install, avoiding Windows/WSL interop issues.

## Key behavior
- WSL Chrome is the most reliable path; Windows Chrome/Brave from WSL often fails due to DevTools binding and profile locks.
- Oracle defaults to the Windows host IP for DevTools on WSL; override to localhost for WSL Chrome with `AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1`.
- Aura-Call now uses a managed persistent profile under `~/.auracall/browser-profiles/<auracallProfile>/<service>` and bootstraps it from your existing Chrome profile on first use, so you only sign in once.

## Recommended setup
0) Quick bootstrap (installs Node 22 + Chrome + repo deps):

```bash
./scripts/bootstrap-wsl.sh
```

1) Install Chrome in WSL (one-time):

```bash
sudo apt-get install -y google-chrome-stable
```

2) Configure Oracle defaults (`~/.auracall/config.json`):

```json5
{
  browser: {
    chromePath: "/usr/bin/google-chrome",
    chromeCookiePath: "/home/you/.config/google-chrome/Default/Cookies",
    chromeProfile: "Default",
    interactiveLogin: true,
    managedProfileRoot: "/home/you/.auracall/browser-profiles"
  },

  // Optional named secondary WSL browser family
  browserFamilies: {
    "wsl-chrome-2": {
      chromePath: "/usr/bin/google-chrome",
      chromeProfile: "Default",
      chromeCookiePath: "/home/you/.config/google-chrome/Default/Cookies",
      bootstrapCookiePath: "/home/you/.config/google-chrome/Default/Cookies",
      display: ":0.0",
      managedProfileRoot: "/home/you/.auracall/browser-profiles",
      wslChromePreference: "wsl"
    }
  }
}
```

3) First-time login for primary WSL account (keep the window open so you can sign in):

```bash
AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1 \
oracle --profile default --target chatgpt login --browser-keep-browser
```

4) Optional: configure a second WSL browser family for another account (for example, Pro testing):

```json5
{
  auracallProfile: "default",
  browserFamilies: {
    "wsl-chrome-2": {
      chromePath: "/usr/bin/google-chrome",
      chromeProfile: "Default",
      chromeCookiePath: "/home/you/.config/google-chrome/Default/Cookies",
      bootstrapCookiePath: "/home/you/.config/google-chrome/Default/Cookies",
      display: ":0.0",
      managedProfileRoot: "/home/you/.auracall/browser-profiles",
      wslChromePreference: "wsl"
    }
  },
  profiles: {
    default: {
      services: {
        chatgpt: {
          identity: { email: "ecochran76@gmail.com" }
        }
      }
    },
    "wsl-chrome-2": {
      engine: "browser",
      browserFamily: "wsl-chrome-2",
      defaultService: "chatgpt",
      services: {
        chatgpt: {
          identity: { email: "consult@polymerconsultingroup.com" }
        }
      }
    }
  }
}
```

Aura-Call derives the managed profile directory automatically as
`~/.auracall/browser-profiles/<auracallProfile>/<service>` unless you set
`manualLoginProfileDir` explicitly.

Seed the second account once:

```bash
AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1 \
oracle --profile wsl-chrome-2 --target chatgpt login --browser-keep-browser
```

5) Run ChatGPT automation:

Primary account:

```bash
AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1 \
oracle --engine browser -p "Say hello from WSL primary"
```

Secondary account:

```bash
AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1 \
oracle --profile wsl-chrome-2 --engine browser -p "Say hello from second profile"
```

## Troubleshooting
- **Chrome opens but the URL never changes**: Oracle is connecting to the wrong DevTools host.
  - Fix: set `AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1` for the run.
- **Using Windows Chrome from WSL**:
  - Keep `manualLoginProfileDir` as a WSL path if you override it; Aura-Call converts it to the `\\wsl.localhost\...` path for Windows Chrome.
  - If DevTools can’t be reached, open the Windows firewall for the chosen port or pin a port with `AURACALL_BROWSER_PORT`.
- **Wrong profile opens / not logged in**:
  - Keep the login window open, sign in, then rerun. The profile is reused on subsequent runs.
- **Need a clean profile**:
  - Remove the relevant managed profile under `~/.auracall/browser-profiles/<auracallProfile>/<service>` and repeat the login step.

## Optional helper aliases
Add to `~/.zshrc`:

```bash
alias oracle-wsl='AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1 oracle'
alias oracle-login='AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1 oracle --target chatgpt login --browser-keep-browser'
```
