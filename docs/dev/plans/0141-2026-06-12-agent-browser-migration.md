# Agent Browser Migration Plan | 0141-2026-06-12

State: CLOSED
Lane: P03

Closeout: Pilot deferred on 2026-06-15. AuraCall proved the pilot
`chatgpt/wsl-chrome-2/consult@polymerconsultinggroup.com` BYOP profile can be
registered, selected by no-launch access-plan, and preflighted against stock
Chrome without launching. Live mutation stopped because agent-browser observes
the existing AuraCall BYOP Chrome process tree but cannot yet adopt/correlate
it as a retained service browser/session/tab, so `profileReuse` still
recommends `launch_new_browser`.

## Purpose

Evaluate and stage an incremental migration from AuraCall's internal
browser-service lifecycle to agent-browser's service-owned browser control
plane.

The goal is not to replace provider scraping logic. AuraCall should keep
provider-specific ChatGPT, Gemini, and Grok behavior while delegating generic
browser ownership, profile leasing, tab lifecycle, resource attribution, remote
viewing, and cleanup to agent-browser through its HTTP/client API.

## Current State

- AuraCall's internal browser-service can launch, attach, and reuse managed
  browser profiles, but live operation has exposed repeated generic lifecycle
  weaknesses:
  - browser cgroup memory pressure is hard to attribute from AuraCall alone;
  - stale Chrome renderer trees can survive longer than the work that created
    them;
  - tab creation and cleanup are split across provider code paths;
  - duplicate browser/profile pressure is visible only after process-level
    diagnosis;
  - ownership, lease, and cleanup semantics are narrower than the broader
    multi-agent browser orchestration goal.
- agent-browser is intended to be the workstation browser control plane for
  agentic browser work. It already exposes:
  - access plans;
  - service requests;
  - profile leases and reuse advice;
  - retained browser/session/tab state;
  - resource monitoring and conservative GC;
  - remote-headed display/view metadata;
  - HTTP, MCP, CLI, and generated client helpers.
- Live diagnosis showed agent-browser can already observe AuraCall-owned Chrome
  processes and attribute them by `--user-data-dir`, but those processes are
  external observations because AuraCall did not launch/register them through
  agent-browser.
- The main migration risk is not generic launch mechanics. It is preserving
  AuraCall's provider/account identity boundaries, especially bindings such as
  `chatgpt/wsl-chrome-2 -> consult@polymerconsultinggroup.com`.

## Goal Command Shape

This plan is designed for `/goal` execution. The recommended top-level
objective is:

```text
Design and validate an incremental AuraCall-to-agent-browser browser-control
migration that preserves provider/account identity, prevents duplicate tabs and
browsers, and proves one ChatGPT live-follow lane can use agent-browser as the
browser owner before any broader cutover.
```

Recommended `/goal` execution rules:

- Treat each slice below as a bounded milestone with its own evidence packet.
- Do not advance to a mutation or replacement slice until the prior read-only
  slice has live proof.
- Keep one critical-path owner: the AuraCall browser bridge.
- Parallel workers may inspect docs, contracts, and tests, but the bridge owner
  decides the next code boundary.
- Stop early if a slice would require changing provider scraping semantics
  before browser ownership is proven.
- Prefer installed-runtime proof over design-only claims.

## Scope

- Design an AuraCall browser-owner abstraction that can use either:
  - the existing internal browser-service implementation; or
  - an agent-browser API-backed implementation.
- Add read-only diagnostics that compare AuraCall's internal browser-process
  view with agent-browser resource/profile/session state.
- Map one AuraCall runtime/provider/account lane into agent-browser service
  profile semantics.
- Prove one opt-in ChatGPT account-mirror/live-follow target can obtain a
  service-owned browser target through agent-browser without opening duplicate
  browser lanes.
- Preserve provider adapters and scraping logic behind the existing AuraCall
  browser provider interfaces.
- Define the cutover criteria for additional providers and runtime profiles.

## Non-Goals

- Do not perform a big-bang replacement of `packages/browser-service`.
- Do not move ChatGPT/Gemini/Grok DOM scraping into agent-browser.
- Do not migrate all AuraCall runtime profiles in the first implementation
  slice.
- Do not change source browser profile, managed browser profile, or provider
  identity semantics without explicit mapping evidence.
