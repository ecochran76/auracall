# ChatGPT Materialization Surface Repair | 0386-2026-10-01

State: OPEN
Lane: P85
Source base: `origin/main` at `cb07bfca07d25df83082cab3bd41db6f3acd5008`
Branch: `fix/issue-165-live-follow-replay`
Target: `main`
Integration: merge

## Stable Objective

Restore ChatGPT conversation-file and generated-artifact materialization on the
current provider surface, fail explicitly when that surface drifts again, and
prove one installed positive control without resuming continuous scheduling or
spending an unbounded provider-traffic budget.

## Current State

PR #155 integrated the current semantic preview/download selector repair and
was installed from canonical merge `ef2ca681a`. Its sole installed canary,
`hmj_6b3e342c2e144f5bab077a244f27d6d0`, stopped cleanly with no visible
rate-limit warning but still produced zero assets. Earlier passive snapshots of
the same chat showed the controls mounting only after the materializer had
already settled, localizing a second defect in asset readiness rather than
filename parsing alone.

PR #156 integrated a bounded `MutationObserver` readiness wait plus the current
filename-bearing `Download <filename>` control at canonical merge `404053dd1`.
That merge is installed with byte-identical adapter and manifest artifacts.
Provider-free validation passes 282 focused/adjacent tests, typecheck,
production build, plan audit, and diff hygiene. The scheduler is paused, no
materialization job is active, and the final exact census has zero owned
`wsl-chrome-3` browser processes, listeners, or non-released leases.

An independently authorized Gate D retry, job
`hmj_1d8bf96fdc8e44c28b8c6dbf384e0d80`, ran once against the root Bailey
proposal conversation on installed `wsl-chrome-3`. It stopped cleanly with no
rate-limit warning, retry, or leaked browser/lease, but again returned zero
assets. Direct CDP observed the exact dynamic endpoint. Reconciliation exposed
a narrower readiness defect: the wait tested for any matching control on the
page, while collection required a control inside the relevant assistant/user
turn. Unrelated page controls could therefore settle readiness early.

The source follow-up scopes readiness to the same turn structure used by
collection and adds explicit recoverability states. Gate D remains open until
that source repair is proven by a newly authorized single positive control
that materializes and verifies one asset. PR #158 integrated the repair at
canonical merge `faac74e6b`; the canonical build is installed with byte-exact
adapter and materialization-service artifacts. The installed API is healthy,
the scheduler remains paused, no materialization job is active, and the exact
`wsl-chrome-3` census has zero owned browser processes and zero non-released
leases. No further live retry is authorized by this slice.

A newly authorized installed retry, job
`hmj_ac49686510764445a6ecb8b3ebc8498d`, again completed cleanly with zero
assets. Identity matched, the warning observer followed exact dynamic port
`45015`, no hard stop appeared, and cleanup left all 205 leases released. CDP
recorded 315 requests, three documents, one top-level navigation, and ten
subframe navigations for the bounded attempt. This disproved the turn-scoped
wait as a complete repair.

Provider-free trace then found a distinct selector-self defect. The configured
turn selector can return the role-bearing `[data-content-search-unit-key]` node
itself, but artifact discovery and click-time tagging derived modern role keys
only from descendants. On a surface without an outer legacy conversation-turn
section, an assistant node therefore received no assistant role and all of its
controls were discarded. Source now derives the role from both the selected
node and its descendant role node. PR #160 merged this follow-up at canonical
`d8ed3c96f`; its installed adapter is byte-identical at SHA-256
`b6e64869d8c4351b66efe6da9fd6b647f749f69a699422d1a8cb093843f233d8`.
Gate D remains open; the installed follow-up has not been re-probed, and no
further live attempt is authorized.

A direct agentic control then traversed the live root Bailey conversation and
materialized `Bailey_FY27_Proposal_With_Figures.zip` through the exact semantic
control. The 1,721,645-byte ZIP passed archive validation at SHA-256
`c463e95d...8a46dc`. That comparison found the next product-path defect:
discovery and tagging now match the current DOM, but activation still calls
untrusted `HTMLElement.click()`. The live control produced no download for that
call and completed immediately when activated with a trusted CDP pointer
sequence. Source now uses the same visible-center `Input.dispatchMouseEvent`
sequence. Gate D remains open pending canonical integration, install, and one
installed product-path positive control; the direct agentic receipt is not
substituted for that gate.

