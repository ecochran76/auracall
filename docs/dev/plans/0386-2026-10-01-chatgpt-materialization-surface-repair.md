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