- Do not use agent-browser's default profile when AuraCall has a configured
  account-specific managed browser profile.
- Do not make AuraCall-managed browser profiles the default for new installs;
  BYOP is for existing AuraCall profile continuity or explicit operator
  selection.
- Do not weaken identity mismatch protection or provider-app account checks.
- Do not make browser cleanup destructive without reviewable resource evidence.

## Migration Principles

- AuraCall owns provider semantics; agent-browser owns generic browser
  lifecycle.
- AuraCall calls agent-browser through the HTTP/client API, not by importing
  agent-browser internals.
- Browser profile identity must be explicit:
  - AuraCall runtime profile;
  - provider;
  - expected provider-app account identity;
  - agent-browser service profile id;
  - user-data directory;
  - browser family/build.
- Profile origin must be explicit:
  - `agent_browser_owned` for normal new installs and newly seeded account
    lanes;
  - `auracall_byop` for existing AuraCall managed browser profiles imported
    through agent-browser's BYOP/profile-registration capability;
  - `external_observed` for process/resource evidence only, never for trusted
    authenticated work.
- Fresh installs should let agent-browser create, seed, lease, reuse, and clean
  the browser profile. AuraCall BYOP is a compatibility path for account-bound
  lanes that already have durable AuraCall profile state.
- Agent-browser access-plan output is advisory until AuraCall validates that it
  points at the expected account lane.
- Tab creation must go through a service request or reuse route hint, not raw
  provider-side target creation.
- Cleanup must be policy-backed and auditable.

## Critical Path

### Slice 1: Read-Only Capability And Gap Audit

Goal:

- Produce a current compatibility matrix between AuraCall browser-service
  responsibilities and agent-browser service-control capabilities.

Work:

- Read AuraCall browser-service interfaces and current ChatGPT live-follow
  call sites.
- Read agent-browser service contracts for access-plan, service request,
  profile lookup, resources, browser records, sessions, tabs, and GC.
- Capture installed agent-browser runtime status and resource attribution.
- Capture AuraCall installed runtime browser-process status for the same
  profiles.

Evidence:

- A repo-local audit note or plan closeout section listing:
  - capabilities that can move to agent-browser immediately;
  - capabilities that need an adapter;
  - capabilities that should remain in AuraCall;
  - blockers before opt-in runtime use.

Acceptance:

- No AuraCall runtime behavior changes.
- One explicit recommendation for the first opt-in profile/provider lane.

### Slice 2: Identity And Profile Mapping Design

Goal:

- Define the stable mapping from AuraCall runtime/provider/account lanes to
  agent-browser service profiles.

Work:

- Choose the first pilot lane, expected to be
  `chatgpt/wsl-chrome-2/consult@polymerconsultinggroup.com` unless live
  evidence says another lane is safer.
- Define the agent-browser service profile id, service name, agent name, task
  names, target service ids, account ids, user-data dir, browser family, and
  freshness/readiness evidence shape.
- Define profile origin semantics:
  - fresh installs and new account lanes use `agent_browser_owned`;
  - existing account-bound AuraCall lanes may use `auracall_byop`;
  - observed unmanaged Chrome processes stay `external_observed`.
- Decide whether the pilot imports the existing AuraCall managed user-data dir
  through BYOP or starts with an agent-browser-owned profile seeded for the
  same account.
- Define how AuraCall verifies provider-app identity before trusting the
  selected agent-browser profile.
- Consume the agent-browser generic routines handoff note at
  `docs/dev/notes/2026-06-14-agent-browser-generic-service-routines-handoff.md`
  as an input, but treat it as a contract handoff until the exact
  agent-browser commit, branch, installed version, or local checkout boundary
  is recorded for AuraCall.

Evidence:

- A mapping table committed in the plan or adjacent docs.
- A no-launch agent-browser access-plan readback for the pilot lane.
- A documented account identity gate and failure mode.
- A recorded agent-browser availability boundary for the service actions and
  helpers AuraCall will call.

Acceptance:

- The access plan must not select an unrelated default agent-browser profile
  for account-bound AuraCall work.
- Fresh-install behavior is documented as agent-browser-owned profile creation
  and seeding, while AuraCall BYOP is documented as a migration/continuity
  option.