The operator then authorized one installed product control after PR #162 merged.
Canonical `2ff53befb` was installed with exact adapter/service parity. Job
`hmj_92e88aa5b845422d96a5bb2e84575885` ran once and settled `skipped` with
zero assets, no manifest entries, and no failures. Product identity matched;
no warning was observed. Fresh cleanup proved zero active jobs, zero
non-released leases, zero exact browser processes/listeners, and scheduler
still paused. Gate D remains OPEN; no retry ran. Evidence:
`docs/dev/notes/2026-10-02-plan0386-trusted-installed-control.md`.
Issue #165 owns the next provider-free diagnosis; no new live budget is inferred.

Provider-free issue #165 comparison reproduces readiness/collection eligibility
drift for hidden, unnamed, and textdoc controls. Readiness now uses collected
eligible probes. The actual recorded trusted CDP sequence and evidence limits
are preserved in
`docs/dev/notes/2026-10-03-plan0386-agentic-algorithm-comparison.md`.
This is a source repair; the prior live job does not prove causality and Gate D
remains open without a new installed acceptance budget.

The resumed operator goal authorizes up to five evidence-driven repair cycles.
A full persisted readback corrects the monitoring-only diagnosis: the prior job
stopped on `regenerate response` and executed two reload/reopen recovery actions
before discovery. Source now distinguishes ordinary regeneration controls from
failure evidence, enforces single-visit materialization with no blocking-surface
recovery, and verifies fresh native downloads against the selected filename.
Seven deterministic product-path replays cover byte/manifest correctness and
no-recovery failures. Repair cycles are 3/5 (six individual probes, kept as
separate history); Gate D remains open. PR #171 is merged and installed at
`6e2b3478057c6959079d2abf40e89a1177b969f9`. Installed cycle 3 verified PDF
cache reuse but its new ZIP transfer hit the scenario timeout; unchanged repeat
did not run. Scheduler remains paused. See
`docs/dev/notes/2026-10-03-plan0386-installed-cache-control.md`. Earlier details:
`docs/dev/notes/2026-10-03-plan0386-live-follow-repair-loop.md`.

Repair cycle 4 source continuation: PR #173 stops failed fresh context reads
before cached-control materialization. A real identity-proof/adapter replay
then reproduced a stranded private session and target-owned on the next read.
New proof sessions are now closed; borrowed caller sessions remain owned.
Historical lease timing fits this explanation, but the original exception was
not retained. No seventh provider probe at this source checkpoint. Evidence:
`docs/dev/notes/2026-10-03-plan0386-proof-session-custody.md`.

Installed cycle 4 (probe 7) verified successful fresh context after proof-session
cleanup, then failed before ZIP download. Repair cycle 5 has a local red/green
reproduction for the context deadline-copy session handoff. No eighth provider
probe at this source checkpoint; scheduler remains paused and Gate D open.
`docs/dev/notes/2026-10-03-plan0386-context-session-handoff.md`.

The fifth installed control (probe 8) still failed before ZIP download; fresh
read succeeded. Five-cycle provider budget is exhausted. The regression now
uses actual ChatgptService tab-affinity topology and catches another private
options copy in its utility wrapper. That facade custody repair is source-only;
no ninth probe or scheduler resume ran. Owned browser processes and leases
are released; incremental ZIP and repeat acceptance remain open.

The operator renewed one installation/control after that exhausted loop.
Canonical PR #176 at 500619f6e is now installed with byte parity. Renewed control
1 / historical probe 9 succeeded: verified ZIP captured once, PDF reused, cached
repeat zero downloads/CDP/observed requests, no observed warning, clean process,
listener and lease cleanup. Gate D remains OPEN only for archive projection
agreement and broader queued/scheduler acceptance is not inferred. Evidence:
`docs/dev/notes/2026-10-03-plan0386-renewed-wrapper-control.md` and adjacent JSON.

## Observed Defect

