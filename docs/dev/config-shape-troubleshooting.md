# Config Shape Troubleshooting

## Purpose

Give future operators and developers one place to debug bridge-shape,
target-shape, and mixed-shape Aura-Call configs.

This is a troubleshooting doc, not a migration policy doc. For transition
policy, see
[0031-2026-04-08-config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/legacy-archive/0031-2026-04-08-config-model-input-alias-plan.md).

## Shape terms

- `bridge-shape`
  - uses:
    - `browserFamilies`
    - `profiles`
    - `profiles.<name>.browserFamily`
- `target-shape`
  - uses:
    - `browserProfiles`
    - `runtimeProfiles`
    - `runtimeProfiles.<name>.browserProfile`
- `mixed-shape`
  - the same config contains both bridge and target keys

## Read precedence

Aura-Call dual-reads both shapes now.

When both are present:

- `browserProfiles` wins over `browserFamilies`
- `runtimeProfiles` wins over `profiles`
- `runtimeProfiles.<name>.browserProfile` wins over
  `profiles.<name>.browserFamily`

Aura-Call does not silently treat bridge and target shapes as equivalent if
their values differ. `config doctor` surfaces conflicts explicitly.

## Fast inspection commands

Use:

```sh
auracall config show
auracall config show --json
auracall config doctor
auracall config doctor --json
auracall profile list
```

What to look for:

- `config show`
  - whether target keys are present
  - whether bridge keys are present
  - active AuraCall runtime profile
  - active browser profile
- `config doctor`
  - whether target keys are present
  - which side currently wins precedence
  - mixed/conflicting definitions
- `profile list`
  - inventory of current AuraCall runtime profiles and browser-profile bindings

## How to tell what shape a config is

### Bridge-shape

Typical `config show` / `config doctor` signals:

- target keys: missing
- bridge keys: present
- precedence:
  - browser profiles = `bridge`
  - runtime profiles = `bridge`

### Target-shape

Typical signals:

- target keys: present
- bridge keys: missing
- precedence:
  - browser profiles = `target`
  - runtime profiles = `target`

### Mixed-shape

Typical signals:

- target keys: present
- bridge keys: present
- `config doctor` issues like:
  - `mixed-browser-profile-keys`
  - `mixed-runtime-profile-keys`
  - `conflicting-browser-profile-definitions`
  - `conflicting-runtime-profile-definitions`
  - `mixed-runtime-profile-browser-reference`

## Common doctor findings

### `mixed-browser-profile-keys`

Meaning:
- both `browserProfiles` and `browserFamilies` exist

Action:
- check whether they are intentionally duplicated
- if they differ, treat target keys as authoritative and clean up the bridge
  side when ready

### `mixed-runtime-profile-keys`

Meaning:
- both `runtimeProfiles` and `profiles` exist

Action:
- same rule as above: target runtime-profile keys win

### `conflicting-browser-profile-definitions`

Meaning:
- the same browser profile id exists in both shapes but with different values

Action:
- decide which definition is the real one
- keep target-shape if you are intentionally migrating forward
- otherwise remove the target copy and stay bridge-shaped

### `conflicting-runtime-profile-definitions`

Meaning:
- the same AuraCall runtime profile id exists in both shapes but differs

Action:
- same cleanup rule: choose one authoritative definition

### `mixed-runtime-profile-browser-reference`

Meaning:
- a single runtime profile contains both:
  - `browserProfile`
  - `browserFamily`
- and they disagree

Action:
- fix the profile to one intended browser profile id
- in mixed-shape configs, `browserProfile` is the authoritative read path

### `runtime-profile-missing-browser-profile`

Meaning:
- the AuraCall runtime profile does not explicitly point at any browser profile

Action:
- add:
  - `profiles.<name>.browserFamily`
  - or `runtimeProfiles.<name>.browserProfile`

### `runtime-profile-browser-profile-missing`

Meaning:
- the runtime profile points at a browser profile id that does not exist

