# Next Execution Plan (2026-04-02)

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

## Execution principle

- Work in small, bounded slices.
- Prefer semantic clarity over new aliases.
- Keep browser reliability in maintenance mode:
  - fix real regressions or operator pain,
  - do not keep polishing that area just because it is warm.
- Do the config-model work before agent or team implementation.
- Avoid broad code-symbol renames until the target config model is explicit.

## Active slice plan

### 1) Config-model target shape

Goal: define the target public config shape clearly enough that implementation
can proceed without more semantic drift.

Deliverables
- explicit target objects for:
  - browser profiles
  - AuraCall runtime profiles
  - agents
  - teams
- one canonical example config using the intended layering
- migration notes describing which current keys are bridges versus likely final
  public shape

Acceptance
- target shape documented in:
  - [config-model-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-refactor-plan.md)
  - [config-model-target-shape.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-target-shape.md)
- linked consistently from:
  - [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
  - [agent-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/agent-config-boundary-plan.md)
  - [configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)

### 2) Non-breaking schema/runtime seam

Goal: make the runtime/config code read more like the target model without
forcing a big-bang migration.

Deliverables
- introduce narrow compatibility seams where runtime profiles explicitly
  reference browser profiles
- reduce new call sites that treat browser-bearing state as if it belongs to
  AuraCall runtime profiles directly
- keep current config loading behavior intact while moving the code toward the
  target layering

Acceptance
- focused schema/profile-resolution/config tests stay green
- no live browser behavior regresses for:
  - `default`
  - `wsl-chrome-2`

### 2.5) Target-shape input alias policy

Goal: define the future compatibility contract before accepting target-shape
input keys.

Deliverables
- documented precedence for:
  - `browserProfiles` vs `browserFamilies`
  - `runtimeProfiles` vs `profiles`
  - `runtimeProfiles.<name>.browserProfile` vs
    `profiles.<name>.browserFamily`
- documented write-back policy for:
  - `wizard`
  - `profile scaffold`
  - `config migrate`
- explicit stance on mixed bridge/target diagnostics before implementation

Acceptance
- policy documented in:
  - [config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)
- phase-1 dual-read may land only through:
  - schema/model/resolver loading
  - read-only diagnostics
  - bridge-key writes remaining unchanged

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

1. Lock the target config shape in docs.
2. Land the next non-breaking runtime/schema seam toward that shape.
3. Define the target-shape input alias policy.
4. Keep browser reliability in maintenance mode.
5. Resume larger implementation only after the target config model is explicit.

## Not in scope for this slice

- agent execution behavior
- team execution behavior
- broad code renames from `browserFamily` to future public names
- migration ergonomics aimed at a large installed user base

## Immediate next checkpoints

1. Make the config-model refactor the active roadmap track.
2. Publish the target public shape and layering examples.
3. Start one small implementation seam that follows that target without
   breaking current config behavior.
