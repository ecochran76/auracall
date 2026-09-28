# Declarative ChatGPT Agent Workflows | 0362-2026-09-27

State: OPEN
Lane: P55
Work items: #94, #93, #95, #96, #97, #98
Source base: `origin/main` at `252439ddcb6a92cd93d59d630861c5dacf20834c`

## Objective

Make long-running ChatGPT work declarative and resumable for agents. An agent
must be able to select the exact AuraCall runtime profile, discover and select
connected composer capabilities, attach exact provider Library files, submit a
long-running request in its conversation-bound tab, and resume through
`codex-wake` only after AuraCall has durably persisted and published the exact
terminal result. Normal concurrent AuraCall use must remain valid during tab
affinity soak evaluation.

## Current State

- Issue #90 repaired current ChatGPT composer-menu and connected-app mention
  selectors and is integrated at the source base.
- Issue #94 reproduces a durable API provenance error: an explicit
  `wsl-chrome-3` ChatGPT request is later validated against `default/grok`.
- Issue #93 specifies a provider-neutral terminal-session receipt, but no
  producer implementation is integrated.
- `composerTool` is a request/config input, but agents lack a complete dynamic
  discovery and selection contract for connected apps; issue #95 owns that
  end-to-end outcome.
- Local file upload and provider account-library inventory exist as separate
  concepts, but request-time exact Library references are not productized;
  issue #96 owns that outcome.
- Published AuraCall skills do not yet teach exact-receipt `codex-wake`
  continuation; issue #97 owns publication after #93, #94, and paired
  `CochranResearchGroup/codex-wake#169` are usable.
- The issue-49 soak lane is active in a separate checkout. Issue #98 owns the
  corrective evaluator semantics that permit attributable ordinary use without
  weakening duplicate/unattributed-target or aggregate-provider guards.

## Scope

- Correct explicit AuraCall runtime profile and managed browser profile
  propagation across durable API and browser-service boundaries.
- Emit privacy-bounded, atomic, idempotent terminal-session receipts after
  durable result persistence.
- Discover and select ChatGPT composer tools and connected apps through stable
  provider-neutral request identities.
- Discover and attach exact ChatGPT Library files through a distinct
  `libraryFiles` request surface.
- Publish copyable AuraCall skill instructions for exact-receipt codex-wake
  continuation of Pro and Deep Research requests.
- Attribute legitimate new-conversation, conversation, and live-follow target
  activity during affinity soak evaluation.
- Run provider-free validation followed by bounded installed ChatGPT live
  acceptance. Live testing is authorized; every live packet remains
  zero-blind-retry and stops on its first decisive hard failure.

## Non-goals

- Coupling AuraCall directly to Codex sessions, tmux, app-server, or a wake
  dispatcher.
- Including prompts, response bodies, provider payloads, credentials, cookies,
  or unrestricted absolute paths in receipts or diagnostics.
- Treating provider Library files as local uploads or composer tools.
- Automatically connecting a provider app, approving a provider warning, or
  clicking ChatGPT `Answer now`.
- Enabling Gemini or Grok tab affinity as part of this campaign.
- Waiting for a nominal soak duration after an observable terminal violation.

## Execution Topology

Maximum active concurrency is four: one primary integrator and three
subagents. Nested subagents are prohibited. Each implementation lane owns one
issue, branch, worktree, bounded write surface, validation set, and terminal
handoff. The primary owns cross-lane contracts, reconciliation, merge order,
installed acceptance, and completion claims.

Sustained implementation, difficult debugging, integration, and causal review
use `gpt-5.6-sol`. Mechanical documentation or fixture conversion may use
`gpt-5.6-terra` with deterministic verification. Polling, hashing, schema
checks, counters, and test execution use tools. A `gpt-6-*` model may be used
only for one closed-world, single-turn, read-only architectural decision; it
must not own a branch, receive full history, retry, or continue a lane.

## Work Graph

### Wave 1: parallel foundations

1. **P55 / #94 — explicit profile provenance repair (critical path)**
   - Owner: primary integrator, `gpt-5.6-sol`.
   - Branch: `fix/issue-94-profile-provenance`.
   - Preserve the explicit runtime/provider/managed-profile context and
     revalidate it through the receiving service authority rather than falling
     back to service defaults.
   - Acceptance: a provider-free default-Grok/explicit-wsl-chrome-3 regression,
     focused profile/provenance tests, typecheck, then one bounded installed
     durable ChatGPT request with no Grok target or path.

2. **P56 / #93 — terminal-session receipt producer**
   - Owner: subagent, `gpt-5.6-sol`.
   - Branch: `feat/issue-93-terminal-receipts`.
   - Own durable-result finalization, atomic receipt publication,
     reconciliation, configuration/status, and provider-free fixtures.
   - Installed consumer acceptance waits for #94; no browser-profile code or
     codex-wake documentation belongs in this lane.

