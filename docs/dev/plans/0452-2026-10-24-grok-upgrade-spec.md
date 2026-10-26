# Plan 0452 — Grok UX, traffic governance and ecosystem support

State: CLOSED
Branch: docs/grok-ux-survey-20261024
Target: main
Owner: ecochran76
Integration: scoped pull requests; no direct canonical-branch writes
Scope: specification and ticket publication complete; implementation not started
Tracker: https://github.com/ecochran76/auracall/issues/398

## Current State

The signed-in DOM survey and two questionnaire rounds are recorded. Final scope
and validation confirmation is complete: response
`bd6450530a514b04a118e2832379daa9`, questionnaire `da55dff9014d`, revision
`47fff8a41d1cb10caef1cbfacb0b76ec9f05ee09369eb2deafeae09c0596a03d`, recorded
2026-10-24T15:39:53.965760Z. No changes requested. This settles the interview and
public behavior test boundary, not implementation or live provider acceptance.

GitHub specification #398 and all 16 approved implementation issues are published,
with exact actor, marker, body, state, label and blocker readback. The
[breakdown](0452-grok-upgrade-ticket-drafts/README.md) maps every ticket to its
canonical issue. Explicit chat approval is the authority; the review form had no
saved response. This specification/publication packet is CLOSED. Implementation,
installation and provider acceptance remain open in the tickets; no active
implementation lane or runtime effects were created by this packet. Initial
frontier: [#399](https://github.com/ecochran76/auracall/issues/399).

## Problem Statement

AuraCall's Grok automation does not fully represent the current Grok UX. History
opens through Chats while older logic seeks History. Model selection can continue
after a miss, attachment evidence is weak, and response stability can be mistaken
for completion. Grok's simpler cooldown controls do not establish shared-account
request governance or live-follow parity with the newer ChatGPT paths.

Operators need trustworthy Grok automation for Connectors/custom MCP, Bots and
Build-generated apps, with coherent CLI/API/MCP behavior, visible traffic controls
and resumable local mirroring. The concrete acceptance journey is installation
and qualification of Mail Receipts through Grok.

## Solution

Bring Grok onto the existing shared traffic and ownership contracts while
repairing its observed interaction drift. Expose explicit Connector, Bot and
Build-generated-app operations with attributable results and honest unsupported,
account-gated, awaiting-human and uncertain states. Mirror all discoverable chat
history, files and artifacts through bounded resumable work. Keep operator work
responsive and make waits, limits, warnings, coverage and outcome custody visible.

## User Stories

1. As an operator, I want my selected AuraCall runtime profile and Grok account verified, so that work cannot silently use another account.
2. As an operator, I want current Chats discovery, so that I can list and select actual conversations.
3. As an operator, I want project and Bot conversation provenance retained, so that scopes do not become mixed.
4. As an operator, I want explicit model selection verified, so that a missing or gated model cannot silently run another mode.
5. As an operator, I want current-model mode preserved when requested, so that automation respects my active choice.
6. As an operator, I want multiline prompts and selected tokens preserved, so that the submitted instruction matches my intent.
7. As an operator, I want uncertain submission distinguished from unsent work, so that retries do not duplicate prompts.
8. As an operator, I want actual response completion distinguished from streaming pauses, so that partial text is not reported as finished.
9. As an operator, I want attachment identity and readiness verified, so that an unrelated filename cannot count as my upload.
10. As an operator, I want recent files selected by stable identity, so that duplicate basenames are unambiguous.
11. As an operator, I want shared account-wide operation and request limits, so that concurrent callers cannot independently exhaust capacity.
12. As an operator, I want configurable bounded waits or immediate yield, so that I can control command responsiveness.
13. As an operator, I want effective settings, remaining capacity and next eligible time, so that I understand traffic decisions.
14. As an operator, I want warnings to block later work, so that background tasks do not continue after a limit or account challenge.
15. As an operator, I want foreground work to preempt live-follow safely, so that background mirroring does not monopolize the browser.
16. As an operator, I want Connector catalog and installed inventory distinguished, so that a catalog listing cannot claim a connection exists.
17. As an operator, I want custom MCP installation and OAuth continuation, so that I can connect Mail Receipts and other explicit servers.
18. As an operator, I want account, endpoint, scopes and tools read back, so that connection success has attributable evidence.
19. As an operator, I want selected Connectors verified in the composer, so that prompts use the intended service.
20. As an operator, I want Mail Receipts reads and offline draft revision edits qualified through Grok, so that a direct local tool check cannot substitute for product acceptance.
21. As an operator, I want read/write/send capability grants reported separately from executed actions, so that permission exposure does not imply sending occurred.
22. As an operator, I want owned and catalog Bots discoverable, so that I can choose a Bot by identity and provenance.
23. As an operator, I want existing Bot invocation and result/artifact readback, so that I can use it through the same public interfaces.
24. As an operator, I want Bot creation and editing with saved-state verification, so that reported configuration is actually persisted.
25. As an operator, I want Bot instructions, model, Connectors/tools, Skills and knowledge configured when supported, so that the Bot has the requested capabilities.
26. As an operator, I want unavailable Bot settings reported explicitly, so that unsupported configuration is never silently discarded.
27. As an operator, I want Build app generation and artifact retrieval, so that I can inspect and retain the generated result.
28. As an operator, I want explicit Grok-native publication of a selected Build output, with first-publication identity qualified on readback and existing published versions selected by their actual provider identity, so that the published URL corresponds to the output I approved.
29. As an operator, I want account-wide backfill followed by incremental follow, so that older history is not permanently omitted.
30. As an operator, I want durable cursor, phase and partial coverage readback, so that interruption and restart do not reset or misreport work.
31. As an operator, I want chat content and referenced file/artifact bytes locally verified, so that discovered metadata is not mistaken for successful materialization.
32. As an operator, I want consistent CLI JSON, API and MCP outcomes plus Ops status, so that each interface tells the same operational truth.
33. As an operator, I want privacy-bounded diagnostics, so that observing traffic does not copy credentials or mailbox content into shared logs.

## Implementation Decisions

- Reuse existing provider-account ledgers, traffic governors, authority factories,
  leases, cancellation and Workbench capabilities. Add Grok-specific discovery
  and warning classification behind adapters; do not fork a second independent
  coordination system or assume generic interfaces prove Grok runtime wiring.
- Preserve serialized Grok execution until separately justified concurrency work.
  Account-wide operation permits and owned backend-request permits are distinct.
  Measure Grok request coverage and traffic before proposing numeric ceilings;
  never reinterpret an operation cap as a backend-request cap.
- Expose account-shared settings with effective-value readback across runtime
  profiles/processes. Advanced overrides must not bypass shared-account ceilings.
  Define override resolution and restrictive account aggregation explicitly in
  the implementation packet, using current shared-governor behavior as prior art.
- Admission and waiting respect account warnings, exact target/lease custody,
  caller cancellation and deadlines. Local capacity exhaustion may wait/yield;
  a provider warning or uncertain dispatched effect is a distinct hard stop.
- Give each operation explicit account/endpoint/entity identity and structured
  outcomes. Distinguish unavailable, account-gated, awaiting-human, unconfirmed,
  failed, partial and completed where applicable. Reconcile uncertain effects;
  do not automatically repeat a possibly committed create/send/publish.
- Treat Connectors, Grok Bots and Grok generated apps as distinct domain entities.
  Preserve selected entity IDs in composer/readback and artifact provenance.
- Connector operations cover catalog/installed discovery, connection and custom
  MCP installation, authentication continuation, scopes/tools and explicit
  selection/invocation. Scope grants must be observed; server advertisements are
  not grants. Never log credentials, OAuth tokens or authenticated payloads.
- Bot operations cover inventory, invocation, creation and editing. Under the
  operator-approved 2026-10-26 Option B split, #408 covers the observed native
  Name, optional Title and Description lifecycle with exact same-ID saved
  readback. Separate Instructions and Model defaults remain required and OPEN
  in #477; Description is not Instructions, and no model-change request is not
  proof of configuring a model default. #409 separately owns Connectors/tool
  permissions, Skills and knowledge sources. Unsupported provider controls are
  explicit results; they do not satisfy the affected capability's live gate.
  Closing amended #408 does not close #477 or parent #398.
- Build generation, local archive retrieval and native publication remain separate
  stages. Prepublication evidence binds the exact provider account, conversation,
  assistant and current native workspace snapshot; unobserved app/version identity
  remains explicit. First publication requires a concrete selected-output packet
  and fresh reliable snapshot binding, then genuine provider app/version and URL
  readback. Existing published versions require actual provider identity selection
  before dispatch. Missing identity never satisfies its live gate. No external
  hosting deployment is introduced.
- Live-follow performs bounded resumable account-wide backfill then incremental
  follow. Include project/Bot chats when discoverable, expose omissions/coverage,
  honor foreground priority and preserve cursor/phase/accounting across yield
  and restart. Cached success cannot mask a failed fresh read.
- Materialization verifies selected identity, bytes and retained integrity. Distinguish
  metadata inventory, transfer, reuse, provider unavailability and incomplete
  work. Preserve attribution and do not blindly duplicate downloads.
- Provide coherent CLI JSON, local API/MCP and read-only Browser Ops status as each
  vertical behavior lands; no new graphical management forms are required.

## Testing Decisions

Use public Grok command/service operations as the primary behavior boundary with
controlled browser/CDP transport and isolated state. Verify CLI/API/MCP contract
parity. Prefer existing governor, ledger, provider-session, Workbench and
scheduler/collector seams rather than new test-only interfaces.

- Sanitized DOM fixtures reproduce current Chats opener, model/entitlement state,
  nested dialogs, ProseMirror tokens, duplicate filenames, attachment readiness,
  first-turn warning candidate, delayed commits and paused streaming.
- Drive real orchestration through the controlled transport, asserting externally
  visible outcomes and effect counts. Use discriminating red/green regressions
  for reported defects rather than tests that merely mirror implementation.
- Separate processes sharing isolated stores prove account-wide limits, warning
  persistence and non-bypass by another runtime profile/higher-cap caller.
- Scheduler/collector tests prove interruption, cancellation, bounded drain,
  restart, cursor preservation and partial coverage. Materialization tests bind
  exact assets to verified bytes and failure classes.
- Prior art includes existing Grok actions/model/evidence/adapter tests, shared
  traffic-governor and backend-admission composition tests, ChatGPT developer-app
  lifecycle acceptance contracts, and account-mirror collector/refresh tests.
- Bounded live acceptance is separate from source tests and installed identity.
  Mail Receipts, Bot create/edit/invoke and Build/native-publication gates remain
  unqualified until observed through the real Grok public path. A capability
  blocked by entitlement remains open/blocked for that live gate.

### Mail Receipts acceptance

Use the researched public MCP candidate and bind the exact account in the future
execution packet. Install or reconcile one exact Connector, complete OAuth,
observe actual read/write/send capabilities, verify endpoint/account/catalog,
and run a bounded read with explicitly chosen acceptance data. Then create one
uniquely named synthetic offline draft, read it, edit with expected-revision
protection and read back the same draft with changed revision/content. Preserve
its outcome and ownership. This is an offline Mail Receipts draft, not proof of
an Outlook/Gmail server draft. Send capability visibility is required; actual
sending is outside this acceptance journey. No credentials or raw mailbox
content enter shared evidence. Local direct MCP checks do not prove Grok use.

## Out of Scope

- Bot catalog installation, removal, scheduling, persistent-memory controls and
  appearance controls for this release; existing behavior is not removed.
- External app hosting/deployment and new graphical management forms.
- CAPTCHA bypass, implicit warning clearance, guessed account grants, unbounded
  background work, manual/foreign-tab interception, silent fallback or blind retry.
- Mail sending during qualification or destructive acceptance cleanup.
- Live provider actions, installations, deployment or scheduler enablement in
  this specification/ticket-review packet.

## Further Notes

The source survey and saved questionnaire provenance are in
[the decision record](../notes/2026-10-24-grok-ux-survey.md). Previews session
`a84de6dd5c31` holds the research, original answers and final scope/test confirmation.
The optional constraints field was skipped; no deadline is inferred.

Exact request categories, numeric ceilings, post-create Bot controls, OAuth
compatibility and Build publishing surfaces are implementation discovery tasks.
Each unit must retain an explicit source, installed and live outcome, rather than
turn unobserved capability into acceptance. Shared ChatGPT code can overlap:
coordinate any implementation edits with active owners and preserve its controls.

This plan does not authorize provider effects. It defines the agreed product
behavior. The bounded packet is done when the GitHub specification has exact
readback, proposed tickets have acyclic blocking edges and acceptance criteria,
Previews exposes their concrete review, and local documentation checks pass.


## Ticket review locator

Previews questionnaire `6246fed37ac2`, revision
`8c6cfea3111bf5081c82496bf43a8d31ac22732cacbd05625a9fc3da0785c24f`,
in session `a84de6dd5c31`. Proposed ticket bundle artifact `73c3d99fa642`.
All 16 issues are published after explicit chat approval. Their local records and
dependency edges passed structural/link checks; no product tests were run for
this docs/tracker-only slice. Mutation receipts remain user-scoped.


## Publication closeout

All issues remain OPEN with enhancement/ready-for-agent labels. Parent and
blocking relationships use explicit canonical issue URLs in the bodies. Native
planning/sub-issue mutations are not allowlisted; no parent issue was modified.
No assignee, milestone or Project changes were made. Preserve execution/live
acceptance gates when beginning the first ticket.