Action:
- add the missing browser profile definition or fix the reference typo

### `runtime-profile-browser-owned-overrides-present`

Meaning:
- the AuraCall runtime profile still carries broad browser-owned override
  state, currently:
  - broad launch/browser-family fields inside `runtimeProfiles.<name>.browser`,
    for example:
    - `chromePath`
    - `display`
    - `wslChromePreference`
  - top-level runtime-profile `keepBrowser`

Action:
- move those settings to the referenced browser profile when they are part of
  normal browser/account-bearing behavior
- keep them in the runtime profile only when they are an intentional advanced
  escape hatch and the coupling is understood
- prefer leaving runtime profiles with Aura-Call workflow defaults and browser
  profile references, not broad browser configuration blocks

`config migrate` behavior:
- when the runtime profile already references a real browser profile, migrate
  now hoists obvious broad fields:
  - broad launch/browser-family fields from `runtimeProfiles.<name>.browser`
  - runtime-profile `keepBrowser`
- browser-profile values remain authoritative during cleanup
- conflicting runtime-profile values are preserved instead of being rewritten
  silently
- relocatable service fields such as:
  - `modelStrategy`
  - `thinkingTime`
  - `composerTool`
  now move into `runtimeProfiles.<name>.services.<defaultService>` only when:
  - one concrete `defaultService` is present on the AuraCall runtime profile
  - the destination service slot is unambiguous
  - no conflicting service-level value already exists
- managed-profile escape hatches such as:
  - `manualLogin`
  - `manualLoginProfileDir`
  remain in `runtimeProfiles.<name>.browser`
- if those conditions are not met, they remain in the runtime profile

### `runtime-profile-service-scoped-overrides-relocatable-present`

Meaning:
- the AuraCall runtime profile still defines relocatable service-scoped browser
  fields under `runtimeProfiles.<name>.browser`, such as:
  - `modelStrategy`
  - `thinkingTime`
  - `composerTool`

Action:
- prefer `runtimeProfiles.<name>.services.<service>`
- `config migrate` can move them automatically only when:
  - one concrete `defaultService` is declared
  - no conflicting service-level value already exists
- if the destination remains ambiguous or conflicting, expect them to stay in
  `runtimeProfiles.<name>.browser`

### `browser-profile-service-scoped-overrides-present`

Meaning:
- the browser profile itself defines service-layer knobs such as:
  - `modelStrategy`
  - `thinkingTime`
  - `composerTool`

Action:
- move these values out of the browser profile
- keep browser profiles focused on browser/account-family concerns
- prefer `runtimeProfiles.<name>.services.<service>` for service defaults
- do not expect `config migrate` to rewrite this automatically:
  - browser profiles do not declare one concrete service target
  - the current resolver treats these values as runtime/service concerns, not
    browser-profile state

### `global-browser-service-scoped-defaults-present`

Meaning:
- the top-level `browser` block still defines service-layer defaults such as:
  - `browser.modelStrategy`
  - `browser.thinkingTime`
  - `browser.composerTool`
  - `browser.projectName`
  - `browser.projectId`

Action:
- keep the root `browser` block focused on generic browser automation behavior
- prefer `services.<service>` or `runtimeProfiles.<name>.services.<service>`
  for these service knobs
- treat `browser.projectName` / `browser.projectId` as the same misplaced root
  service/project-default seam, not as browser-family state
- do not expect `config migrate` to rewrite this automatically yet:
  - root `browser` is still a compatibility/defaults surface
  - `llmDefaults` still acts as the compatibility bridge for some model and
    project defaults

### `llm-defaults-service-scoped-defaults-present`

Meaning:
- `llmDefaults` still carries service-layer default state such as:
  - `llmDefaults.modelStrategy`
  - `llmDefaults.defaultProjectName`
  - `llmDefaults.defaultProjectId`

Action:
- treat `llmDefaults` as compatibility bridge state only
- prefer `services.<service>` or `runtimeProfiles.<name>.services.<service>`
  for active service/project behavior
