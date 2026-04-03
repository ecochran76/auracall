# Next Execution Plan (2026-04-03)

## Current status

The browser reliability line is in a much better state:

- dual browser-profile ChatGPT runs are live-proven on:
  - `default`
  - `wsl-chrome-2`
- stale browser-state pruning, reattach classification, and doctor probe routing
  are now scoped to the selected managed browser profile
- cross-browser-profile reattach drift is live-proven blocked
- fresh-launch `wsl-chrome-2` reattach recovery is live-proven green

The profile-family refactor has also crossed its useful first boundary:

- typed resolved objects exist
- launch-profile consumption now reaches config, browser-service, doctor,
  login, and runtime bootstrap
- docs now lock the correct terminology:
  - browser profile
  - source browser profile
  - managed browser profile
  - AuraCall runtime profile

That means the next active architecture track should be the larger
config-model refactor, not more opportunistic browser cleanup.

Config-model state now:

- target-shape is the primary documented model:
  - `version: 3`
  - `browserProfiles`
  - `runtimeProfiles`
  - `defaultRuntimeProfile`
- Aura-Call dual-reads both target and bridge shapes
- target-shape is the default write mode for:
  - `config migrate`
  - `profile scaffold`
  - `wizard`
- inspection/doctor now expose:
  - target-vs-bridge precedence
  - selector-key presence
  - projected target model
- bridge keys remain the explicit compatibility/troubleshooting path
  - usually `version: 2`

That makes the public config transition complete enough for a checkpoint. The
next useful work is the layer that composes on top of browser profiles and
AuraCall runtime profiles, not more config-shape migration polish.

## Execution principle

- Work in small, bounded slices.
- Prefer semantic clarity over new aliases.
- Keep browser reliability in maintenance mode:
  - fix real regressions or operator pain,
  - do not keep polishing that area just because it is warm.
- Do the config-model work before agent or team implementation.
- Avoid broad code-symbol renames until the target config model is explicit.

## Active slice plan

### 1) Agent/team-ready config layering

Goal: define the next behavior-facing layer that composes on top of browser
profiles and AuraCall runtime profiles without collapsing those boundaries
again.

Deliverables
- one explicit implementation-oriented seam for:
  - `agents.<name>.runtimeProfile`
  - future team membership/reference semantics
- one canonical target-shaped config example that includes:
  - browser profiles
  - AuraCall runtime profiles
  - reserved agents
  - reserved teams
- one rule set describing what runtime-level state may still be specialized by
  agents and what must remain owned below them

Acceptance
- boundary docs aligned in:
  - [config-model-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-refactor-plan.md)
  - [config-model-target-shape.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-target-shape.md)
  - [agent-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/agent-config-boundary-plan.md)
  - [configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
- no new browser/account-bearing state introduced at the agent layer

### 2) Non-breaking schema/runtime seam

Goal: make the runtime/config code ready for future `agent -> runtimeProfile`
composition without starting agent execution yet.

Deliverables
- keep using the shared config-model helpers as the only place that knows the
  target-vs-bridge public-key contract
- add any small read-only/runtime seams needed so future agent-aware code can
  consume:
  - active runtime profile
  - referenced browser profile
  without reopening bridge-key logic at call sites

Acceptance
- focused schema/profile-resolution/config tests stay green
- no live browser behavior regresses for:
  - `default`
  - `wsl-chrome-2`

### 3) Browser reliability maintenance

Goal: keep the current browser path stable while the config-model work becomes
the primary track.

Deliverables
- only bounded fixes for:
  - reattach regressions
  - doctor/probe routing regressions
  - managed browser profile boundary regressions

Acceptance
- relevant focused tests green
- one targeted live smoke only if the touched fix affects real browser flow

### 4) Service-volatility maintenance

Goal: keep low-risk manifest work moving only when there is a clear, declarative
candidate.

Deliverables
- extract only thin label/model/route families that are clearly manifest-owned
- do not move workflow sequencing or recovery policy out of code just to keep
  the refactor warm

Acceptance
- touched service/provider regression set stays green

## Near-term order

1. Treat the public config transition as complete enough for now.
2. Define the next agent/team-ready layering seam on top of browser profiles
   and AuraCall runtime profiles.
3. Land only small runtime/schema seams that support that next layer.
4. Keep browser reliability in maintenance mode.
5. Reopen config-shape mechanics only if a real ambiguity or write-path problem
   appears.

## Not in scope for this slice

- agent execution behavior
- team execution behavior
- broad code renames from `browserFamily` to future public names
- migration ergonomics aimed at a large installed user base

## Immediate next checkpoints

1. Mark the target-shape public transition checkpoint complete enough.
2. Publish one canonical target-shaped example that includes reserved
   `agents` / `teams`.
3. Start one small seam that prepares future `agent -> runtimeProfile`
   composition without adding agent execution behavior.
