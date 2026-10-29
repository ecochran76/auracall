# Grok retained artifact materialization

A successful configured `grok-build --action export` now rechecks the native
workspace ZIP against its retained byte count and SHA256, then records it in the
existing run archive. The Build result's `materialization` field reports
`indexed`, `not_materialized`, or `failed`, local archive item IDs and verified
bytes. A persistence or verification failure does not turn the already observed
export effect into a safe retry. Native export still needs its own effect authority;
materialization does not implicitly request another export.

The new archive item ID is a local receipt identifier. It is not a provider app,
version, file or artifact ID. Its metadata retains the exact observed account
reference, target, conversation, assistant, current gateway, archive checksum and
app/version fields. Unobserved app/version remains null. Build account-reference
hashes are not reinterpreted as another subsystem's account identity namespace.

Use existing public surfaces to inspect and reuse the selected item:

```sh
auracall api archive --provider grok --kind generated_artifact --json
auracall api archive-materialize '<returned-local-item-id>' --json
auracall api archive-materialization-create '<returned-local-item-id>' --json
```

The existing HTTP interfaces are `GET /v1/archive`,
`POST /v1/archive/items/{archive_item_id}/materialize`, and durable jobs under
`/v1/archive/materializations`. The corresponding existing MCP archive contracts
remain the shared materialization interfaces. Queued archive jobs keep their durable job ID,
active-job reuse, cancellation/recovery and foreground-work gate. A selected
Build receipt is bounded to one archive of at most25MiB. Its local reuse performs
no provider download. Existing history-materialization item budgets, cursors,
provider drain/foreground yielding and restart contracts are unchanged; this
bridge does not broaden Grok history coverage or replace its checkpoints.

Every selected Build archive is independently rechecked before reuse or serving.
Missing, changed, symlinked or otherwise unqualified bytes become unavailable;
the original checksum is retained. `force` does not silently fetch a replacement
workspace snapshot. Replacements need a separately authorized exact native export.
The generic filename/URI fallback cannot lend a Build archive to another artifact.
Never execute or extract generated code merely to validate materialization.

Build/Ops materialization coverage is explicitly limited to the selected archive.
It reports verified local counts/bytes with `complete=false`,
`referencedFiles=not_qualified`, and observed/unobserved app identity. Ops counters are the last indexed observation at `observedAt`; they are not
a fresh filesystem scan. Read the selected archive item to revalidate its current
bytes. These counters are not account-wide artifact inventory, completed history
backfill or publication proof.
A failed provider read is not a successful empty inventory.

Conversation-bound uploaded references now use the actual native attachment card
and Download control. Context and file listing return one canonical `upload`
reference per observed file metadata ID, retaining the native human response UUID,
DOM response ID and separate gateway row ID. They do not duplicate uploads as
generated artifacts. Coverage remains visible-conversation-only and incomplete;
unobserved app/version identity remains null. This does not qualify account-wide
file discovery or arbitrary file types.

A fresh reference transfer requires explicit `acknowledgeTargetDefaultReset: true`
on the archive materialization request. The provider option is
`grokReferenceDownload: { acknowledgeTargetDefaultReset: true }`. This acknowledges
that native Chrome download policy is temporarily scoped to a new private capture
directory and then reset to the target default; it does not claim restoration of
an unknown prior policy. Missing acknowledgment refuses before preview or download
changes. The transfer uses the exact owned native Download control and a bounded
fresh filesystem capture; there is no generic HTTP fallback.

Reference receipts retain distinct account, conversation, human response, file
metadata and native URL fingerprints, alongside original byte count and SHA256.
Verified local reuse needs no download acknowledgment or provider transfer.
Changed bytes retain the original checksum and become unavailable. A policy reset
or transport cleanup failure preserves captured bytes and receipt with an unknown
outcome; reconcile custody before retrying. Metadata discovery, source-test
qualification and successful native byte acceptance remain separate evidence.

Selected-conversation history reconciliation shares one new-transfer budget across
its exact conversation frontier. Each subsequent conversation receives only the
remaining allowance, and zero remaining allowance ends the pass even when the
target-count allowance remains. Cached reuse does not spend this transfer budget.
The durable job's attempt receipts retain the allowance before each attempt;
restarting or issuing another pass does not establish complete provider history
or qualify an unobserved referenced-file download control.

