# ChatGPT Skill Lifecycle Discovery | 0327-2026-09-02

State: CLOSED
Lane: P20
Operational state: LIVE_DISCOVERY_ACCEPTED_MUTATIONS_WITHHELD
Branch: feat/plan0327-chatgpt-skill-discovery
Target: main
Integration: merge
Revision: 4 | 2026-09-02

## Stable Objective

Establish a discovery-first, exact-account ChatGPT skill lifecycle contract
without converting a visible skill label into claims of installation,
activation, stable identity, version, invocation, or CRUD readiness.

## Current State

- The LitScout handoff is `docs/dev/notes/0003-2026-09-02-chatgpt-skill-lifecycle-discovery-and-crud-handoff.md`.
- AuraCall feature-signature discovery currently accepts string skill labels
  and incorrectly reports them as `available` through
  `tool_drawer_selection`.
- The existing `capabilities --target chatgpt --category skill` report is the
  smallest truthful read-only seam; developer-app CRUD is adjacent machinery,
  not a skill identity or lifecycle authority.
- No current provider fixture proves a stable skill ID, installed/enabled
  state, version, manifest/files, ownership, or invocation.
- Provider-free static and discovered label projections now preserve those
  fields as unknown/unproven. CLI, local API, and MCP share that capability
  report contract.
- Read-only ownership preflight found the `wsl-chrome-3` managed Chrome at PID
  `1933`, DevTools port `45015`, with no AuraCall controller or operation lease.
  A second preflight at `2026-09-02T08:44:26-05:00` confirmed the same process
  and no alternate AuraCall runtime profile with the configured ChatGPT account
  binding.
- The operator explicitly transferred operational control of PID `1933` for
  this bounded discovery. AuraCall reattached through its exact managed-browser
  resolver without relaunching Chrome, rewriting registry ownership, or taking
  shutdown rights over the pre-existing process.
- One authenticated read-only attempt observed separate `/plugins` and
  `/skills` routes. The skills surface exposes installed and created-by-me
  groupings, a 32-hex `skill_id` detail route, owner display, bounded file-tree
  inventory, a `Needs review` status, a separate `Try in chat` action, and a
  create control. The live identifier and account content are redacted from the
  provider-free receipt.

## Execution Graph

1. Correct provider-free capability projection to report label-only evidence
   as lifecycle `unknown` with no invocation claim.
2. Verify CLI/local API/MCP capability-report parity and document the semantics.
3. Audit current browser ownership and exact-account prerequisites read-only.
4. Only if the live discovery gate is safe, inspect one authenticated skills
   surface without mutation and capture the minimum private fixture needed to
   design `skills list/show`.
5. Defer every mutation class to separately gated successor packets after
   stable identity and postcondition contracts are proven.

## Acceptance Criteria

- `SLD-R1`: visible label evidence reports lifecycle, installation, stable
  identity, and invocation as unknown/unproven.
- `SLD-R2`: CLI, local API, and MCP preserve the same truthful capability state.
- `SLD-R3`: read-only discovery binds evidence to the exact AuraCall runtime
  profile, managed browser profile, and ChatGPT account or stops explicitly.
- `SLD-R4`: any provider fixture is bounded, private, and contains only fields
  needed for stable identity and lifecycle modeling.
- `SLD-R5`: no install/create/update/enable/disable/uninstall/delete/invoke,
  prompt Send, runtime install, restart, scheduler change, or provider mutation occurs.

## Bounds

- One provider-free correction loop and at most one read-only live discovery
  attempt after ownership/account preflight.
- No name-only lifecycle claim or targeting. Keep developer-app and skill
  semantics separate.
- CAPTCHA, MFA, account ambiguity, missing stable identity, or foreign browser
  ownership is a hard stop.

## Definition Of Done

Provider-free truthfulness is accepted, one safe exact-account read-only
discovery either produces a minimal stable contract fixture or records its
exact hard stop, and every mutation remains separately gated.

## Closeout Evidence

- RED: the live-feature fixture failed because label-only `skills[]` still
  projected `available` / `tool_drawer_selection`; the static catalog fixture
  independently failed for the same invocation overclaim.
- GREEN: `tests/workbenchCapabilities.test.ts`,
  `tests/cli/workbenchCapabilitiesCommand.test.ts`, and
  `tests/mcp.workbenchCapabilities.test.ts` pass 21 tests. Typecheck,
  production build, scoped Biome lint, plan audit (`326` kept, `0` errors),
  and diff hygiene pass.
- Static `wsl-chrome-3` CLI readback reports `chatgpt.skills` as account-gated,
  lifecycle unknown, stable identity unobserved, installation unobserved, and
  invocation unobserved.
- Live discovery reattached only after explicit operator ownership transfer.
  The exact managed Chrome, authenticated surface, stable detail-route identity,
  inventory grouping, owner display, review state, file tree, and distinct
  invocation action were observed. No create, install, update, enable, disable,
  uninstall, delete, invocation, prompt Send, runtime install, service restart,
  or scheduler/materialization action occurred.
- Cleanup restored the selected tab to `https://chatgpt.com/`. PID `1933` and
  port `45015` remained live, the registry retained null job owner/operation/
  lease fields, and the browser-operation directory remained empty. This is
  intentional: the user transferred operational authority for the attempt, not
  process-parentage or shutdown ownership.
- Minimal redacted provider fixture:
  `docs/dev/notes/2026-09-02-plan0327-chatgpt-skill-discovery.json`.
- Provider-free checkpoint: `c8097717`; acceptance checkpoint: `687767ab`;
  non-forced merge receipt: `1c126b96`.
