# Browser Profile Family Refactor Plan

## Purpose

Refactor Aura-Call's browser/profile configuration model so browser-family
selection, service selection, and service-specific runtime overrides are
resolved deterministically and independently.

This plan is intended as a handoff document for implementation work. It
describes the current failure modes, the target architecture, and an
incremental landing strategy.

## Problem Statement

The current model still blends multiple concepts into one mutable `browser`
object:

- Aura-Call runtime profile selection
- browser-family selection
- source browser profile selection
- managed browser profile path derivation
- service target selection
- service-specific runtime defaults

That blending creates recurring confusion and bugs:

- explicit ChatGPT/Grok targets can leak back to the config-default target
- raw `manualLoginProfileDir` values are doing too much work
- WSL launch behavior depends partly on shell environment, partly on config
- docs teach path wiring because the conceptual model is not explicit enough

## Current Root Causes

### 1. One mutable `browser` object owns too many responsibilities

`src/browser/service/profileConfig.ts` currently merges browser-family fields,
service target defaults, service URLs, per-service runtime options, and cache
defaults into one mutable structure.

That is the main architectural reason target leakage keeps reappearing.

### 2. Config resolution uses generic record mutation instead of typed phases

`src/schema/resolver.ts` and `src/browser/service/profileConfig.ts` still rely
on `Record<string, unknown>` plus repeated recursive merges.

That makes it too easy for one late merge to accidentally override the wrong
scope.

### 3. `manualLoginProfileDir` is overloaded

Today it is simultaneously used as:

- an explicit user override
- a derived managed profile path
- a service-specific identity anchor
- an implicit browser-family selector

Those are different concerns and should not share one field in the normal
configuration path.

### 4. Launch defaults are split across config and side effects

Some launch behavior is resolved in config, but some still lives in the
launcher as process environment mutation. The recent `DISPLAY=:0.0` fix reduced
this problem, but the architecture should finish the move to explicit resolved
launch plans.

## Target Model

Aura-Call should resolve browser execution in explicit phases.

### Phase A: Resolve Aura-Call Profile

This selects the logical runtime profile, for example:

- `default`
- `wsl-chrome-2`
- `windows-chrome-test`

This object should answer:

- which profile family is active
- which service is the default service
- which cache defaults apply

### Phase B: Resolve Browser Family

This selects the browser runtime family, independent of service:

- executable path
- display / GUI strategy
- source cookie/bootstrap profile
- managed profile root
- debug-port strategy defaults

This is the place where a WSL Linux-Chrome family should deterministically own
`chromePath=/usr/bin/google-chrome` and `display=:0.0`.

### Phase C: Resolve Service Binding

This selects service-scoped defaults, independent of browser-family wiring:

- service target (`chatgpt`, `grok`, `gemini`)
- service URL / project pinning
- provider model defaults
- provider feature flags
- service-specific managed profile identity

### Phase D: Resolve Browser Launch Profile

This produces the final immutable launch plan used by runtime code:

- executable
- display
- managed profile dir
- source cookie path
- profile name / directory
- target URL
- port strategy
- launch toggles

The launcher should consume this plan, not derive new behavior opportunistically.

## Target Terminology

The refactor should standardize the following terms:

- `Aura-Call profile`
  - logical runtime profile selected by `auracallProfile` / `--profile`
- `browser family`
  - the browser runtime bundle used by that Aura-Call profile
- `source browser profile`
  - the Chromium profile used for bootstrap/cookie sourcing
- `managed browser profile`
  - the Aura-Call-owned user-data dir used for automation
- `service binding`
  - service-specific target/model/project/options layered onto the browser family

The implementation should stop using `profile` ambiguously across these levels.

## Proposed Data Model

### 1. `ResolvedProfileFamily`

Owns:

- `profileName`
- `defaultService`
- `browserFamilyId`
- cache defaults

### 2. `ResolvedBrowserFamily`

Owns:

- `chromePath`
- `display`
- `wslChromePreference`
- `sourceProfilePath`
- `sourceProfileName`
- `sourceCookiePath`
- `managedProfileRoot`
- launch-policy defaults