- A wrong-account or unknown-account profile remains blocked.
- AuraCall does not import generated helpers from a dirty agent-browser checkout
  while calling a stale installed binary and present that as a supported
  runtime proof.

#### Slice 2 Evidence | 2026-06-15

Status: NOT ACCEPTED FOR ADAPTER WORK.

Pilot mapping:

| Field | Value |
| --- | --- |
| AuraCall runtime profile | `wsl-chrome-2` |
| Provider | `chatgpt` |
| Expected provider-app account | `consult@polymerconsultinggroup.com` |
| Profile origin for pilot | `auracall_byop` |
| Fresh-install default | `agent_browser_owned` |
| AuraCall managed browser profile dir | `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt` |
| Chrome profile inside user-data dir | `Profile 1` |
| Proposed agent-browser service profile id | `auracall-chatgpt-wsl-chrome-2-consult` |
| agent-browser service name | `AuraCall` |
| agent-browser agent name | `auracall-api` |
| agent-browser task name | `plan0141-slice2-profile-mapping` |
| target service id | `chatgpt` |

Availability boundary:

- Installed runtime proof: `agent-browser 0.27.0`; `agent-browser service
  status --json` reported `browser_health: Ready`, `worker_state: Ready`, and
  queue depth `0`.
- Local contract proof: `/home/ecochran76/workspace.local/agent-browser` at
  `7dcbd647911440d8ab3248deb44787786b44d23b`, intentionally dirty per operator
  direction. The local checkout contains service-request schema/client support
  for `cdp_attach`, `cdp_detach`, `probe`, `tab_handle_refresh`, `ui_action`,
  `network_capture`, `file_transfer`, `diagnostics`, and generated helpers such
  as `requestServiceTabFromAccessPlan()`, `probeServiceTab()`,
  `refreshServiceTabHandle()`, `runServiceUiAction()`,
  `captureServiceNetwork()`, `transferServiceFiles()`, and
  `getServiceTabDiagnostics()`.
- AuraCall must continue to treat this as a local checkout contract boundary,
  not installed runtime proof for those newly-added helpers/actions, until an
  agent-browser commit/release/install boundary is recorded.

No-launch access-plan readback:

- Command:
  `agent-browser service access-plan --service-name AuraCall --agent-name auracall-api --task-name plan0141-slice2-profile-mapping --url https://chatgpt.com --target-service-id chatgpt --account-id consult@polymerconsultinggroup.com --json`
- Result: selected profile `stealthcdp-default`.
- Selected profile evidence: `selectedProfileMatch.reason:
  browser_build_default`; selected profile has no account ids, target service
  ids, authenticated service ids, or readiness rows.
- Decision attention: agent-browser correctly recommends a bounded auth probe
  before authenticated work, but the selected service profile is not the
  account-bound AuraCall BYOP lane. That fails this slice's acceptance gate.

AuraCall identity proof:

- Command:
  `timeout 90s pnpm tsx bin/auracall.ts --profile wsl-chrome-2 profile identity-smoke --target chatgpt --include-negative --json`
- Result: AuraCall verified expected and actual ChatGPT identity as
  `consult@polymerconsultinggroup.com`, with Pro personal account metadata and
  negative check passing on expected missing-identity failure.
- Local browser evidence: managed profile exists at
  `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt`; active
  registry entry is
  `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt::profile 1`
  on `127.0.0.1:45013`, pid `90213`.
- Google browser-profile sign-in is also `consult@polymerconsultinggroup.com`,
  but the trust gate remains the ChatGPT provider-app identity, not Google
  profile identity.

Additional runtime evidence:

- `agent-browser service profiles` contains `stealthcdp-default`, but no
  registered profile for `wsl-chrome-2`,
  `consult@polymerconsultinggroup.com`, or the proposed
  `auracall-chatgpt-wsl-chrome-2-consult` BYOP lane.
- Scoped AuraCall API readback to
  `http://127.0.0.1:8098/v1/account-mirrors/status?service=chatgpt&profile=wsl-chrome-2`
  timed out under a 20 second `timeout` wrapper.

Slice 2 decision:

