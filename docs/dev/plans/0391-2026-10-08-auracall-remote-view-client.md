# AuraCall Remote-View Client | 0391-2026-10-08

State: OPEN
Lane: P86
Target: main
Integration: pull request
Owner: Eric Cochran; primary agent handles design and serialized integration.
Branch: feat/issue240-named-desktops
Base: origin/main at 591a118245cafbc54c34cd0bc179c4b380308ef6
Work items: ecochran76/auracall#240, ecochran76/auracall#241, ecochran76/auracall#242

## Current State

The product decisions below are confirmed by the operator on 2026-10-08.
AuraCall can own multiple desktops. Named desktops are configuration-driven,
with a global default and per-browser-profile assignments. The AuraCall-only
client navigates those desktops. Viewing is the default; manual input requires
explicit control handoff coordinated with automation. Root desktop remains
independently available and explicitly selectable. Selected remote-view failure
must not silently fall back to root desktop.

PR #243 merged at 591a118245cafbc54c34cd0bc179c4b380308ef6.
The operator then authorized execution of the full plan, with checkpoint and
stop before two million tokens or three hours. Packet #240 is active on
feat/issue240-named-desktops; #241 and #242 remain dependent. The execution
ledger records bounds, current evidence and unmet acceptance. No feature
acceptance is claimed from the planning merge.

### Execution revision: 2026-10-09

The implementation remains on one serialized branch for source qualification.
Packets retain their dependency order; shared launch-binding retention and
client projection are committed together before joint integration. No ticket
closes before its outcome is integrated and verified. The dedicated route is
`/desktops`; passive presentation uses Agent Browser's full-desktop capture
contract on retained remote-view browsers. Controller presentation remains
withheld until real automation exclusion and conflict arbitration are proven.

The first checkpoint used a nonexistent `service route-pool` CLI command.
Installed readback disproved it. The current source reads the actual supported
`service status` response and its `service_state.routePool` collection. Existing
three installed routes currently report unavailable; this is an installed
acceptance gate, not evidence to synthesize ready state or provision capacity.

## Objective and scope

Display AuraCall managed browsers through a dedicated remote-view client,
selected by configuration. Preserve root desktop display access. Cover shared
browser launch resolution rather than adding provider-specific behavior.
Keep managed browser profile identity and authentication intact.

## Verified source baseline

- src/browser/service/agentBrowserRdpLauncher.ts already requests remote_headed,
  rdp_gateway, manual_attached_desktop and shared_display, with serviceName
  AuraCall. It requires exact build proof and operatorVisible.state=ready,
  resolves the same converging handoff, and attaches to the returned CDP endpoint.
- docs/dev/browser-service-tools.md and docs/configuration.md document
  browserProfiles.<id>.agentBrowserRdp.enabled. Existing configuration does not
  itself implement an AuraCall-only client application.
- Agent Browser's remote-view command exposes retained browser handoffs and
  route/display binding. Its dashboard has workspace inventory and view/control
  modes. The bounded contract search did not identify a dedicated client-app
  mode. Private display isolation alone is not acceptance of a dedicated app.
- The supplied checkout has pre-existing dirty journal and handoff work; it is
  preserved. This design uses an isolated worktree from freshly fetched main.

## Confirmed product decisions

- One AuraCall-only client may present multiple AuraCall-owned desktops.
- Named desktop definitions and browser assignments live in configuration.
- A global default applies unless a browser profile explicitly overrides it.
- Root desktop remains separately available and explicitly selectable.
- Viewing does not acquire manual control. Explicit handoff coordinates manual
  control with automation ownership.
- Unavailable configured remote-view fails clearly; it never silently falls
  back to root desktop.

## Contract findings and remaining engineering checks

Agent Browser exposes routePoolEntryId, displayAllocationId and routeId binding
for remote-view opens. It also exposes observer viewer leases and explicit
service_controller_lease_takeover requests. These are existing building blocks,
not proof that desktop grouping or human/automation exclusion is implemented.

