# ChatGPT Materialization Surface Repair | 0386-2026-10-01

State: OPEN
Lane: P85
Source base: `origin/main` at `cb07bfca07d25df83082cab3bd41db6f3acd5008`
Branch: `fix/chatgpt-materialization-surface`
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
node and its descendant role node. Gate D remains open; this source follow-up
has not been installed or re-probed, and no further live attempt is authorized.

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