- The browser profile is healthy in AuraCall.
- The provider-app account identity is healthy in AuraCall.
- agent-browser service is healthy.
- The remaining gap is the cross-service mapping/registration boundary:
  agent-browser does not yet select the existing AuraCall BYOP profile for the
  account-bound pilot lane, so Slice 3 adapter work must not start.

Next required action:

- Register or configure the BYOP service profile in agent-browser with id
  `auracall-chatgpt-wsl-chrome-2-consult`, user-data dir
  `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt`, target
  service id `chatgpt`, account id `consult@polymerconsultinggroup.com`, and
  readiness/freshness evidence derived from AuraCall's provider-app identity
  smoke. Then rerun the no-launch access-plan and require it to select that
  service profile before any adapter or live-follow mutation.

#### Slice 2 Rerun Evidence | 2026-06-15

Status: ACCEPTED FOR NO-LAUNCH ADAPTER DESIGN; NOT ACCEPTED FOR LIVE MUTATION.

Runtime registration performed through agent-browser's public service API,
without editing the agent-browser repository:

- Registered service profile
  `auracall-chatgpt-wsl-chrome-2-consult` through
  `POST /api/service/profiles/<id>` on the active stream API at
  `127.0.0.1:36969`.
- Profile fields:
  - `profileOrigin: external_byop`;
  - `allocation: caller_supplied`;
  - `keyring: manual_login_profile`;
  - `browserBuild: stock_chrome`;
  - `targetServiceIds: ["chatgpt"]`;
  - `authenticatedServiceIds: ["chatgpt"]`;
  - `accountIds: ["consult@polymerconsultinggroup.com"]`;
  - `sharedServiceIds: ["AuraCall"]`;
  - `userDataDir:
    /home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt`.
- Added persisted browser-capability registry rows for the same lane:
  - profile compatibility
    `auracall-chatgpt-wsl-chrome-2-consult-stock-chrome-wsl-compatible`;
  - scoped stock-Chrome preference binding
    `primary-stock_chrome-chatgpt-consult-polymerconsultinggroup.com-auracall-plan0141-slice3-stock-chrome-wsl-stable`;
  - stock Chrome WSL host, executable, capability, and validation evidence rows
    needed by preflight after persisted registry state was introduced.

No-launch routing proof:

- `agent-browser service access-plan --service-name AuraCall --agent-name
  auracall-api --task-name plan0141-slice3 --url https://chatgpt.com
  --target-service-id chatgpt --account-id
  consult@polymerconsultinggroup.com --json` selected
  `auracall-chatgpt-wsl-chrome-2-consult` by `authenticated_target`.
- The advertised service request shape used:
  - `runtimeProfile: auracall-chatgpt-wsl-chrome-2-consult`;
  - `profile:
    /home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt`;
  - `browserBuild: stock_chrome`;
  - `profileLeasePolicy: wait`;
  - `action: tab_new`.
- HTTP browser-capability preflight for task `plan0141-slice3` returned
  `validated_binding_applied`, executable
  `/usr/bin/google-chrome-stable`, profile compatibility
  `auracall-chatgpt-wsl-chrome-2-consult-stock-chrome-wsl-compatible`, and
  `wouldLaunch: false`.

Agent-browser gaps found during the rerun:

- The browser-capability registry write/read behavior is inconsistent:
  persisted upserts are present under `~/.agent-browser/service/state.json`,
  but the focused registry readback and access-plan summary continued to show
  only configured/default registry rows. Preflight did consume the persisted
  scoped rows after all dependent stock-Chrome inventory records were persisted.
- Access-plan `profileReuse` still reports:
  - `compatibleLiveBrowserCount: 0`;
  - `sameProfileLiveBrowserIds: []`;
  - `recommendedAction: launch_new_browser`.
- `agent-browser service resources --json` observes the active AuraCall Chrome
  process tree for
  `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt`, including
  the process group using DevTools port `45013`, but each process remains
  `disposition: observed` with no `profileId`, `browserId`, `cdpPort`, or
  `sessionIds` correlation.
- `agent-browser service browsers --json` shows only the unrelated retained
  `session:default` browser; `service trace --profile-id
  auracall-chatgpt-wsl-chrome-2-consult` has no jobs, events, incidents, or
  browser capability launches.

Slice 3/4 stop decision:

