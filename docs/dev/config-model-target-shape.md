# Config Model Target Shape

## Purpose

Give Aura-Call one explicit target public config shape before more runtime work
lands on top of the current transitional bridge keys.

This is a design target, not a claim that the full shape is implemented today.

## Target stack

1. `browserProfiles`
2. `runtimeProfiles`
3. `agents`
4. `teams`

The composition rule is:

- browser profiles own browser/account-bearing state
- AuraCall runtime profiles reference one browser profile and add Aura-Call
  workflow defaults
- agents reference one runtime profile and specialize behavior
- teams coordinate agents

## Ownership

### `browserProfiles.<name>`

Own browser-service level runtime/account-family concerns:

- executable path
- WSL-vs-Windows behavior
- display strategy
- source browser profile selection
- source cookie/bootstrap paths
- managed browser profile root policy
- debug-port policy
- tab/window cleanup defaults

Examples:

- `default`
- `wsl-chrome-2`
- `windows-chrome-test`

### `runtimeProfiles.<name>`

Own Aura-Call workflow defaults and reference one browser profile.

Typical concerns:

- default service/provider
- preferred model / model strategy
- project/workspace defaults
- cache defaults
- service-scoped identities/settings

Important rule:

- a runtime profile references a browser profile
- it should not redefine browser/account-bearing state except through explicit
  advanced override escape hatches

### `agents.<name>`

Own future specialized workflow/persona behavior on top of one runtime profile.

Typical concerns:

- instructions
- task/domain description
- narrower workflow policy
- metadata

Not browser ownership:

- browser executable
- source browser profile
- managed browser profile paths
- cookie/bootstrap paths

### `teams.<name>`

Own future coordination across multiple agents.

Typical concerns:

- membership
- delegation/routing policy
- shared metadata
- coordination instructions

## Target public example

```json5
{
  version: 3,

  defaultRuntimeProfile: "default",

  browserProfiles: {
    default: {
      chromePath: "/usr/bin/google-chrome",
      sourceProfileName: "Default",
      sourceCookiePath: "/home/me/.config/google-chrome/Default/Network/Cookies",
      bootstrapCookiePath: "/home/me/.config/google-chrome/Default/Network/Cookies",
      managedProfileRoot: "/home/me/.auracall/browser-profiles",
      display: ":0.0",
      wslChromePreference: "wsl",
      serviceTabLimit: 3,
      blankTabLimit: 1,
      collapseDisposableWindows: true
    },
    "wsl-chrome-2": {
      chromePath: "/usr/bin/google-chrome",
      sourceProfileName: "Profile 1",
      sourceCookiePath: "/home/me/.config/google-chrome/Profile 1/Network/Cookies",
      bootstrapCookiePath: "/home/me/.config/google-chrome/Profile 1/Network/Cookies",
      managedProfileRoot: "/home/me/.auracall/browser-profiles",
      display: ":0.0",
      wslChromePreference: "wsl"
    }
  },

  runtimeProfiles: {
    default: {
      browserProfile: "default",
      engine: "browser",
      defaultService: "chatgpt",
      services: {
        chatgpt: {
          identity: { email: "ecochran76@gmail.com" },
          model: "gpt-5.2-pro"
        }
      },
      cache: {
        includeHistory: true,
        historyLimit: 2000
      }
    },
    consulting: {
      browserProfile: "wsl-chrome-2",
      engine: "browser",
      defaultService: "chatgpt",
      services: {
        chatgpt: {
          identity: { email: "consult@polymerconsultinggroup.com" }
        }
      }
    }
  },

  agents: {
    researcher: {
      runtimeProfile: "default",
      instructions: "Reserved future agent config"
    }
  },

  teams: {
    ops: {
      agents: ["researcher"]
    }
  }
}
```

## Transitional bridge to today

Today the repo still uses bridge names and bridge seams:

- `profiles`
  - transitional external/public key for what will likely become
    `runtimeProfiles`
- `browserFamilies`
  - transitional external/public key for what will likely become
    `browserProfiles`
- `profiles.<name>.browserFamily`
  - transitional runtime-profile-to-browser-profile reference

Those bridge names are acceptable for now, but the target model above should be
the design authority for future refactor work.

Version note:

- `version: 3` is the target-shape file version
- compatibility bridge output remains `version: 2`
- Aura-Call still loads both during the transition

## Migration stance

Current recommendation:

- keep current config behavior stable
- keep bridge keys loading cleanly
- design and implement toward the target shape in narrow steps
- defer broad code and schema renames until the target shape is explicit enough
  to rename once
- do not accept target-shape input aliases until the documented precedence and
  write-back policy is implemented deliberately

Alias-transition policy:

- [config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)

## Practical guidance for current implementation slices

When deciding where a new setting belongs:

- if it changes browser/account-bearing state, it belongs under the browser
  profile layer
- if it changes Aura-Call workflow defaults, it belongs under the runtime
  profile layer
- if it changes future persona/task behavior, it belongs under the agent layer
- if it coordinates multiple agents, it belongs under the team layer

Do not use the current transitional structure as justification to place new
browser-bearing state inside runtime-profile-owned code by default.
