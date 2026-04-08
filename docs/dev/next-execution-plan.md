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

Deferred browser reliability TODO:

- extend the new shared browser-tools anti-bot classification before any
  broader browser CRUD push resumes:
  - `browser-tools` / page probe now classify:
    - `google.com/sorry`
    - CAPTCHA / reCAPTCHA
    - Cloudflare
    - generic human-verification surfaces
  - current adoption checkpoint:
    - `browser-tools probe|doctor`
    - `auracall doctor`
    - `auracall features`
    - `auracall features snapshot|diff`
    - `auracall setup`
    - `auracall login`
    - shared local/remote ChatGPT browser runs
    - shared local/remote Grok browser runs
  - keep the distinction explicit:
    - AuraCall Gemini provider/service already classifies `google.com/sorry`
      and persists anti-bot cooldowns
    - browser-tools / generic doctor now expose the blocking surface too
    - the remaining gap is no longer broad propagation; it is only any
      concrete unmanaged flow that still bypasses the shared signal
  - optionally allow one bounded real-pointer assist for simple checkbox
    challenges
  - otherwise pause and surface a clear manual-resume operator path
  - do not let this TODO sidetrack the current Gemini/browser-service slice
    unless it becomes the active blocker again

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

The next planning seam is now also explicit:

- future team execution should start conservative:
  - sequential first
  - explicit handoff payloads
  - shared run state
  - fail-fast by default
- parallelism and runner assignment should remain service-layer decisions
  rather than team-membership side effects
- the next code-facing planning seam should define durable shapes for:
  - `teamRun`
  - `step`
  - `handoff`
  - `sharedState`

That next seam is now captured in:

- [service-runtime-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-runtime-execution-plan.md)
- [api-compatibility-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/api-compatibility-plan.md)

Current execution/service checkpoint:

- the runtime execution vocabulary/projection seam is now in place under
  `src/runtime/*`
- a small route-neutral API vocabulary seam also exists under
  `src/runtime/api*`
- that API seam should be treated as frozen provisional scaffolding for now,
  not as an instruction to start handlers or adapters

The next active implementation target is therefore:

- persistence boundary for execution records

Recommended immediate shape:

- JSON-first runtime store under `~/.auracall/runtime/runs/<id>/`
- durable `bundle.json` write/read/list helpers
- no dispatcher or transport behavior in the same slice

Recommended next slice after persistence:

- sequential dispatcher contract only
  - classify one next runnable step
  - report deferred runnable work under sequential mode
  - report fail-fast blocked work
  - no runner behavior yet

Recommended next slice after dispatcher:

- lease ownership contract only
  - one active lease at a time
  - heartbeat/release/expire state transitions
  - no worker loop yet

Not yet:

- HTTP routes
- Responses adapter
- Chat Completions adapter
- MCP transport binding

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

The team/service line is now also in a good checkpoint:

- read-only team planning is explicit in docs and code
- inspection/doctor both show the same planned team-run bundle
- one service-ready, still non-executing seam now exists for:
  - `stepsById`
  - runnable/waiting/blocked classification
  - missing dependency reporting

That means the next move should not be more blind team-helper growth. It
should be a deliberate roadmap expansion around the future service/runtime
layer that will sit underneath those plans.

Gemini is also at a better checkpoint now:

- one full explicit web proof pass exists for:
  - AuraCall runtime profile `default`
  - browser profile `default`
- green on that pairing:
  - text
  - attachment
  - YouTube
- not green on that pairing:
  - generate-image
  - edit-image
- those non-green image cells currently look like provider/account capability
  results on this pairing, not shared browser/runtime regressions
- the runtime-profile-scoped exported-cookie fallback is now the preferred
  Linux proof path when keyring-backed Chrome cookie reads return zero Google
  auth cookies

That means the next Gemini move should no longer be more blind probing on the
same account/pairing. The next useful Gemini track is operational parity with
ChatGPT/Grok for the browser CLI surfaces that now already have real Gemini
implementations.

Immediate Gemini priority order:

1. CLI parity for already-green Gemini surfaces
   - remove stale `chatgpt|grok` target gates where Gemini is already real
   - keep help text and docs aligned with actual Gemini behavior