- Do not issue `POST /api/service/request` for `tab_new` yet. The selected
  service request would launch a new browser lane even though AuraCall already
  has an active Chrome process for the same BYOP user-data directory.
- The next agent-browser capability required before live mutation is an
  adopt/attach/reuse path that turns an observed external BYOP Chrome process
  with a known DevTools endpoint into a retained service browser/session/tab,
  or otherwise proves that the `tab_new` request will reuse the existing Chrome
  process without duplicate browser/profile pressure.
- Until that exists, AuraCall may implement only no-launch adapter validation
  and failure fencing. The live-follow pilot, duplicate-prevention proof, and
  cutover decision remain blocked by this agent-browser runtime gap.

### Slice 3: Agent-Browser Adapter Behind AuraCall BrowserServiceHandle

Goal:

- Add an opt-in implementation that satisfies AuraCall's browser target needs
  through agent-browser while preserving the existing provider interfaces.

Work:

- Add an adapter boundary behind AuraCall's current browser-service handle.
- Implement no-launch access-plan lookup.
- Implement service-owned tab request or reuse-route handling.
- Return the `host`, `port`, and selected tab target expected by existing
  provider code.
- Prefer agent-browser generic routines from the handoff note where they
  replace repeated generic CDP work without moving provider semantics:
  - `probeServiceTab()` for bounded page-state and identity/account evidence;
  - `refreshServiceTabHandle()` for stale target or tab rediscovery;
  - `runServiceUiAction()` for bounded generic click/fill/wait recipes;
  - `captureServiceNetwork()` for capped request and response evidence;
  - `transferServiceFiles()` for allowlisted upload and download flows;
  - `getServiceTabDiagnostics()` for post-failure evidence bundles.
- Preserve mutation audit and operation diagnostics where possible.
- Keep the existing internal browser-service as the default.

Evidence:

- Unit tests proving:
  - access-plan request shape;
  - service request shape;
  - reuse route hints are honored;
  - wrong-account or unavailable profile blocks before provider scraping.
- A provider-by-provider CDP usage classification that separates:
  - generic routines moved to agent-browser service requests;
  - provider-specific selectors and DOM interpretation retained in AuraCall;
  - raw CDP escape hatches that remain necessary and guarded.

Acceptance:

- The adapter is opt-in by config/env/test fixture.
- Existing browser-service tests keep passing.
- No live browser is launched in unit tests.
- The adapter cannot run generic routines until Slice 2 has proven the selected
  service profile, expected provider-app identity, and agent-browser
  availability boundary.

### Slice 4: Tab Lifecycle And Duplicate Prevention Proof

Goal:

- Prove agent-browser prevents the tab/browser amplification that caused
  AuraCall memory pressure.

Work:

- Use agent-browser access-plan `profileReuse` advice before browser work.
- Route tab opens through `POST /api/service/request` or generated client
  helpers.
- Verify `browserId` and `sessionName` reuse hints are preserved.
- Set explicit cleanup policy for the pilot lane.
- Compare before/after resource summaries for the pilot profile.

Evidence:

- A live or isolated-runtime proof showing:
  - no duplicate browser lane for the selected profile;
  - bounded tab count after a detail pass;
  - agent-browser service resources show correlated ownership;
  - AuraCall status still reports expected account identity.

Acceptance:

- Detail sync does not create unbounded ChatGPT tabs.
- Agent-browser service state can explain the browser, session, tab, profile,
  and job that AuraCall used.

### Slice 5: Pilot Live-Follow Run

Goal:

- Run one bounded account-mirror/live-follow pass for the pilot ChatGPT lane
  through the agent-browser-backed adapter.

Work:

- Enable the adapter only for the pilot runtime/provider.
- Run a bounded refresh/detail pass with low concurrency.
- Confirm provider-app identity before scrape.
- Confirm account-mirror cursor advancement or truthful delayed/blocked status.
- Confirm artifact/materialization behavior is unchanged.

Evidence:

- Installed runtime status readback.
- Agent-browser trace/resources readback.
- AuraCall account-mirror status before and after.
- Browser process/resource summary before and after.

Acceptance:

- The live-follow pass completes or delays for normal policy reasons.
- No identity mismatch is introduced.
- No duplicate browser/profile lane is created.
- Tab/browser cleanup evidence is visible.

