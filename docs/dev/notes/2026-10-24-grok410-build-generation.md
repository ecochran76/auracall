# Grok 410 — governed generation source packet

State: source partial; issue 410 remains OPEN. No native generation, publication,
installation or cleanup of unrelated runtime resources was performed.
Plan0452 / Plan0453; source base `83e0951e8`; worker branch
`feat/grok-410-resume`, worktree `auracall-grok-410-resume`.

The 2026-10-24 UX survey observed the Build model entry and home-page Build hint,
and explicitly did not test Build execution/artifacts. This packet uses those
observed controls and the existing strict Grok text pipeline. It does not invent
app/version attributes, output routes, export buttons or private backend endpoints.

## Source behavior

- Validate explicit generation confirmation before browser acquisition. Preserve
  an existing root draft, selected tokens and observed attachments by rejecting
  nonempty/ambiguous context.
- Use configured traffic authority and exact same-transport account proof before
  discovery, before Send and after result readback. Missing/gated Build remains
  unavailable. Refused admission sends nothing.
- Select and verify Build, prepare exact text, dispatch once and observe the
  existing terminal response lifecycle. Bind returned text to one exact
  conversation and response; never retry unknown Send outcomes.
- Keep terminal text distinct from app completion, preview, version and local
  bytes. Source currently stops at partial/app_identity_unobserved; app-specific
  artifact retrieval remains unfinished.
- Retain target/effect custody through cancellation, transport and cleanup
  failures. Fresh account drift discards unattributable response content.
- Provide the shared CLI/API command boundary, configured service, MCP handler
  and sanitized progress writer. The coordinator owns shared entry-point/Ops
  registration using `/tmp/grok410-registration.patch` (check passed on base).

## Validation

Public seam: `createGrokBuildService`, `runGrokBuildCommand` and MCP handler over a
controlled CDP transport running the actual DOM JavaScript. DOM hierarchy is a
controlled fixture, not captured provider HTML. No internal action mocks.

Red/green command: `pnpm vitest run tests/browser/grok410Build.test.ts --maxWorkers=1`.
The generation tracer first failed because mode discovery returned available
without submitting or producing a response; after implementation it returned
partial with the exact terminal response. Pre-acquisition cancellation first
threw AbortError instead of reporting no Send; the bounded repair reports
`grok_build_cancelled_preflight`. Missing-module bootstrap red is not counted as
behavioral defect reproduction. The controlled fixture initially omitted the
response's DOM parent; that test-harness timeout was repaired separately.

Focused presubmit:
`pnpm vitest run tests/browser/grok410Build.test.ts tests/browser/grok402Text.test.ts tests/browser/grokUiOperation.test.ts --maxWorkers=1`:
37 tests passed across 3 files (14 Build cases). Targeted Biome lint passes on the
six new source/test files. `pnpm typecheck` passes after removing an invalid
list-options timeout lookup. No comprehensive suite, installed runtime or native
acceptance is claimed. Shared registration is separately validated by coordinator.

## Acceptance still required

| Issue criterion | Evidence | Remaining gate |
| --- | --- | --- |
| Discover Build controls/entitlement before submission | Observed menu labels; real-path gated/available/absent fixtures | Native generation/output controls and actual entitlement |
| Separate generation, preview, completed output, local bytes | Explicit response-completed/partial and unknown/unavailable fields | Implement actual app/output/export stages from observed controls |
| Bind artifacts to app/version/conversation and verify bytes | Exact conversation/response proof only | App/version proof; governed export; integrity/local bytes |
| Truthful public outcomes/no implicit publication | Command/MCP/source tests; publication not requested, actual state unknown | Shared registration/HTTP/Ops integration and native readback |
| Source/installed/live distinctions, docs, traceability | This packet and `docs/grok-build.md` | Installed executable and bounded native acceptance |

Do not close 410 or unlock 411/414 from this source slice.

## Prepared native generation packet — NOT authorized or executed

Account/runtime: existing configured AuraCall runtime profile `default`, provider
`grok`, managed browser profile `~/.auracall/browser-profiles/default/grok`.
Before any effect, re-read exact configured account expectation and same-transport
identity, installed/source executable SHA, runtime process/desktop custody, and the
new retained target ID. Record actual account identifiers only in private
user-scoped evidence. A prior survey identity is not current proof.

Proposed effect: exactly one fresh root Build submission, no attachments,
Connectors, external services, Bot edits, app publication or deployment.
Exact prompt:

> Create a static one-page timer for local inspection. Do not publish, deploy, install Connectors, access files or call external services.

Observation bound: 300000 milliseconds on the same retained target. Verify the
visible Build entry/account gate and selected Build before Send. On uncertainty,
retain the target and inspect once; no resend, new generation or automatic cleanup.
CAPTCHA/MFA/warning/identity drift stops the packet.

The coordinator must bind and obtain the missing native-effect authority before
running this packet. Record one Send, terminal generation state, actual app ID and
version evidence, preview/result controls, and export controls/bytes when present.
Keep raw DOM/screenshots outside Git. Sanitize fixture semantics from observed
controls, then implement app/version readback and governed export before claiming
410 acceptance. A preview URL alone cannot satisfy byte/export/publication gates.

Memory disposition: forbidden. Developer instructions prohibit memory writes
without an explicit user request; this implementation objective is not such a
request. No Graphiti write was attempted. Non-write receipt:
`/tmp/grok410-resume-memory-disposition.json` (`recorded_no_write`, zero writes).