2. Cache/operator parity
   - enable Gemini in the cache operator surfaces that already consume provider
     cache data
   - harden post-delete cache freshness so operators do not need special-case
     refresh knowledge
3. Cache model centralization
   - move provider-cache policy out of command-local CLI code and behind one
     shared cache context / maintenance seam
   - stop reconstructing cache provider URL ownership, identity resolution
     policy, and maintenance discovery in multiple `auracall.ts` helpers
4. Coverage parity
   - add focused CLI regression tests for Gemini target acceptance and cache
     operator behavior
5. Remaining provider-gap backlog
  - account-level files only if Gemini exposes a real native CRUD surface
  - broader conversation-file fetch parity only when a new chat surface is
    live-DOM-proven
  - broader artifact parity/fetch parity only when a new artifact family is
    live-DOM-proven

Current browser-service follow-on for that Gemini discovery line:

- package-owned DOM discovery is now the right shared seam:
  - `browser-tools search`
  - generic matching on text / aria / role / class / `data-test-id`
  - toggle state via `aria-checked`
- use that seam to tighten Gemini `featureStatus` before adding more
  provider-local drawer census code
- status:
  - provider feature discovery is already out of `doctor`
  - a first-class `auracall features --target <provider> --json` surface now
    exists
  - snapshot/diff workflows also exist on that same contract
  - browser doctor is now back to browser/runtime health plus embedded runtime
    evidence

Current status update:

- items 1 through 4 are now largely addressed for the currently green Gemini
  browser surfaces
- the next cache move should not be more Gemini-specific CLI widening
- the next durable cache move is the shared subsystem slice in:
  - [cache-artifact-projection-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/cache-artifact-projection-plan.md)
- for Gemini specifically, the conversation-artifact lane is closed for now at
  the proven surfaces:
  - image
  - music
  - video
  - canvas
  - Deep Research document
- remaining Gemini work is now narrower provider backlog:
  - account-level files only if Gemini exposes a real native CRUD surface
  - broader conversation-file fetch parity only for newly proven upload-chip
    surfaces
  - broader artifact parity/fetch parity only for newly proven artifact
    families

Do not treat second-pairing proof churn as the immediate next Gemini slice
unless a new browser pairing is specifically required to validate one of those
parity lines.

Current local reality:

- `default -> gemini` is the only Gemini-ready browser pairing currently
  initialized on this host
- `wsl-chrome-2 -> gemini` is not initialized yet
- `windows-chrome-test -> gemini` is not initialized yet

So if Gemini moves again soon, the next honest step is second-pairing setup,
not pretending a second proof target is already available.

## Execution principle

- Work in small, bounded slices.
- Prefer semantic clarity over new aliases.
- Keep browser reliability in maintenance mode:
  - fix real regressions or operator pain,
  - do not keep polishing that area just because it is warm.
- Do the config-model work before agent or team implementation.
- Avoid broad code-symbol renames until the target config model is explicit.
- When broad new ideas appear, capture them as explicit roadmap tracks before
  implementation starts drifting across multiple layers.

## Broader roadmap inputs now captured

The next platform tracks are now explicit enough to guide sequencing:

1. Service mode and runner orchestration
2. Durable state and account mirroring
3. External control surfaces
   - API
   - MCP
4. Agent orchestration and local actions
5. Retrieval and search
6. Provider expansion

Short rationale:
- service mode, runners, heartbeats, and durable state are the substrate for
  almost every later multi-agent/service feature
- API and MCP should sit over one execution core rather than invent separate
  models
- local actions and agent-to-agent communication need explicit handoff/state
  semantics underneath them
- retrieval and provider expansion are important, but they should not outrun
  the service/runtime foundation

Current recommended next implementation track:

- start with the first bounded service/runtime slice from
  [service-runtime-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-runtime-execution-plan.md)
- do not reopen broad Gemini/browser work unless a concrete regression appears
- keep the future HTTP API compatibility-first:
  - [api-compatibility-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/api-compatibility-plan.md)
  - standard OpenAI-style `/v1/...` paths where they make sense
  - AuraCall-native extensions only where compatibility would be misleading or
    too lossy