### Slice 6: Cutover Decision And Expansion Plan

Goal:

- Decide whether to expand, pause, or abandon the agent-browser migration.

Work:

- Compare pilot results against the existing browser-service path.
- Record remaining gaps for ChatGPT, Gemini, Grok, handoff, media, dashboard,
  and diagnostic scripts.
- Choose the next provider/profile or define rollback.

Evidence:

- Plan closeout section with decision:
  - expand;
  - hold for agent-browser feature work;
  - retain internal browser-service;
  - hybrid mode.

Acceptance:

- No broader migration begins without a positive pilot decision.

## Parallel Tracks

These tracks can run in parallel after Slice 1 starts:

- Contract audit:
  - compare AuraCall `BrowserServiceHandle` needs with agent-browser HTTP/client
    schemas.
- Identity mapping:
  - enumerate AuraCall runtime/provider/account bindings and choose pilot
    profile ids.
- Resource evidence:
  - collect agent-browser and AuraCall browser-process summaries for current
    memory pressure.
- Test design:
  - define fixture-only tests for access-plan and service-request guardrails.
- Documentation:
  - prepare operator runbook updates for opt-in usage and rollback.

The serialized critical path remains:

1. read-only audit;
2. identity/profile mapping;
3. adapter tests;
4. duplicate-prevention proof;
5. live pilot;
6. expansion decision.

## Validation Plan

Planned validation should scale by slice:

- Slice 1-2:
  - read-only installed runtime commands:
    - `agent-browser service status --json`;
    - `agent-browser service resources --json`;
    - AuraCall browser-process/status readback;
  - no code validation unless docs/scripts change.
- Slice 3:
  - focused adapter unit tests;
  - `pnpm exec tsc --noEmit --pretty false`;
  - focused Biome lint for touched files;
  - `pnpm run build`;
  - `pnpm run plans:audit -- --keep 141`.
- Slice 4-5:
  - installed AuraCall runtime restart/readback if source changed;
  - agent-browser service status/resources/trace readback;
  - bounded live-follow refresh/status proof for pilot lane;
  - browser resource summary before/after.
- Slice 6:
  - plan closeout and roadmap/runbook reconciliation.

## Rollback And Stop Conditions

Stop before live browser mutation if:

- agent-browser access-plan selects an unexpected profile for the pilot
  account;
- provider-app identity cannot be verified from AuraCall's existing identity
  smoke path;
- agent-browser cannot return or preserve enough target information for
  existing provider code;
- service request routing creates a duplicate browser lane for the same profile
  during dry-run or isolated proof;
- the pilot would require rewriting provider scraping logic before lifecycle
  ownership is proven.

Rollback strategy:

- Keep the internal browser-service as the default until the pilot is closed.
- Gate the agent-browser adapter by explicit config/env/profile selection.
- On failure, disable the adapter and keep the collected access-plan/resource
  evidence for the next design pass.

## Acceptance Criteria

- The migration is documented as an incremental, opt-in bridge, not a big-bang
  replacement.
- The first pilot lane has an explicit identity/profile mapping.
- AuraCall can request an agent-browser-owned browser target without bypassing
  profile lease and reuse advice.
- Agent-browser service state can explain the browser, session, tab, profile,
  and resource pressure for the pilot lane.
- A bounded live-follow pilot proves no account regression and no duplicate tab
  amplification before any wider cutover.

## Definition Of Done

Plan 0141 can close only after one of these outcomes is recorded:

- **Pilot accepted:** one ChatGPT live-follow lane has run through
  agent-browser ownership with identity, tab lifecycle, resource, and status
  evidence, and the next expansion slice is opened.
- **Pilot deferred:** the read-only or adapter proof identifies missing
  agent-browser capabilities, and those are filed back to agent-browser before
  AuraCall changes continue.
- **Pilot rejected:** the migration introduces unacceptable identity,
  lifecycle, or provider-interface risk, and AuraCall keeps the internal
  browser-service path while retaining specific smaller fixes.

## Closeout Decision | 2026-06-15

Outcome: **Pilot deferred.**

AuraCall completed the read-only audit and identity/profile mapping path for
the first ChatGPT lane:

- the selected pilot is `chatgpt/wsl-chrome-2` with expected provider-app
  identity `consult@polymerconsultinggroup.com`;