Three installed direct materialization controls against recent Bailey proposal
chats returned zero assets. Passive direct-CDP inspection of the same root chat
showed uploaded PDFs plus generated DOCX, PPTX, and ZIP assets and visible
`Download file` controls. The adapter still limits assistant artifacts to
`button.behavior-btn` and user uploads to legacy `[role="group"][aria-label]`
tiles. The current provider surface instead exposes semantic
`Open preview of <filename>` controls with adjacent download actions.

A separate acceptance-observation defect hard-coded DevTools port `45015` even
though the exact `wsl-chrome-3` launch returned dynamic port `55627`. Product
traffic guards use the resolved runtime session; acceptance observation must do
the same and may not silently watch a stale endpoint.

A third defect made the bounded readiness wait page-global even though typed
collection is turn-scoped. A control mounted in unrelated page chrome or a
different turn could satisfy the wait, causing the selected Bailey turn to be
collected before its generated-file control appeared. Empty results also lacked
an explicit distinction between recoverable missing controls, metadata-only
inventory, and provider-confirmed terminal loss.

A fourth defect assumed every selected turn root contained a separate role
descendant. Current search-unit markup can make that selected root the
role-bearing node itself. Failing to inspect the root's own
`data-content-search-unit-key` or `data-chatgpt-search-unit-key` collapses a
visible assistant turn into an untyped root and yields a false empty result.

## Scope

1. Recognize current semantic preview controls in assistant turns and user
   upload turns while preserving the legacy surface.
2. Use one shared candidate contract for discovery and click-time activation.
3. Surface a sanitized provider-surface-drift diagnostic when generic file
   controls are visible but typed extraction produces no candidates.
4. Bind passive warning observation to the exact resolved runtime endpoint,
   never a remembered fixed port.
5. Add provider-free regressions, operator documentation, and one bounded
   installed positive-control receipt.

## Non-Goals

- Resume the scheduler or completion loop.
- Run broad reconciliation, refresh a catalog, or rotate through chats.
- Prompt ChatGPT to repair an expired or broken generated-asset link.
- Dismiss a rate-limit, CAPTCHA, or human-verification surface.
- Retry a failed or ambiguous live canary.

## Safety And Traffic Bounds

- Provider-free implementation and validation run first.
- The scheduler remains operator-paused.
- Live acceptance is one exact `wsl-chrome-3` conversation and one attempt.
- No preparatory conversation navigation, reload, snapshot refresh, or
  automatic retry is authorized.
- A visible rate-limit warning, CAPTCHA, identity mismatch, endpoint ambiguity,
  bad lease, or outcome-unknown result stops live work immediately.
- Passive observation records sanitized warning/effect evidence only and does
  not click `Got it` or mutate the page.

## Acceptance Gates

### Gate A - Provider-free surface contract

- Current `Open preview of <filename>` assistant controls normalize to stable
  downloadable artifacts.
- Current user-turn preview controls normalize to stable conversation files.
- Legacy behavior buttons and legacy upload tiles remain supported.
- Discovery and activation use identical title, turn, message, and index
  semantics.
- Generic visible download/preview evidence with zero typed candidates yields
  an explicit sanitized surface-drift result rather than a false empty success.

### Gate B - Source validation

- Focused adapter, llmservice/materialization, warning-guard, and endpoint
  resolution tests pass.
- Typecheck, production build, affected lint, diff hygiene, and plan/lane audit
  pass.
- User-facing materialization and WSL/operator docs describe the current
  semantic surface and dynamic endpoint rule.

### Gate C - Canonical install

- The reviewed change integrates through the repository workflow.
- The installed runtime is built from the canonical merge and touched runtime
  artifacts match that build.
- Scheduler and completion remain paused before and after installation.

### Gate D - Single installed positive control

- A passive warning observer attaches to the exact runtime-resolved endpoint
  before the materialization attempt and remains attached through its terminal
  warning window.
- One recent Bailey proposal chat materializes at least one visible generated
  asset.
- The resulting file is readable and its filename, byte size, MIME/type
  evidence, checksum, manifest, and archive projection agree.
- No visible warning, CAPTCHA, identity drift, retry, unrelated tab adoption,
  bad lease, owned-browser leak, or listener leak occurs.

## Closeout

Update this plan, active lane, dev journal, fixes log, testing/operator docs,
and a sanitized durable acceptance note. A source-only repair does not close
the objective. Scheduler resume remains a separate operator decision.