- do not expect `config migrate` to rewrite this automatically yet:
  - `llmDefaults` still participates in compatibility materialization for
    legacy model/project defaults
  - compatibility bridge output may still backfill these keys from root
    `model` / `browser` defaults when no explicit `llmDefaults` block exists
  - explicit `llmDefaults` values still win over that backfill path
  - the remaining `llmDefaults` versus `services.<service>` ownership seam is
    not narrow enough for safe automatic relocation

### `runtime-profile-service-scoped-escape-hatches-present`

Meaning:
- the AuraCall runtime profile still defines managed-profile escape hatches
  under `runtimeProfiles.<name>.browser`, such as:
  - `manualLogin`
  - `manualLoginProfileDir`

Action:
- keep them only when the managed-profile/account coupling is intentional
- do not expect `config migrate` to relocate them casually
- browser execution overrides still win over service fallback for these fields
- `manualLoginProfileDir` is only meaningful when `manualLogin` is true
- narrow their ownership boundary further before automating any rewrite

### `runtime-profile-manual-login-profile-dir-redundant`

Meaning:
- the AuraCall runtime profile explicitly defines a `manualLoginProfileDir`
  that matches the managed profile path Aura-Call would derive anyway

Action:
- remove the explicit path unless you intend a real external managed-profile
  override
- `config migrate` can now remove these redundant default-equivalent paths
  conservatively
- if that removal leaves an empty `services.<service>` object behind, migrate
  now prunes the empty stub as cleanup residue
- this can appear on:
  - `runtimeProfiles.<name>.browser.manualLoginProfileDir`
  - `runtimeProfiles.<name>.services.<service>.manualLoginProfileDir`

### `runtime-profile-service-defaults-redundant`

Meaning:
- the AuraCall runtime profile explicitly defines service-level values that
  already match the inherited top-level `services.<service>` defaults

Action:
- remove the explicit runtime-profile service values unless this runtime
  profile is intentionally diverging from global service defaults
- `config migrate` can now remove these redundant default-equivalent service
  values conservatively
- this can appear on:
  - `runtimeProfiles.<name>.services.<service>.modelStrategy`
  - `runtimeProfiles.<name>.services.<service>.thinkingTime`
  - `runtimeProfiles.<name>.services.<service>.composerTool`

### `unused-browser-profile`

Meaning:
- a browser profile exists but no AuraCall runtime profile references it

Action:
- either remove it or leave it if it is intentionally staged for later use

## Write commands and what they emit

### Default target-shape writes

These now emit target-shape by default:

- `auracall wizard`
- `auracall profile scaffold`
- `auracall config migrate`

### Explicit compatibility bridge writes

Use these when you intentionally want compatibility bridge output:

```sh
auracall config migrate --bridge-shape --output ~/.auracall/config.bridge.json
auracall profile scaffold --bridge-shape --force
auracall wizard --bridge-shape
```

Those emit:

- `browserFamilies`
- `profiles`
- `profiles.<name>.browserFamily`

The default target-shape writes emit:

- `browserProfiles`
- `runtimeProfiles`
- `runtimeProfiles.<name>.browserProfile`

## Recommended troubleshooting workflow

1. Run `auracall config show`.
2. Run `auracall config doctor --json`.
3. Decide whether the file should stay:
   - bridge-shape
   - target-shape
   - or temporarily mixed during cleanup
4. If you want a compatibility bridge file, use:
   - `config migrate --bridge-shape`
   - `profile scaffold --bridge-shape`
   - or `wizard --bridge-shape`
5. Re-run `config doctor` and confirm:
   - expected target/bridge presence
   - expected precedence
   - no unexpected conflicts

## Current recommendation

For future troubleshooting:

- use target-shape when you want the config file to match the long-term model
- use bridge-shape if you are debugging legacy or compatibility behavior
- avoid leaving configs mixed-shape longer than necessary