- AuraCall verified the provider-app identity through its existing identity
  smoke path;
- the BYOP service profile
  `auracall-chatgpt-wsl-chrome-2-consult` was registered through the public
  agent-browser runtime API, without editing the agent-browser repository;
- no-launch access-plan now selects that profile by `authenticated_target`
  instead of falling back to `stealthcdp-default`;
- browser-capability preflight applies `/usr/bin/google-chrome-stable` for the
  BYOP lane and reports `wouldLaunch: false`.

The live pilot did not proceed because agent-browser cannot yet safely reuse
the already-running AuraCall Chrome lane:

- `agent-browser service resources --json` observes the AuraCall
  `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt` process
  tree and DevTools port `45013`;
- those resources remain `observed` only, with no correlated `profileId`,
  `browserId`, `cdpPort`, session, or tab handle;
- access-plan therefore reports `compatibleLiveBrowserCount: 0` and
  `recommendedAction: launch_new_browser`;
- issuing the live `tab_new` service request would risk duplicate
  browser/profile pressure, which violates this plan's stop conditions.

The missing capability has been filed for the agent-browser implementation
owner in
`docs/dev/notes/2026-06-14-agent-browser-generic-service-routines-handoff.md`.
AuraCall should not continue to Slice 3 live adapter mutation, Slice 4
duplicate-prevention proof, or Slice 5 live-follow pilot until agent-browser
adds an `external_byop` adopt/attach/reuse route, or otherwise proves that the
service request can reuse the existing BYOP Chrome process without launching a
duplicate lane.

Until then, AuraCall retains the existing internal browser-service path as the
default and may only perform no-launch validation/failure-fencing work for
this migration.

## First Goal Slice

Recommended first `/goal` objective:

```text
Open Plan 0141 Slice 1 and produce a read-only AuraCall/agent-browser browser
control compatibility audit with live installed-runtime evidence, identifying
the exact first ChatGPT account lane that is safe for an opt-in adapter pilot.
```

Expected first-slice deliverables:

- compatibility matrix;
- live `agent-browser service status/resources` summary;
- live AuraCall browser-process/status summary;
- pilot lane recommendation;
- updated plan closeout section or follow-up Slice 2 plan if the work should
  continue.

## Slice 1 Read-Only Audit | 2026-06-12

Status: COMPLETE

### Runtime Evidence

- `agent-browser 0.27.0` is installed and the service control plane reported
  `browser_health=Ready`, `worker_state=Ready`, `queue_depth=0`, warnings `[]`,
  `browserCount=0`, `sessionCount=0`, `tabCount=0`, and
  `profileAllocationCount=246`.
- `agent-browser service resources --json` observed AuraCall Chrome process
  pressure by managed browser profile path, but all AuraCall Chrome trees were
  external observations because AuraCall did not launch/register them through
  agent-browser:
  - `default/chatgpt`: `37` processes, about `11597 MB` RSS.
  - `wsl-chrome-2/chatgpt`: `33` processes, about `9475 MB` RSS.
  - `wsl-chrome-4/chatgpt`: `26` processes, about `4090 MB` RSS.
  - `gemini-stealthcdp/gemini`: `14` processes, about `2360 MB` RSS.
- Agent-browser resource policy reported reviewable GC support with protected
  dashboard/managed/retained-browser predicates, but no current AuraCall Chrome
  process was a safe GC candidate because ownership was not correlated.
- A no-launch agent-browser access plan for
  `serviceName=AuraCall`, `agentName=auracall-api`,
  `targetServiceIds=[chatgpt]`, and
  `accountIds=[consult@polymerconsultinggroup.com]` selected
  `stealthcdp-default`, recommended
  `verify_or_seed_profile_before_authenticated_work`, and produced a
  `tab_new` service request recipe. This proves the service path exists, but it
  also proves the pilot account lane is not mapped yet.
- `systemctl --user show auracall-api.service` reported
  `ActiveState=active`, `SubState=running`, `MainPID=812`,
  `NRestarts=1`, `MemoryCurrent=17168322560`, and
  `MemoryPeak=21634531328`.
