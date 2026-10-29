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

Grok's existing Files context/recent/select/upload APIs do not supply a qualified
referenced-file download API. Referenced-file byte retrieval remains an unmet
#414 gate. Metadata discovery, initial native transfer, verified local reuse,
unavailable bytes and uncertain provider effects remain distinct evidence states;
this archive bridge only qualifies the retained workspace portion. Source tests,
installed identity and any future native acceptance must be reported separately.

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

Current native inspection has observed an inactive conversation Files controller
with an empty tree. That observation does not prove that referenced files are
absent. A genuine conversation-scoped file path, revision and byte-read protocol
remain unqualified, so #414 remains open beyond the source cursor and retained
workspace-archive portions. Source tests, installed runtime checks and native
acceptance remain separate gates.

## Selected native workspace files

The source adapter can expose an actually selected generated workspace file as
an artifact and retain its bytes with account/conversation/fsKey/full-path and
dataURL fingerprint provenance. It accepts only current committed ready-tree
membership and a loaded native data URL, then rechecks ownership/cache state
after hashing. The archive materializer verifies retained byte size and checksum;
same-size tampering is a failure, including forced reads. Credentialized asset
URLs are never returned. Unobserved revision/app/version fields remain null.

This is selected-file coverage, not a complete referenced-upload or history
inventory. Native acceptance remains blocked: the current selected viewer has
no asset URL and is inactive, so its first actual discovery attempt produced no
accepted bytes or sidecar. A historical READY tree or a previously observed data
URL cannot authorize capture from that state. Metadata-only artifacts remain
not_materialized. Issue414 remains open.

### Native selected-file acceptance, 2026-10-29

The previously inactive selected-file gate now passes on a freshly qualified
managed browser: `/src/components/timer.tsx`, 21,762 bytes, SHA-256
`9c806b0f60e392ad993cc2485d1631914a8100303027dff1896fee24f6753f06`.
The bytes match the fresh native ZIP member and retained sidecar. Real isolated
Archive APIs proved materialization, verified reuse, durable restart through an
injected foreground gate, and same-size tamper refusal. No provider recapture
or operational-store write occurred. App/version/revision remain null.
This accepts the selected generated-file slice; it does not complete referenced
uploads or installed/native history continuation. Issue414 remains open.
