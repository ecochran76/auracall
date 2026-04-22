# Plan 0021 | Browser Operation Dispatcher

State: CLOSED
Lane: P01

Closed: 2026-04-21
Outcome: Dispatcher/account-contamination proof completed. Follow-on provider
selector-diagnosis drift moved to
`docs/dev/plans/0022-2026-04-21-provider-selector-diagnosis-hardening.md`.

## Purpose

Make managed browser profile CDP ownership deterministic by routing browser
operations through one profile-scoped dispatcher instead of allowing independent
commands to attach, launch, navigate, and probe the same DevTools control plane
concurrently.

This is a bounded browser-service reliability slice. It is not a broad
multi-runner scheduler or a new public execution surface.

## Current State

Completed state:

- managed browser profile directories under
  `~/.auracall/browser-profiles/<auracallProfile>/<service>`
- browser-state registry entries with liveness classification
- doctor/features/setup/login flows that can attach to live DevTools sessions
- browser execution paths that can launch managed Chrome and run provider
  automation
- service/runner orchestration for stored runtime work at the AuraCall runtime
  layer

Implemented in first slice:

- `packages/browser-service/src/service/operationDispatcher.ts` defines:
  - dispatcher key construction from managed browser profile dir plus service
    target
  - in-process operation acquisition/release
  - file-backed same-machine operation locks for separate AuraCall processes
  - structured busy results with active operation id, kind, class, key, owner
    pid, DevTools metadata, and recovery guidance
- `runBrowserLogin` accepts an operation dispatcher and acquires
  `exclusive-human` ownership before allocating a debug port or launching
  Chrome.
- The CLI-facing browser login path passes a file-backed dispatcher rooted at
  `~/.auracall/browser-operations`, so overlapping login launches for the same
  managed browser profile fail before both processes try to claim CDP.
- Managed-profile login now defaults missing debug-port strategy to
  auto-assigned ports. Explicit runtime-profile `fixed` configuration is still
  honored, but the default Grok/ChatGPT/Gemini auth-mode path no longer has to
  share `127.0.0.1:9222`.
- `auracall doctor` and `auracall features` now acquire `exclusive-probe`
  ownership around live browser-tools/provider probes, and the AuraCall browser
  doctor/features contracts include the active operation record when a live
  probe runs.
- Browser execution now acquires `exclusive-mutating` ownership for managed
  browser profiles before local Chrome launch/navigation/prompt submission and
  before remote managed-profile browser runs when a managed profile path is
  configured.
- `auracall setup` now acquires `exclusive-human` ownership around initial live
  identity checks, login launch, verification, and final doctor collection.
- Lower-level AuraCall-managed `browser-tools` commands now acquire
  `exclusive-probe` ownership when they resolve through an AuraCall managed
  browser profile. This covers `start`, `tabs`, `probe`, `doctor`, `ls`,
  `search`, `nav`, `eval`, `screenshot`, `pick`, and `cookies`. Explicit
  `--port` remains a raw operator/debug path and bypasses the profile
  dispatcher because it targets an already chosen CDP endpoint.
- Serial live smoke on 2026-04-21 proved default managed browser profile
  separation after the dispatcher wiring:
  - Grok launched on auto-assigned port `45040`, doctor selected only
    `https://grok.com/`, reported dispatcher key
    `managed-profile:/home/ecochran76/.auracall/browser-profiles/default/grok::service:grok`,
    saw no blocking state, and identified `Eric C` / `@SwantonDoug` /
    `ez86944@gmail.com`.
  - ChatGPT launched on auto-assigned port `45065`, doctor selected only
    `https://chatgpt.com/`, reported dispatcher key
    `managed-profile:/home/ecochran76/.auracall/browser-profiles/default/chatgpt::service:chatgpt`,
    ignored the separate live `wsl-chrome-2/chatgpt` session on port `45013`,
    saw no blocking state, and identified `ecochran76@gmail.com` from
    `auth-session`.
  - Gemini launched on auto-assigned port `45000`, doctor selected only
    `https://gemini.google.com/app`, reported dispatcher key
    `managed-profile:/home/ecochran76/.auracall/browser-profiles/default/gemini::service:gemini`,
    saw no blocking state, identified `Eric Cochran` /
    `ecochran76@gmail.com`, and detected live feature evidence.
  - Grok and ChatGPT doctor commands still exited nonzero because selector
    diagnosis found current selector drift on non-conversation/home surfaces;
    that drift is separate from the dispatcher/account-contamination proof and
    is tracked in Plan 0022.

Newly reproduced mismatch:

- default managed browser profile auth checks for Grok, ChatGPT, and Gemini
  opened provider windows on the same fixed DevTools port `127.0.0.1:9222`
- live doctor/probe output could then mix tabs and evidence across providers
  unless the operator manually serialized the checks
- read-only probes are not truly read-only when they select tabs, focus pages,
  or rely on URL-family target selection
- human-verification/login flows need an exclusive browser-profile lease so
  automation does not keep retrying or close the active human flow

## Scope

### In scope

- Add a browser-service-owned operation dispatcher keyed by managed browser
  profile identity.
- Start with one active operation at a time per dispatcher key.
- Define dispatcher keys from the resolved launch/profile identity:
  - AuraCall runtime profile when available
  - service target
  - managed browser profile dir
  - source browser profile name when needed for diagnostics