3. **P57 / #95 — connected capability discovery and selection**
   - Owner: subagent, `gpt-5.6-sol`.
   - Branch: `feat/issue-95-chatgpt-connectors`.
   - Deliver one vertical path through discovery, request selection, ChatGPT
     adapter verification, receipt metadata, tests, and user documentation.
   - Preserve current durable tool IDs and aliases; dynamic exact provider rows
     must not require source edits.

4. **P58 / #96 — exact Library references**
   - Owner: subagent, `gpt-5.6-sol`.
   - Branch: `feat/issue-96-library-references`.
   - First isolate Library inventory/locator resolution and fixtures behind a
     narrow adapter boundary. Integrate the current-tab drawer and attachment
     verification without conflating local upload or composer selection.
   - Installed acceptance waits for #94.

### Join 1: integration

Merge/reconcile in dependency order: #94, #93, #95, then #96. Rebase each
remaining lane on the newly integrated remote main before cross-lane
acceptance. Shared schema or ChatGPT adapter conflicts are explicit
reconciliation work; inspect both intents rather than choosing the newest edit.

### Wave 2: freed-slot follow-ons

5. **P59 / #97 — published codex-wake workflow**
   - Begins after #93 and #94 contracts are integrated and the paired
     codex-wake consumer is usable.
   - Publish exact request/receipt/wake/resume recipes plus failure semantics in
     the AuraCall ChatGPT skill and operator docs.

6. **P60 / #98 — soak attribution correction**
   - May develop provider-free after one Wave-1 slot closes, but must not alter
     or restart the active issue-49 installed soak from another checkout.
   - Permit exactly attributable legitimate conversation target creation while
     retaining hard stops for duplicates, unattributed targets, cross-binding,
     forbidden actions, provider warnings, and global rate windows.

7. **P61 — combined installed acceptance**
   - Build and install only an exact integrated canonical candidate.
   - Verify explicit `wsl-chrome-3` routing, capability discovery/selection,
     one exact Library attachment, a long-running Pro or Deep Research request,
     ordinary concurrent conversation activity, a dedicated live-follow tab,
     terminal receipt integrity, one codex-wake continuation, and soak
     attribution/rate-limit/warning invariants.
   - A decisive failure ends that packet immediately. Retain the receipt and
     diagnose before any separately justified retry.

## Lane Write Boundaries

- P55: runtime selection, configured execution, provider-session authorization,
  and their focused tests/docs.
- P56: durable result finalization, receipt schema/store/config/status, focused
  tests/docs.
- P57: capability discovery and composer connected-app request flow, focused
  ChatGPT adapter/tests/docs.
- P58: Library inventory/reference request flow and attachment verification,
  focused ChatGPT adapter/tests/docs.
- P59: published skill and wake integration fixtures after producer/consumer
  contracts settle.
- P60: soak receipt/status attribution and focused evaluator tests.

If implementation proves these boundaries inseparable, stop only the
colliding lanes, record the overlap, and let the primary redefine ownership.

## Required Handoff

Every worker returns status, issue and branch, exact commit, changed paths,
tests and outcomes, remaining risks, any live effects, and its runtime handle.
Partial evidence is required on timeout. Worker completion is not integration
or acceptance.

## Acceptance Criteria

- [ ] #94 is integrated and installed evidence proves explicit
      `wsl-chrome-3` ChatGPT requests cannot fall back to default Grok.
- [ ] #93 is integrated and terminal receipts are atomic, idempotent,
      privacy-bounded, post-persistence, reconciled after restart, and
      consumable by codex-wake.
- [ ] #95 is integrated and agents can discover/select connected capabilities
      without manual CDP or AuraCall source edits.
- [ ] #96 is integrated and agents can discover/attach exact Library files by
      stable ID or unique exact name with fail-closed verification.
- [ ] #97 is integrated and the published skill contains an executable
      long-running request plus codex-wake continuation workflow.
- [ ] #98 is integrated and soak evaluation permits attributable normal use
      while preserving all provider and ownership guards.
- [ ] Provider-free focused suites, typecheck, formatting/lint appropriate to
      changed surfaces, and the combined installed ChatGPT acceptance pass.
- [ ] Plans, active lanes, dev journal, fixes log, user docs, issue states,
      branches, PRs, and remote commit readbacks agree with actual completion.

## Stop Conditions

- Stop and checkpoint before cumulative goal work exceeds 1.5 million tokens.
- Stop live automation on CAPTCHA, human verification, provider warning,
  uncertain mutation effect, identity drift, wrong managed profile, or an
  outcome-unknown fence.
- Never auto-click ChatGPT `Answer now`.
- Do not treat CI availability as required for local progress; record skipped
  GitHub Actions separately from local validation.

## Definition of Done

All six issues are truthfully closed from merged canonical commits; the exact
installed candidate passes the combined acceptance; codex-wake resumes from an
integrity-checked terminal receipt; normal concurrent AuraCall use is accepted
by attributed soak evaluation; and no required work or unresolved corrective
finding remains.