The implementation must verify whether multiple managed browsers may share one
route allocation, and how controller leases exclude AuraCall CDP mutations.
Do not equate a dashboard controller lease with paused AuraCall automation.
Use service-owned route/allocation identity, never guessed DISPLAY values.
Map named desktops to exact available service routes; missing configuration or
capacity must produce an actionable error. Automatic infrastructure provisioning
is outside this slice. Configuration changes apply to subsequent launches;
existing running browsers are not moved automatically.

The public test seams are effective configuration and launch dispatch, client
inventory/view selection, and control handoff with observable automation
admission. These follow existing ownership boundaries; exact implementation
names remain an engineering choice.

## Acceptance criteria

- Global display configuration applies to every managed AuraCall browser path;
  an explicit browser-profile override wins deterministically.
- Remote-view mode provides an AuraCall-only client with navigation between
  multiple configured desktops; only positively owned desktops/browsers appear.
- Browser-profile desktop assignment overrides the global default. Unknown
  desktop names and unavailable route allocations fail before browser launch.
- Root desktop remains independently available and explicitly selectable.
- Unavailable remote-view fails clearly without silently launching on root.
- Client reconnect uses durable handoff identity; raw provider URLs are not
  stored as durable client links.
- Authentication, browser-build proof, managed browser profile ownership,
  existing target leases and readiness checks remain enforced.
- Provider-free tests exercise real config resolution and launch dispatch;
  client tests prove ownership filtering and the agreed control posture.
- Viewing starts without a controller lease. Explicit control handoff prevents
  conflicting automation; release restores admission only after fresh ownership
  checks. Closing the viewer does not close an owned browser by implication.
- Any installed/live acceptance is recorded separately from source validation.

## Non-goals

A separately installed desktop binary, provider prompts, account migration,
root desktop replacement, bypassing browser ownership, and unrelated recovery.
Do not modify Agent Browser solely to simulate an unsupported contract; identify
any actual dependency and the narrow required change first.

## Execution packets and blocking edges

The product decisions and three-packet breakdown are approved. Detailed behavior
is captured in [the companion spec](0392-2026-10-08-auracall-remote-view-client-spec.md).
GitHub is the coordination ledger; this plan owns execution scope and evidence.
Issue receipt: [verified ticket creation](../notes/2026-10-08-plan0391-ticket-receipts.json).

