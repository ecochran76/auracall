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


## Source-only continuation — selected native file guard

The coordinator resumed source preparation while configured native reads were
stopped at provider-session provenance proof. No provider call was made by this
worker. A focused regression showed the empty-root Build guard accepted a native
file input with one selected file but no provider chip, then dispatched Send. The
guard now rejects any nonempty native FileList in its composer form. This uses
platform presence evidence only; it does not claim upload identity or repair 403.

Red and green command:
`pnpm vitest run tests/browser/grok410Build.test.ts -t 'selected native file' --maxWorkers=1`.
Red returned partial/completed and sent once; green returns unavailable/no effect
and sends zero times. Focused combined suite now has 38 passing tests across the
same 3 files (15 Build cases); targeted lint/diff checks and `pnpm typecheck` pass.

Read-only existing-conversation discovery is a bounded Chats inventory followed by
an exact selected conversation/target. A title or current selected model is only
a candidate hint, never Build provenance. Generic conversation context is not
the clean Build observation seam: it can open sources/accordions, omits same-origin
source links and has no app/version contract. After proof repair, use one
same-target `Runtime.evaluate` inventory with no navigation/click/Send. A prepared
private operator helper lives at `/tmp/grok410-observe-existing-target.ts`; it is
not product code and was import-checked only. It requires configured exact-target
account proof both before and after observation, records bounded raw DOM only to a
private owner-only file, and returns sanitized counts. No native invocation or
app/version inference occurred. Coordinator retains native authority and timing.

Continuation memory disposition: forbidden; non-write receipt
`/tmp/grok410-continuation-memory-disposition.json`, zero writes.


## Plan0458 native continuation — fresh target affinity

The first approved native attempt reached a configured-account match, then
stopped before Send with `grok_build_preflight_failed`. An exact retained-target
read proved the model selector was behind an existing Connector detail dialog.
The generic Grok adapter had ignored `retain-new`; issue403 owns that repair.
Build generation also now forces `preserveActiveTab=false` and clears inherited
`tabTargetId`/`tabUrl`, so a configured retained target cannot defeat fresh-root
acquisition. Existing user targets are preserved.

Focused regression `generation clears inherited target affinity` first failed
with inherited `preserveActiveTab=true`; after the source change all16 Build
tests pass. Command: `pnpm vitest run tests/browser/grok410Build.test.ts --maxWorkers=1`.
Private raw/source/helper-hash receipts are under the user-scoped
`~/.auracall/private/grok/implementation-native/410-20261025` directory.
A subsequent identity probe was refused by a live shared interaction-ledger lock
held by an unrelated ChatGPT app-list process. No lock was removed and no Build
Send occurred. Native generation/app/version/export acceptance remains pending.


## Plan0458 native continuation — modal model-picker ordering

After the unrelated lock owner exited naturally, a fresh public identity probe
matched and the patched public source CLI acquired a genuinely new target. Build
was available, but generation was refused with `grok_build_empty_root_required`;
no prompt or Send occurred. Exact-target readback confirmed the root editor's
actual ProseMirror/combobox surface and the open Radix model menu. The menu marks
its background editor `aria-hidden`, so checking that editor between menu
discovery and selection incorrectly classified a clean root as unavailable.

A controlled-CDP fixture now models the observed modal hiding. Before the fix,
its public service result reproduced the same unavailable/no-Send failure.
Generation checks the root before disclosure, selects observed Build, verifies
that selection using the existing model verifier (which closes the menu), and
checks the root again before inserting text. Separate draft/native-FileList races
during selection remain unavailable and preserve the incoming state without Send.
The fixture models observed structural semantics; raw provider HTML and account
proofs remain private. No app/version/export schema has been inferred from it.


### Explicitly closed picker roots

Primary native discovery additionally proved that closed provider overlays may
remain mounted with nonzero geometry. The model-menu reader now excludes exact
Radix `data-state="closed"` ancestors rather than treating their labels as live
controls. A public Build fixture with a retained closed picker reproduced an
unavailable result before the one-line filter; afterward it discovers the active
picker and completes the controlled generation. Active-dialog and empty-root
guards remain strict. Build/model selections pass24 focused checks across2files.


## Plan0458 bounded Build canary — retained unknown outcome

The clean source CLI at `669023e34` ran the approved exact timer prompt after
a fresh no-launch configured-account match. The earlier preflight/no-Send
receipts remain intact. This invocation progressed beyond Build discovery but
returned `grok_build_cleanup_unknown`: generation/effect unknown, cleanup unknown
and `retrySafe=false`, with an exact retained target and no qualified
conversation/response/app/version identifiers. No publication was requested.

Read-only registry inspection found the exact target's utility lease idle with
`effectState=outcome-unknown`, no active process owner and no final disposition.
The native window was released to the coordinator for supported same-lease
read-only reconciliation. No lease, target or lock was removed, no browser
navigation/cleanup was attempted, and no generation was replayed. The one-Send
canary authority is consumed or uncertain until that exact target is reconciled.
Raw result, source/dirty/helper hashes and lease snapshot are private files
`modal-fixed-generation.json`, `modal-fixed-dispatch-source.json` and
`modal-fixed-terminal-leases.json` beneath the user-scoped directory above.
Issue410 stays open; app/version/preview/export evidence and installed-runtime
acceptance remain unproved.
