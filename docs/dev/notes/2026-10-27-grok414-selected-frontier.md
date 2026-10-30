# Grok #414 selected frontier budget and retained progress

Scope: source implementation only on base 5d332eef0. No browser, provider transfer,
installation, extraction, publication, issue mutation or memory write.

Public seam: createHistoryMaterializationService createJob, scheduled execution,
and readJob from a newly constructed service over the real isolated job store.
It catches transfer-budget reuse across explicit conversation IDs and lost public
frontier observations after service restart. It does not qualify native byte
retrieval, process-crash resume, provider-wide history or foreground drain.

TDD command for both vertical cycles:
`pnpm vitest run tests/runtime.historyMaterializationService.test.ts -t 'preserves the Grok selected frontier'`

- Budget RED: received [2,2] instead of remaining allowances [2,1].
- Budget GREEN: shared transfer allowance now decrements per selected attempt.
- Retained progress RED: a restarted service returned selectedFrontier undefined.
- Retained progress GREEN: exact attempted/unattempted frontier and final budget
  survive the durable public job read. Provider history and asset coverage remain
  explicitly incomplete/unknown. This is not an automatic resume cursor.

The existing verified Build archive bridge remains authoritative for retained ZIP
bytes. Native referenced-file byte retrieval still needs qualified provider file
identity and control/byte provenance. Existing DOM row/chip identifiers alone do
not authorize fabricated provider IDs or download URLs.

Memory disposition: forbidden; the coordinating execution packet prohibits
memory writes. Root owns the shared journal and fixes-log integration.

Focused validation: `pnpm vitest run tests/runtime.historyMaterializationService.test.ts tests/runtime.historyMaterializationAttemptStructure.test.ts tests/runtime.grok414ArchiveBridge.test.ts tests/http.historyMaterializationStoreIsolation.test.ts tests/mcp.historyMaterialization.test.ts` passed all 136 tests in five files. Targeted Biome lint and diff whitespace checks passed. No broad review was invoked; the coordinating agent owns the consolidated review and findings round.

Existing #403 evidence was recovered from the source acceptance note and exact
private receipts: the qualified same-name canary B has observed native provider
file metadata, HTTP 200 asset preview and matching 104-byte rendered text/hash.
The canary was an unsent root composer, so that proof does not supply a conversation
reference or a general binary transfer protocol. Private account/asset identifiers
remain in their original user-scoped receipts. Root owns serialized fresh native
observation; this worker did not launch or use a browser.

Final `pnpm typecheck` passed after the selectedFrontier addition. This worker's
validation was source-focused only; root independently owns consolidated acceptance.