- Route managed-profile browser operations through dispatcher acquisition:
  - `login`
  - `setup`
  - `doctor`
  - `features`
  - browser execution
  - lower-level `browser-tools` wrapper calls when they target an AuraCall
    managed profile
- Return structured busy/blocked diagnostics instead of launching or probing
  through an already-owned profile.
- Treat human-verification and manual-login flows as exclusive operations that
  block automation on the same managed browser profile until cleared.
- Preserve operation evidence:
  - operation id
  - operation kind
  - dispatcher key
  - owner/startedAt
  - resolved DevTools endpoint
  - selected tab URL/title
  - blocking state

### Out of scope

- multi-runner or background-worker scheduling
- cross-host browser operation leasing
- parallel browser execution across one managed browser profile
- raw CDP multiplexing for arbitrary external clients
- provider-specific login automation or CAPTCHA/human-verification bypass
- replacing the runtime `ExecutionServiceHost` queue/lease model

## Operation Classes

The dispatcher should start with conservative operation classes:

- `exclusive-human`
  - login/setup/manual verification
  - blocks all automation on the same managed browser profile
- `exclusive-mutating`
  - prompt send, project/conversation CRUD, navigation, file upload
  - one active operation per managed browser profile
- `exclusive-probe`
  - doctor/features/browser-tools probes that select tabs or run target
    discovery
  - initially serialized because selection/focus/page-probe behavior can alter
    or depend on shared state
- `shared-read`
  - deferred until a later slice proves a specific read path does not select,
    focus, navigate, or mutate page state

## Dispatcher Key

The first dispatcher key should be explicit and diagnostic-friendly:

```text
managed-profile:<absolute-managed-profile-dir>::service:<target>
```

Additional metadata should be carried for reporting but should not weaken the
profile boundary:

- AuraCall runtime profile
- browser profile id/name
- source browser profile
- chrome profile directory
- DevTools endpoint

## Acceptance Criteria

- Concurrent managed-profile operations for the same dispatcher key do not both
  attach/launch/probe through CDP.
- A second operation receives a structured busy response that includes the
  active operation id, operation kind, dispatcher key, DevTools endpoint when
  known, and recovery guidance.
- `login --target grok` blocks `projects --target grok` or browser execution on
  the same managed browser profile until the login/manual-verification flow is
  complete or abandoned.
- Simultaneous default Grok/ChatGPT/Gemini auth-mode launches no longer all
  claim the same fixed `9222` DevTools endpoint as clean evidence when no
  explicit fixed debug-port strategy is configured.
- `doctor` and `features` report the dispatcher key and selected tab evidence
  used for their conclusion.
- The existing `wsl-chrome-2/chatgpt` session cannot contaminate default
  `chatgpt` checks.
- Human-verification pages remain a hard stop; the dispatcher records the
  blocking operation instead of retrying automation.

## Validation

- Focused browser-service unit tests for:
  - dispatcher key creation
  - operation acquisition/release
  - busy/blocked result shape
  - exclusive-human blocking exclusive-probe and exclusive-mutating work
  - stale owner cleanup when the owning process is dead
  - file-backed cross-process-style contention through independent dispatcher
    instances
- Focused AuraCall CLI/browser tests for:
  - `doctor` through dispatcher acquisition
  - `login` holding exclusive-human ownership
  - browser execution refusing or waiting according to configured policy
  - managed-profile `browser-tools` commands refusing an active same-profile
    dispatcher lock before resolving/launching a DevTools port
- Manual/live smoke:
  - default Grok + ChatGPT + Gemini account-health checks run one at a time
    without shared-port contamination
  - default ChatGPT remains distinct from `wsl-chrome-2/chatgpt`
  - record provider selector-drift failures separately from dispatcher/account
    ownership evidence
- Standard docs-only/planning validation for this slice:
  - `pnpm run plans:audit`
  - `git diff --check`

## Definition Of Done

- High-level managed-profile browser operations that can touch CDP go through
  one dispatcher acquisition path.
- Lower-level AuraCall-managed browser-tools commands use the same profile
  acquisition path unless the operator passes an explicit `--port`.
- Busy/blocked responses are machine-readable and operator-actionable.
- Manual-login/human-verification flows are exclusive and visible in
  diagnostics.
- Provider adapters do not need provider-specific heuristics to avoid same-port
  or same-profile races.
- Follow-on scope is explicitly reassessed before adding shared reads,
  cross-process durability, or background browser workers.

## Follow-on Slices

- Plan 0022:
  `docs/dev/plans/0022-2026-04-21-provider-selector-diagnosis-hardening.md`
  covers Grok and ChatGPT selector-diagnosis drift reproduced during the live
  dispatcher smoke.
- Reassess whether the current same-machine file-backed operation lease needs
  age-based expiry or richer abandoned-operation cleanup only if a future
  abandoned-operation incident is reproduced.
- Decide whether fixed DevTools ports should become explicit single-owner
  resources in the registry or whether managed-profile launches should prefer
  auto-assigned ports everywhere.
- Add a narrow `shared-read` class only for operations proven not to select,
  focus, navigate, or mutate page state.
- Reconcile dispatcher ownership with future multi-runner service mode before
  allowing background workers to drive browser profiles.