| Packet | Work item | Blocked by | Bounded outcome | Initial status |
| --- | --- | --- | --- | --- |
| 1 | [#240](https://github.com/ecochran76/auracall/issues/240) | None | Configured desktop assignment and exact launch binding | READY |
| 2 | [#241](https://github.com/ecochran76/auracall/issues/241) | #240 | Dedicated client with multiple desktops and passive viewing | BLOCKED |
| 3 | [#242](https://github.com/ecochran76/auracall/issues/242) | #241 | Explicit human control coordinated with automation | BLOCKED |

Dependency links are in the issue bodies. Native planning/assignment mutations
are outside the configured forge target allowlist; no assignee, Project,
milestone, custom label, or native dependency metadata was changed. Existing
enhancement labels classify intent; they do not assert implementation readiness.

### Packet 1: configured desktop assignment and launch binding

Owner: Eric Cochran, implemented by the primary agent or a separately assigned
ready-ticket session. Inputs: confirmed spec, current configuration model and
Agent Browser route/allocation contracts. Expected write surface:
`src/schema/types.ts`, shared configuration and browser-profile resolution,
`src/browser/service/agentBrowserRdpLauncher.ts`, shared browser-service types,
public configuration/launch tests, and operator configuration docs. Follow
current graph-backed discovery before editing; these are locators, not frozen
symbol names or permission to refactor the entire configuration model.

Prove two named desktops, global default, browser-profile override, explicit
root selection and errors before launch for unknown/unavailable assignments.
Check actual service capacity and reuse behavior before promising that distinct
browser profiles can share an allocation. Freeze the minimal config schema at
implementation time after that contract check. Red-green through public config
and launch seams; preserve existing authentication/build/readiness boundaries.
Terminal condition: published, validated integrated source fulfills #240;
record any missing Agent Browser capability as an exact dependency rather than
simulating a successful binding. No live adoption is implied.

### Packet 2: dedicated multi-desktop client

Owner: Eric Cochran. Inputs: qualified packet 1 source on the joint branch and its resolved desktop
identity contract. Expected write surface: AuraCall application/API presentation
and integration tests; any necessary Agent Browser presentation change must
have its owning-repo plan and governed work item before modification. The exact
hosting seam is selected from current application architecture, not invented
by treating a raw Guacamole URL as the product.

Deliver owned inventory/navigation, passive viewing, empty/unavailable states,
durable reconnect and independent root desktop access. Prove inventory
filtering with foreign and ambiguous owners, and verify viewer closure does
not implicitly close browsers. Terminal condition: dedicated client behavior
and documentation meet #241 through integrated source and public tests.
Manual input remains disabled until packet 3 meets the control contract.

### Packet 3: coordinated human control

Owner: Eric Cochran. Inputs: integrated packet 2, real automation admission
seams, viewer/controller lease contracts and current ownership checks. Expected
write surface: the client handoff controls, shared automation admission and
handoff coordination, public behavior tests, and operator docs.

Takeover must coordinate in-flight automation before admitting human input;
prevent subsequent conflicting CDP/desktop mutations while human control is
held. Release requires fresh authority before automation resume. A controller
lease or disabled UI button alone cannot prove this exclusion. Document and
test disconnect/expiry policy conservatively; do not infer a safe resume from
an absent viewer. Terminal condition: integrated #242 source proves passive
startup, takeover, mutation exclusion, conflict refusal and verified release.

## Validation strategy

- Planning slice: verify each issue's exact title/body, label, state and marker;
  retain append-only mutation receipts, check the ticket graph and local links,
  run diff hygiene and the applicable planning audit. Do not call this a code
  test or runtime acceptance.
- Each implementation packet: read relevant policies and current graph context,
  run one meaningful failing behavior test before the minimal implementation,
  then the focused affected checks and required type/lint/build checks. Preserve
  exact red/green commands and commit/PR evidence in this plan or bounded receipts.
- Installed acceptance: separately scoped proof must show two actual named
  desktops in the AuraCall client, profile/default assignment, passive viewing,
  independent root desktop and exact control exclusion/resume. Use a bounded
  non-provider fixture where possible; browser visibility is not provider
  success. Read OS process/resource state after any live desktop run.

## Sequencing, scope controls and remaining gates

Primary owns the critical path. Packets are sequential; no parallel agent work
is needed. Register implementation custody/active lane and claim the ready work
item under applicable forge policy before editing source. Preserve other
worktrees, paused scheduler lanes and unrelated dirty state. The current execution goal authorizes implementation, integration and bounded
acceptance work. Infrastructure provisioning and unrelated provider prompts
remain excluded. Preserve unrelated installed services and browser sessions.

All three packets are expected; this plan does not silently drop the client or
control handoff if existing remote-view launching proves insufficient. If a
service contract blocks a packet, retain the exact failing evidence, identify
the owning-repo dependency, and keep the affected acceptance criterion open.

## Definition of done

- All three approved work items have integrated source and acceptance evidence.
- Operator docs describe the effective configuration and actual client behavior.
- Named desktops, default/override precedence, root access, passive viewing,
  reconnect, failure handling and coordinated control meet the acceptance criteria.
- Source validation, installed acceptance and any deferred runtime work are
  distinguished truthfully; no readiness claim stands in for observed behavior.
- Work items, plan state, roadmap/runbook and custody projection are reconciled
  from verified evidence. Close the plan only when required outcomes are met;
  this ticket-and-plan publication alone leaves it PLANNED.
