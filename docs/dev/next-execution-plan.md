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

Agent-ready execution-adjacent state now:

- shared selection now supports:
  - `agent -> runtimeProfile -> browserProfile`
- `--agent <name>` now resolves through the real config/runtime path
- explicit `--profile` still wins over `--agent`
- config inspection/doctor now surface selected-agent resolution directly
- stored session metadata now preserves:
  - `options.selectedAgentId`
- session/status text and JSON now expose selected-agent provenance directly
- one shared runtime helper now exists for:
  - selected agent
  - resolved AuraCall runtime profile
  - resolved browser profile
  - inherited default service
- one browser-facing helper now exists for:
  - shared runtime selection
  - browser-profile resolution
  - explicit runtime-profile override support
- browser config, browser runtime metadata, and session/postmortem surfaces now
  preserve selected-agent provenance locally

That means the agent-selection/provenance seam is complete enough for a
checkpoint. The next useful step is no longer more provenance reporting or
lower-layer agent selection plumbing. It is to move upward to the first
team-side readiness seam.

Team-ready read-only state now:

- shared selection now supports:
  - `team -> agent -> runtimeProfile -> browserProfile`
- shared model-layer helper now exists for:
  - team member runtime/browser activation contexts
- `config show` and `profile list` now expose resolved teams directly

That means the first team-side readiness seam is also complete enough for a
checkpoint. The next useful step is not more read-only team plumbing. It is to
define the future team selection/execution boundary before any `--team` runtime
semantics land.

The intended future direction is now explicit:

- teams are expected to become the orchestration layer for:
  - divide-and-conquer task decomposition
  - multi-turn automation across multiple agents
  - explicit data handoff between agents
- future service mode, runners, and parallelism remain the execution layer
  underneath that orchestration intent
- do not collapse those concerns into today's CLI-only `--team` selection seam

ChatGPT hardening is also in a better checkpoint than before:

- mutation-side persistence/verification is substantially hardened:
  - root rename
  - root delete
  - project source add/remove
  - project settings/instructions
- read-side conversation recovery now has:
  - one shared conversation-surface readiness seam
  - bounded llmService retry for transient conversation read misses
- artifact-local consistency now has:
  - shared image identity
  - shared download/spreadsheet button identity
  - shared canvas content resolution
- live artifact proof on `wsl-chrome-2` now includes:
  - DOCX/download
  - spreadsheet (`.xlsx`)
  - generated image
- one current deferred note is intentionally recorded, not promoted:
  - the browser-mode wrapper for the generated-image proof appeared to linger
    after direct `context get` / `artifacts fetch` already proved the image
    artifact was present and materializable

That means the ChatGPT line should pause on refactoring and move into
maintenance/proof-planning mode:

- keep the proof docs current
- only fix a new live blocker if it is concrete
- do not let side findings automatically become the next coding slice

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
- one rule set describing what teams may coordinate directly and what must
  remain deferred to the future service/runners layer
- one rule set describing how future teams should express:
  - divide-and-conquer intent
  - multi-turn agent collaboration
  - data handoff intent
  without implying runner topology or parallel execution by themselves

Acceptance
- boundary docs aligned in:
  - [config-model-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-refactor-plan.md)
  - [config-model-target-shape.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-target-shape.md)
  - [agent-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/agent-config-boundary-plan.md)
  - [team-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/team-config-boundary-plan.md)
  - [configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
- no new browser/account-bearing state introduced at the agent layer
- one shared read-only resolver exists for:
  - `agent -> runtimeProfile -> browserProfile`
- one shared read-only resolver exists for:
  - `team -> agent -> runtimeProfile -> browserProfile`
- reserved agent/team config is visible and validated in inspection/doctor
  surfaces before any execution semantics land

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
  - selected agent resolution
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
  - concrete ChatGPT hardening regressions proven by live smokes
  - not adjacent side findings that are already logged for later follow-up

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
4. Carry that seam through one real browser/runtime path and one postmortem
   surface so provenance is local to execution diagnostics.
5. Move upward to the first team-side readiness seam.
6. Define the team/service boundary before adding any `--team` runtime
   semantics.

## Completed recent checkpoints

1. Threaded optional `--agent` selection into the real config/runtime
   resolution path without adding agent execution behavior.
2. Surfaced selected-agent resolution in:
   - `config show`
   - `config doctor`
3. Preserved selected-agent provenance in stored session metadata.
4. Surfaced selected-agent provenance in:
   - `auracall status`
   - `auracall session <id>`
   - session/status JSON
5. Added a shared runtime selection helper and a browser-facing runtime
   selection helper.
6. Preserved selected-agent provenance in:
   - browser config
   - browser runtime metadata
   - session/status postmortem output
7. Added the first team-side readiness seams:
   - shared team selection
   - shared team runtime selection
   - resolved team inspection in:
     - `config show`
     - `profile list`

## Recommended next choice

Recommended next choice:

1. Team execution boundary checkpoint
   - define what a future `--team` means
   - keep current team work read-only / selection-oriented
   - explicitly separate team config from future service/runners parallelism

2. Only after that, add a bounded `--team` resolution path
   - inspection and runtime planning only
   - no team execution yet

Recommendation:
- take the team execution boundary checkpoint next
- reason: the lower team-ready composition path is now established enough that
  the next risk is semantic drift, not missing plumbing