## Now / Soon / Later

### Now

- service mode and runner orchestration
- durable state and account mirroring
- small team-service foundation seams that support those layers without yet
  implementing runners

### Soon

- external control surfaces:
  - API
  - MCP
- agent orchestration and local actions

### Later

- retrieval and search:
  - provider-side search
  - local lexical search
  - local semantic search
- provider expansion:
  - full Gemini
  - Claude
  - Grok image

Provider-side note:
- Gemini is the first recommended provider-expansion side track because the
  repo already has meaningful inherited support in:
  - API mode
  - Gemini web/browser mode
- the next Gemini move should be audit/alignment first:
  - [gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
- do not let Gemini become the new primary platform track
- Gemini operator/runtime alignment is now complete enough for a checkpoint:
  - local-only doctor semantics are explicit
  - runtime-profile-first Gemini targeting docs are aligned
  - no additional concrete Gemini-specific login/session/status drift is
    currently obvious
- the next Gemini side-track slice should therefore be live-proof refresh, not
  more alignment cleanup

## Active slice plan

### 1) Service/runtime foundation planning

Goal: prepare the future service/runtime layer underneath planned team runs
without starting runner execution yet.

Deliverables
- one roadmap-aligned prioritization for:
  - service mode
  - runners/workers
  - heartbeats
  - durable state
  - account mirroring
- one explicit rule set describing what remains owned by:
  - team orchestration
  - service/runtime
  - provider/account affinity
- one bounded non-executing code seam at a time only when it directly supports
  those later layers

Acceptance
- roadmap and execution docs point at the same next platform tracks
- no runner/service behavior lands by accident during planning-only slices

### 2) Agent/team-ready config layering

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
- one execution-boundary plan describing:
  - sequential-first team execution
  - explicit handoff payloads
  - shared run state
  - failure/retry ownership
  - runner assignment boundaries
- one code-facing data-model plan describing:
  - `teamRun`
  - `step`
  - `handoff`
  - `sharedState`
  with explicit ownership and serialization constraints

Acceptance
- boundary docs aligned in:
  - [config-model-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-refactor-plan.md)
  - [config-model-target-shape.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-target-shape.md)
  - [agent-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/agent-config-boundary-plan.md)
  - [team-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/team-config-boundary-plan.md)
  - [team-service-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/team-service-execution-plan.md)
  - [team-run-data-model-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/team-run-data-model-plan.md)
  - [configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
- no new browser/account-bearing state introduced at the agent layer
- one shared read-only resolver exists for:
  - `agent -> runtimeProfile -> browserProfile`
- one shared read-only resolver exists for:
  - `team -> agent -> runtimeProfile -> browserProfile`
- reserved agent/team config is visible and validated in inspection/doctor
  surfaces before any execution semantics land

### 3) Non-breaking schema/runtime seam

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

### 4) Browser reliability maintenance

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

### 5) Service-volatility maintenance

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

8. Captured the next Gemini CRUD/cache planning seam separately:
   - [gemini-conversation-gem-cache-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-conversation-gem-cache-plan.md)
   - scope:
     - conversation CRUD
     - Gem-as-project CRUD
     - cache integration
   - current guardrail:
     - start with live DOM recon only
     - do not begin Gemini CRUD implementation until the authoritative Gem and
       conversation surfaces are named concretely

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

## 2026-04-06 browser discovery checkpoint

- Current checkpoint:
  - live browser feature discovery is now a first-class AuraCall surface via:
    - `auracall features --target <provider> --json`
  - snapshot/diff is now also live on that same surface:
    - `auracall features snapshot --target <provider> --json`
    - `auracall features diff --target <provider> --json`
  - Gemini discovery is currently the most mature consumer:
    - live `Tools` drawer modes
    - live `Personal Intelligence` switch state
    - upload-path evidence from browser-service `uiList`
- Immediate next slice:
  - decide whether diff should stay focused on:
    - modes
    - toggles
    - menu items
    - upload candidates
  - or whether it should expand into richer widget-state drift for other
    providers before returning to provider backlog work