### 3. `ResolvedServiceBinding`

Owns:

- `serviceId`
- `serviceUrl`
- `projectId`
- `conversationId`
- `model`
- `thinkingTime`
- `composerTool`
- `serviceManagedProfileKey`

### 4. `ResolvedBrowserLaunchProfile`

Owns:

- `chromePath`
- `display`
- `userDataDir`
- `chromeProfile`
- `targetUrl`
- `debugPort`
- `debugPortStrategy`
- `headless`
- `hideWindow`

## Config Changes

### Keep

- `profiles.<name>` as the top-level logical runtime selector
- `profiles.<name>.services.<service>` for service-scoped defaults

### Deprecate from normal use

- direct use of `manualLoginProfileDir` as the normal profile-family selector

### Introduce / favor

- a browser-family identifier or explicit browser-family block under each
  Aura-Call profile
- derived managed profile dirs from:
  - managed root
  - Aura-Call profile name
  - service id

### Escape hatches

Retain raw path overrides, but treat them as advanced overrides rather than the
primary configuration model.

## Refactor Slices

### Slice 1: Typed Resolved Objects

- add typed resolved objects for:
  - profile family
  - browser family
  - service binding
  - launch profile
- keep existing JSON schema mostly unchanged
- keep adapters reading from compatibility projections where needed

Exit criteria:

- browser-service and port resolution no longer need to synthesize temporary
  config objects just to force a target

### Slice 2: Browser Family Resolver

- extract browser-family resolution out of `applyBrowserProfileOverrides`
- make executable, display, bootstrap source, and managed root deterministic
  before service logic runs

Exit criteria:

- WSL Linux Chrome vs WSL Windows Chrome selection is fully determined before
  service-specific code runs

### Slice 3: Service Binding Resolver

- extract service target, URL/project pinning, model defaults, and service
  feature flags into a service-binding resolver
- stop mutating general browser config with service-owned fields

Exit criteria:

- service-specific defaults no longer overwrite browser-family fields

### Slice 4: Launch Plan Consumption

- pass immutable launch plans into launch/runtime code
- remove residual environment-dependent launch decisions from low-level
  launcher paths where possible

Exit criteria:

- runtime launch logs are produced from resolved launch plans only

### Slice 5: Config Cleanup and Docs

- introduce clearer config documentation around:
  - Aura-Call profile
  - browser family
  - source profile
  - managed profile
- de-emphasize raw managed path examples in docs
- add deprecation guidance for overloaded path keys

Exit criteria:

- operators can configure a second WSL Chrome family without wiring raw paths by
  hand

## Regression Strategy

This refactor must land incrementally with regression coverage at each slice.

### Minimum required suites

- `tests/schema/resolver.test.ts`
- `tests/browser/config.test.ts`
- `tests/browser/browserService.test.ts`
- browser wizard / browser config tests
- targeted live/manual checks for:
  - default WSL family
  - `wsl-chrome-2`
  - Windows-backed WSL family if touched

### Required manual checks

- open default WSL ChatGPT profile
- open `wsl-chrome-2` ChatGPT profile
- verify target-specific managed profile path selection for ChatGPT vs Grok
- verify launch logs show resolved executable and display correctly

## Definition of Done

This refactor is done when:

- browser-service does not need fake config objects to override service target
- typed resolved objects exist between config parsing and runtime launch
- `manualLoginProfileDir` is derived by default instead of being the main config
  primitive
- WSL Linux Chrome launches are determined by resolved browser-family config,
  not ambient shell state
- docs explain the profile model without relying on raw path examples as the
  main teaching path

## Recommended Implementation Order

1. typed resolver scaffolding
2. browser-family resolver extraction
3. service-binding resolver extraction
4. launch-plan wiring
5. config/docs cleanup

Do not attempt a big-bang rewrite of schema, runtime, and docs in one landing.
Each slice should preserve current behavior while reducing the amount of mutable
cross-scope merge logic.
