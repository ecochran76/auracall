# Plan 0386 | Positive queued worker and partial frontier | 2026-10-04

## Installed positive acceptance

Canonical installed source 504b6efcf; worker-service artifact SHA-256 343ec493baa8b8a3ecc3a9e5307df69df3dd41db2f2ff03d735feb8f06bbd204 matched the canonical build. Normal API job hmj_0861741c86544fba8c10c65b1fb28032 succeeded on one attempt, with maxItems=1, force=false, refreshSnapshot=false. It captured 01-project-description.pdf (640963 bytes, application/pdf, SHA-256 a6514768274967054d9f276e691d1ee3a67a6ec6dda9a4351d0eb3cc967d9a0f) and reused three verified cached files. All four files agreed with manifest entries and authenticated archive HTTP downloads. Identity proof matched. Download telemetry: attempted=1, succeeded=1, failed=0; one target attachment, eleven Runtime.evaluate calls, six Input.dispatchMouseEvent calls.

The independent observer saw 361 requests and three Document requests, with no visible warning. Coverage ended when worker cleanup disconnected the browser at 18:31:40.876Z, before the terminal job receipt at 18:31:42.628Z. These counts include page traffic and are not equivalent to algorithm navigation counts. No zero-traffic or full-account acceptance is claimed. Browser holder terminated normally; scheduler stayed paused.

The initial harness incorrectly treated the deliberately compact monitoring API projection as a detailed manifest, reporting no assets. Verified the same terminal job through the installed durable job store and authenticated archive routes; no provider retry occurred. The initial harness receipt is preserved. Curated verification: notes/2026-10-04-plan0386-positive-queued-worker.json.

## Automatic frontier defect

Live persistence readback after success marked the conversation assetCompleteness=complete and changeFrontierState.outcome=complete, despite more observed controls remaining outside the one-transfer budget. The materialization sidecar only contains selected/cache-reused assets. Counting every returned entry as successful does not prove the full eligible inventory is complete.

A deterministic existing LLM cache-reuse fixture now requires pendingArtifactCount=1 when two reusable assets and two uncached assets are capped at one new transfer. This failed before the repair. The LLM result now carries the uncaptured eligible count to the worker; frontier evidence records partial/deferred when pendingAssetCount is positive and explicitly clears prior complete asset evidence. Cached assets continue to consume zero transfer budget.

Focused validation: all 55 LLM file tests and 94 worker-service tests passed, typecheck and scoped lint passed. The initial wider run exposed an exact-shape fixture requiring the additive zero pending count; corrected that explicit contract and reran both files successfully. Current installed runtime and persisted row do not yet include this successor repair. Do not resume the scheduler until installed frontier acceptance passes.

Remaining: validate/integrate/install partial-frontier repair, reconcile current partial evidence from authoritative inventory, verify changed/unchanged automatic selection, then resume scheduler under renewed user authority. RDP fixes were merged in PR183; viewer/input acceptance remains separate from source integration.