- Scoped AuraCall HTTP readbacks against `127.0.0.1:8098` for browser-process
  and account-mirror status evidence failed after about `122s` with
  `curl: (28) Failed to connect`. The service manager state and port readback
  therefore disagreed during the audit.
- The scoped `chatgpt/wsl-chrome-2` identity-smoke probe produced no result
  after more than four minutes and was terminated by process group. This was a
  read-only probe; no runtime behavior was changed.

### Compatibility Matrix

Can move to agent-browser immediately:

- Read-only resource attribution by process/profile path through
  `agent-browser service resources`.
- No-launch browser posture and profile-reuse preflight through
  `/api/service/access-plan`.
- Operator diagnostics for browser/session/tab/job/incident state once
  AuraCall starts using service-owned requests.
- Conservative cleanup review for agent-browser-owned or explicitly
  correlated browser resources.
- Remote-headed launch posture and generated client helper request-shaping for
  new opt-in lanes.

Needs an AuraCall adapter:

- `BrowserServiceHandle.resolveDevToolsTarget()`, `connectDevTools()`,
  `getMutationAuditSink()`, `listRecentBrowserMutations()`, and browser
  operation queue summaries must be satisfied behind AuraCall's existing
  browser-service boundary.
- `LLMService.buildListOptions()` and provider adapters currently consume
  `host`, `port`, `tabTargetId`, `tabUrl`, mutation audit, and expected
  provider identity from the AuraCall browser service. The agent-browser bridge
  must return those fields without forcing provider scraping rewrites.
- AuraCall runtime profile, provider, expected provider-app account, managed
  user-data directory, and browser family must map to an explicit
  agent-browser service profile before any authenticated scrape.
- The adapter must carry profile origin so cleanup and trust policy can
  distinguish agent-browser-owned profiles from AuraCall BYOP profiles and
  external observed processes.
- Access-plan output must be treated as advisory until AuraCall validates that
  it selected the expected account lane.
- Tab creation, reuse-route hints, lease policy, cleanup, and long-running
  detail-pass behavior must be translated into service requests and retained
  trace evidence.
- Existing mutation audit and queue-yield evidence should either be preserved
  or mapped to agent-browser job/session/tab trace fields.

Should remain in AuraCall:

- Provider-specific DOM scraping, project/conversation/artifact/file
  extraction, and provider URL classification.
- Account-mirror cursoring, cooldowns, failure backoff, and materialization
  scheduling.
- Provider-app identity checks and identity mismatch/self-healing decisions.
- Archive/history materialization and local artifact/file evidence overlays.
- Handoff provider-target semantics and provider-specific prompt/upload
  behavior.

Blockers before opt-in runtime use:

- Agent-browser currently selects `stealthcdp-default` for the
  `consult@polymerconsultinggroup.com` access-plan hint. Slice 2 must create
  or register the real pilot service profile before any AuraCall scrape can use
  it.
- Existing AuraCall Chrome trees are external observed resources, so
  agent-browser cannot yet safely lease, trace, or clean them as service-owned
  work.
- AuraCall service manager health and HTTP port reachability disagreed during
  the audit; Slice 2 should use bounded timeouts and avoid depending on broad
  live readbacks while defining the mapping.
- The adapter must prove it can provide stable CDP host/port/tab target fields
  without opening duplicate tabs or bypassing profile lease advice.
- The pilot must decide whether to import the existing AuraCall managed browser
  profile or seed a new agent-browser-owned profile for the same account.
- Fresh-install profile creation should not depend on AuraCall profile
  directories; it should rely on agent-browser-owned service profiles and
  readiness/seeding evidence.

### Slice 1 Recommendation

Use `chatgpt/wsl-chrome-2` with expected provider-app identity
`consult@polymerconsultinggroup.com` as the first opt-in profile/provider lane,
but only after Slice 2 maps that lane to an explicit agent-browser service
profile, declares whether it is `auracall_byop` or `agent_browser_owned`, and
proves a no-launch access plan no longer falls back to `stealthcdp-default`.

Rationale: this is the active live-follow lane the user cares about, it has an
explicit expected identity, and current resource evidence shows enough Chrome
pressure to exercise the tab/browser lifecycle problem the migration is meant
to solve. For a fresh install, the default recommendation is different:
agent-browser should create and own the service profile, then AuraCall should
bind to that service profile after identity/readiness verification.