For an explicit `conversationIds` frontier, the public job result also retains
`selectedFrontier`: the exact attempted and unattempted IDs, final target/transfer
budget, `providerHistoryComplete=false`, and `assetCoverage=unknown`. This survives
service restart through the existing durable job store. Unattempted means no
attempt in that pass; it can include an asset already covered by verified archive
reuse. Attempted does not mean complete, available or safe to retry. The field is
an observation checkpoint, not a provider cursor or an automatic resume command.

For Grok history jobs, `materializationCursor` checkpoints progress before and
after each conversation attempt. Completed attempts retain their verified
attempt receipts and target/transfer budgets. Before provider work starts,
`inFlight` identifies the selected conversation, attempt index and allowance;
a completed checkpoint clears it. If work is interrupted, the durable job keeps
both the completed progress and any unresolved in-flight attempt. Its
`budgetScope=completed_attempts_only` means the retained allowance excludes
unknown effects from unfinished work.

Default HTTP/Ops job responses expose completed-attempt and remaining-conversation
counts, budgets, restart policy and in-flight state. They omit the full receipt
array and remaining conversation-ID batch; request `detail=full` on the existing
history job read/list endpoints for those retained details. MCP history job
outputs also retain the cursor. These fields describe the selected local pass;
they do not establish provider history completeness or local asset coverage.

The cursor's `resumePolicy=explicit_request_required` preserves the existing
restart boundary: queued jobs can be recovered, while running jobs interrupted
by API startup become failed and retain their cursor. No unknown in-flight
attempt is automatically replayed. A separately authorized new request must
rediscover the selected assets and verify retained archive bytes before reuse.
Neither the cursor nor a remaining budget qualifies a provider file-read method,
a safe retry, or a provider-native resume token.

### Qualification history

Earlier inspection observed an inactive Files controller and empty tree; that
observation did not prove referenced files absent. Later selected-file and
referenced-upload acceptance superseded that gate, as recorded below. Source,
local API, installed and native evidence remain separate.

## Selected native workspace files

The source adapter can expose an actually selected generated workspace file as
an artifact and retain its bytes with account/conversation/fsKey/full-path and
dataURL fingerprint provenance. It accepts only current committed ready-tree
membership and a loaded native data URL, then rechecks ownership/cache state
after hashing. The archive materializer verifies retained byte size and checksum;
same-size tampering is a failure, including forced reads. Credentialized asset
URLs are never returned. Unobserved revision/app/version fields remain null.

This is selected-file coverage, not a complete history inventory. The first
discovery attempt found an inactive viewer and retained no bytes or sidecar.
That historical failure is preserved; the later acceptance below qualified a
fresh active viewer. A historical READY tree or previously observed data URL
cannot authorize a new capture. Metadata-only artifacts remain not_materialized.

### Native selected-file acceptance, 2026-10-29

The previously inactive selected-file gate now passes on a freshly qualified
managed browser: `/src/components/timer.tsx`, 21,762 bytes, SHA-256
`9c806b0f60e392ad993cc2485d1631914a8100303027dff1896fee24f6753f06`.
The bytes match the fresh native ZIP member and retained sidecar. Real isolated
Archive APIs proved materialization, verified reuse, durable restart through an
injected foreground gate, and same-size tamper refusal. No provider recapture
or operational-store write occurred. App/version/revision remain null.
This accepts the selected generated-file slice. Referenced-upload acceptance
followed separately; installed/native history continuation is not claimed.

### Explicit native reference download scope

Fresh reference transfers require `acknowledgeTargetDefaultReset: true` on
HTTP/MCP archive materialization and history-job requests. CLI callers use
`--acknowledge-target-default-reset` with `api archive-materialize`,
`api archive-materialization-create`, or `api history-materialization-create`.
Durable jobs retain this explicit scope through restart; old requests do not gain
it automatically. Verified local reuse needs no acknowledgment. This scope
authorizes temporary capture-directory policy followed by a target-default reset,
not restoration of an unknown prior download policy.

### Native referenced-upload acceptance, 2026-10-29

The public adapter discovered the current canonical upload, read both conversation
messages without a legacy main shell, and downloaded `reference-414.txt`: 107 bytes,
SHA-256 `5e34ff7e9d8997af149b7a875940dce6117c1f2b73fc23e7ae159ea197d38e78`.
Independent rehash, receipt/sidecar equality and acknowledged default-policy reset
passed. Isolated public archive APIs proved retained-file handoff, verified reuse,
durable restart with an injected foreground gate, and same-size tamper refusal.
These do not claim installed-host adoption, complete provider history, or a native
foreground run. App/version remain unobserved null fields. The bounded review
and original-issue closure decision are tracked in
[the review record](dev/notes/2026-10-29-grok-r2-review.md).
